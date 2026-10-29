import * as wmill from 'windmill-client';

const ROOT = 'f/old_leads_churn';

async function cachedZohoAuth(lane:string) {
 const path=`${ROOT}/zoho_${lane}_token_cache`;
 try { const c=JSON.parse(await wmill.getVariable(path));
  if(c.access_token&&c.api_domain==='https://www.zohoapis.in'&&Number(c.expires_at)>Date.now()+90000)return c;
 } catch {}
 const sql=wmill.datatable('main');
 await sql`CREATE TABLE IF NOT EXISTS mumbai_nurture_oauth_refresh_locks(lane text PRIMARY KEY,lease_until timestamptz NOT NULL)`.execute();
 const lease=await sql`INSERT INTO mumbai_nurture_oauth_refresh_locks(lane,lease_until) VALUES(${lane},now()+interval '2 minutes') ON CONFLICT(lane) DO UPDATE SET lease_until=excluded.lease_until WHERE mumbai_nurture_oauth_refresh_locks.lease_until<now() RETURNING lane`.fetchOne();
 if(!lease)throw new Error('OAuth refresh held by concurrency/backoff guard');
 const [client_id,client_secret,refresh_token]=await Promise.all(['client_id','client_secret','refresh_token'].map(k=>wmill.getVariable(`${ROOT}/zoho_${lane}_${k}`)));
 const res=await fetch('https://accounts.zoho.in/oauth/v2/token',{method:'POST',body:new URLSearchParams({client_id,client_secret,refresh_token,grant_type:'refresh_token'}),signal:AbortSignal.timeout(30000)});
 if(!res.ok)throw new Error(`OAuth refresh HTTP ${res.status}; held for backoff, no sends`);
 const c=await res.json();if(!c.access_token||c.api_domain!=='https://www.zohoapis.in')throw new Error('OAuth incomplete');
 c.expires_at=Date.now()+Math.min(Number(c.expires_in)||3600,3600)*1000-120000;
 await wmill.setVariable(path,JSON.stringify(c),true,'Encrypted reusable Zoho API token. Never print.');
 await sql`UPDATE mumbai_nurture_oauth_refresh_locks SET lease_until=now() WHERE lane=${lane}`.execute();
 return c;
}

/** CRM Note preview for a verified, already recorded reply. Never sends a message. */
export async function main(event_key: string, dry_run: boolean = true) {
  if (!/^[a-z0-9:_-]{8,180}$/i.test(event_key)) throw new Error('Invalid event key');
  if(await wmill.getVariable(`${ROOT}/crm_handoff_writes_enabled`)!=='true')
    return {dry_run,event_key,action:'AWAITING_HARSHA_REVIEW',crm_write:false};
  const sql = wmill.datatable('main');
  const row = await sql`SELECT e.event_key,e.kind,e.source,e.occurred_at,e.evidence,
    r.id recipient_id,
    CASE WHEN e.event_key='imap:qa:seshu:12:38181' THEN it.crm_record_id
      ELSE r.zoho_lead_id END zoho_lead_id,
    CASE WHEN e.event_key='imap:qa:seshu:12:38181' THEN '863791000000505021'
      ELSE r.owner_user_id END owner_user_id,
    r.email_normalized,r.state,it.status qa_send_status,it.crm_module qa_module,
    ir.imap_uid qa_reply_uid
    FROM mumbai_nurture_events e JOIN mumbai_nurture_recipients r ON r.id=e.recipient_id
    LEFT JOIN mumbai_nurture_internal_tests it ON it.qa_key=e.evidence->>'qa_key'
    LEFT JOIN mumbai_nurture_internal_replies ir ON ir.qa_key=it.qa_key
    WHERE e.event_key=${event_key}`.fetchOne();
  if (!row || row.kind !== 'REPLY' || row.state !== 'SUPPRESSED' || !row.zoho_lead_id)
    throw new Error('No verified suppressed CRM Lead reply event');
  const marker = `Mumbai nurture reply ${event_key}`;
  if (dry_run) return {dry_run:true,recipient_id:row.recipient_id,event_key,
    action:'WOULD_VERIFY_OR_CREATE_ONE_CRM_NOTE',marker,owner_user_id:row.owner_user_id};
  const internalQa=event_key==='imap:qa:seshu:12:38181' &&
    Number(row.recipient_id)===278 &&
    row.email_normalized==='seshu@beforest.co' &&
    String(row.zoho_lead_id)==='863791000009577032' &&
    String(row.owner_user_id)==='863791000000505021' &&
    row.source==='imap_internal_test' && row.qa_send_status==='VERIFIED' &&
    row.qa_module==='Leads' && Number(row.qa_reply_uid)===38181;
  if (!internalQa && await wmill.getVariable(`${ROOT}/owner_handoff_verified`) !== 'true')
    throw new Error('Owner handoff release gate closed');
  const auth=await cachedZohoAuth('rakesh');
  if(internalQa) {
    const leadResponse=await fetch(`${auth.api_domain}/crm/v8/Leads/${row.zoho_lead_id}`,{
      headers:{Authorization:`Zoho-oauthtoken ${auth.access_token}`},
      signal:AbortSignal.timeout(30000)});
    if(!leadResponse.ok) throw new Error('Internal QA Lead owner read unavailable');
    const lead=(await leadResponse.json()).data?.[0];
    if(String(lead?.Email||'').toLowerCase()!==row.email_normalized||
      String(lead?.Owner?.id||'')!==String(row.owner_user_id))
      throw new Error('Internal QA Lead email/owner changed');
  }
  const url = `${auth.api_domain}/crm/v8/Leads/${row.zoho_lead_id}/Notes`;
  const headers = {Authorization:`Zoho-oauthtoken ${auth.access_token}`};
  const find = async () => {
    const response = await fetch(`${url}?fields=Note_Title,Note_Content,Parent_Id`,
      {headers,signal:AbortSignal.timeout(30000)});
    if (!response.ok) throw new Error(`Zoho Notes read HTTP ${response.status}`);
    if(response.status===204) return [];
    const result=await response.json();
    if(result.info?.more_records) throw new Error('Zoho Notes list paginated');
    return (result.data || []).filter((n:any) =>
      String(n.Note_Title || '') === marker);
  };
  const existing = await find();
  if (existing.length > 1) throw new Error('Duplicate CRM Notes require manual review');
  if(existing.length===1) {
    await sql`INSERT INTO mumbai_nurture_notes
      (event_key,recipient_id,status,crm_note_id,verified_at)
      VALUES (${event_key},${row.recipient_id},'VERIFIED',${String(existing[0].id)},now())
      ON CONFLICT (event_key) DO UPDATE SET status='VERIFIED',
        crm_note_id=EXCLUDED.crm_note_id,verified_at=now()
      WHERE mumbai_nurture_notes.crm_note_id IS NULL OR
        mumbai_nurture_notes.crm_note_id=EXCLUDED.crm_note_id`.execute();
    return {dry_run:false,event_key,recipient_id:row.recipient_id,
      note_id:existing[0].id,status:'CRM_NOTE_VERIFIED',read_back:true};
  }
  if (!existing.length) {
    const lease=await sql`INSERT INTO mumbai_nurture_notes
      (event_key,recipient_id,status) VALUES
      (${event_key},${row.recipient_id},'ATTEMPTING')
      ON CONFLICT (event_key) DO NOTHING RETURNING event_key`.fetchOne();
    if(!lease) throw new Error('CRM Note attempt already exists; reconcile before retry');
    const body = {data:[{Note_Title:marker,Note_Content:
      `Verified reply from ${row.email_normalized} at ${new Date(row.occurred_at).toISOString()}. `+
      `Nurture stopped. Source: ${row.source}. Owner to follow up in CRM.`}]};
    try {
      const response = await fetch(url,{method:'POST',headers:{...headers,'Content-Type':'application/json'},
        body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
      if (!response.ok) throw new Error(`Zoho Note HTTP ${response.status}`);
    } catch {
      await sql`UPDATE mumbai_nurture_notes SET status='UNCERTAIN'
        WHERE event_key=${event_key} AND status='ATTEMPTING'`.execute();
      throw new Error('CRM Note outcome uncertain; exact CRM read required before retry');
    }
    await sql`UPDATE mumbai_nurture_notes SET status='UNCERTAIN'
      WHERE event_key=${event_key} AND status='ATTEMPTING'`.execute();
  }
  const verified = await find();
  if (verified.length !== 1) throw new Error('Zoho Note read-back ambiguous');
  await sql`UPDATE mumbai_nurture_notes SET status='VERIFIED',
    crm_note_id=${String(verified[0].id)},verified_at=now()
    WHERE event_key=${event_key} AND status='UNCERTAIN'`.execute();
  const note=await sql`SELECT status,crm_note_id FROM mumbai_nurture_notes
    WHERE event_key=${event_key}`.fetchOne();
  if(note?.status!=='VERIFIED'||String(note.crm_note_id)!==String(verified[0].id))
    throw new Error('CRM Note journal read-back failed');
  return {dry_run:false,event_key,recipient_id:row.recipient_id,note_id:verified[0].id,
    status:'CRM_NOTE_VERIFIED',owner_user_id:row.owner_user_id};
}
