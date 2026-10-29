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

async function zoho() {return cachedZohoAuth('rakesh');}

/** Owner-assigned CRM Task fallback for one verified reply event; no prospect message. */
export async function main(event_key: string, dry_run: boolean = true) {
  if (!/^[a-z0-9:_-]{8,180}$/i.test(event_key)) throw new Error('Invalid event key');
  if(await wmill.getVariable(`${ROOT}/crm_handoff_writes_enabled`)!=='true')
    return {dry_run,event_key,action:'AWAITING_HARSHA_REVIEW',crm_write:false};
  const sql = wmill.datatable('main');
  const row = await sql`SELECT e.event_key,e.kind,e.source,e.occurred_at,
    r.id recipient_id,
    CASE WHEN e.event_key='imap:qa:seshu:12:38181' THEN it.crm_record_id
      ELSE r.zoho_lead_id END zoho_lead_id,
    CASE WHEN e.event_key='imap:qa:seshu:12:38181' THEN '863791000000505021'
      ELSE r.owner_user_id END owner_user_id,
    r.email_normalized,r.state,it.status qa_send_status,it.crm_module qa_module,
    ir.imap_uid qa_reply_uid,
    h.status handoff_status,h.crm_task_id
    FROM mumbai_nurture_events e JOIN mumbai_nurture_recipients r ON r.id=e.recipient_id
    LEFT JOIN mumbai_nurture_internal_tests it ON it.qa_key=e.evidence->>'qa_key'
    LEFT JOIN mumbai_nurture_internal_replies ir ON ir.qa_key=it.qa_key
    LEFT JOIN mumbai_nurture_handoffs h ON h.event_key=e.event_key
    WHERE e.event_key=${event_key}`.fetchOne();
  if (!row || row.kind !== 'REPLY' || row.state !== 'SUPPRESSED' ||
      !row.zoho_lead_id || !row.owner_user_id)
    throw new Error('Confirmed suppressed reply with exact Lead and owner required');
  const subject = `Mumbai reply follow-up [${event_key}]`;
  if (subject.length > 255) throw new Error('Task subject too long');
  const auth = await zoho();
  const headers = {Authorization:`Zoho-oauthtoken ${auth.access_token}`};
  const criteria = `(Subject:equals:${subject})`;
  const response = await fetch(`${auth.api_domain}/crm/v8/Tasks/search?criteria=${encodeURIComponent(criteria)}&per_page=200`, {
    headers,signal:AbortSignal.timeout(30000),
  });
  if (response.status !== 204 && !response.ok)
    throw new Error(`Zoho CRM Task search HTTP ${response.status}`);
  const found = response.status === 204 ? [] : ((await response.json()).data || []);
  const exact = found.filter((t:any) => String(t.Subject) === subject);
  if (exact.length > 1 || exact.some((t:any) =>
      String(t.What_Id?.id || '') !== String(row.zoho_lead_id) ||
      String(t.Owner?.id || '') !== String(row.owner_user_id)))
    throw new Error('CRM Task subject collision or duplicate requires manual review');
  if (dry_run) return {dry_run:true,event_key,recipient_id:row.recipient_id,
    lead_id:row.zoho_lead_id,owner_user_id:row.owner_user_id,subject,
    exact_existing_tasks:exact.length,journal_status:row.handoff_status || null,
    action:exact.length ? 'WOULD_VERIFY_EXISTING_TASK' : 'WOULD_CREATE_ONE_OWNER_TASK'};
  // This variable is deliberately absent until a controlled internal CRM test succeeds.
  const internalQa=event_key==='imap:qa:seshu:12:38181' &&
    Number(row.recipient_id)===278 &&
    row.email_normalized==='seshu@beforest.co' &&
    String(row.zoho_lead_id)==='863791000009577032' &&
    String(row.owner_user_id)==='863791000000505021' &&
    row.source==='imap_internal_test' && row.qa_send_status==='VERIFIED' &&
    row.qa_module==='Leads' && Number(row.qa_reply_uid)===38181;
  if (!internalQa && await wmill.getVariable(`${ROOT}/crm_handoff_writes_enabled`) !== 'true')
    throw new Error('CRM handoff write gate closed');
  if (row.handoff_status === 'ATTEMPTING' || row.handoff_status === 'UNCERTAIN') {
    // Adopt an exact live result without issuing another CRM creation request.
    if(exact.length===1) {
      const taskId=String(exact[0].id);
      await sql`UPDATE mumbai_nurture_handoffs SET status='VERIFIED',
        crm_task_id=${taskId},verified_at=now()
        WHERE event_key=${event_key} AND status IN ('ATTEMPTING','UNCERTAIN')
          AND (crm_task_id IS NULL OR crm_task_id=${taskId})`.execute();
      const check=await sql`SELECT status,crm_task_id FROM mumbai_nurture_handoffs
        WHERE event_key=${event_key}`.fetchOne();
      if(check?.status!=='VERIFIED'||String(check.crm_task_id)!==taskId)
        throw new Error('Exact CRM Task adoption read-back failed');
      return {dry_run:false,event_key,status:'VERIFIED',crm_task_id:taskId,
        action:'EXACT_EXISTING_TASK_RECONCILED_NO_CREATE'};
    }
    throw new Error('Prior CRM Task attempt uncertain; manual reconciliation required');
  }
  if (row.handoff_status === 'VERIFIED') {
    if (exact.length !== 1 || String(exact[0].id) !== String(row.crm_task_id))
      throw new Error('Verified CRM Task journal and live read differ');
    return {dry_run:false,event_key,status:'VERIFIED',crm_task_id:row.crm_task_id};
  }
  if (exact.length === 1) throw new Error('Existing CRM Task lacks journal; manual adoption required');
  const reserved = await sql`INSERT INTO mumbai_nurture_handoffs
    (event_key,recipient_id,status) VALUES (${event_key},${row.recipient_id},'RESERVED')
    ON CONFLICT (event_key) DO NOTHING RETURNING event_key`.fetchOne();
  if (!reserved) throw new Error('Handoff already reserved; no duplicate Task attempt');
  const marked = await sql`UPDATE mumbai_nurture_handoffs SET status='ATTEMPTING',attempted_at=now()
    WHERE event_key=${event_key} AND status='RESERVED' RETURNING event_key`.fetchOne();
  if (!marked) throw new Error('Handoff reservation state changed');
  const payload = {data:[{Subject:subject,Owner:{id:row.owner_user_id},
    What_Id:{id:row.zoho_lead_id},'$se_module':'Leads',Status:'Not Started',
    Description:`Reply from ${row.email_normalized} at ${new Date(row.occurred_at).toISOString()}. Nurture stopped. Review the Lead and reply personally. Event ${event_key}.`,
    Send_Notification_Email:false}],trigger:[]};
  let created: any;
  try {
    const post = await fetch(`${auth.api_domain}/crm/v8/Tasks`,{
      method:'POST',headers:{...headers,'Content-Type':'application/json'},
      body:JSON.stringify(payload),signal:AbortSignal.timeout(30000),
    });
    created = await post.json().catch(() => ({}));
    if (!post.ok || created?.data?.[0]?.code !== 'SUCCESS' || !created?.data?.[0]?.details?.id)
      throw new Error(`CRM Task response HTTP ${post.status}; outcome uncertain`);
  } catch (error) {
    await sql`UPDATE mumbai_nurture_handoffs SET status='UNCERTAIN'
      WHERE event_key=${event_key} AND status='ATTEMPTING'`.execute();
    throw new Error(`CRM Task outcome uncertain; no automatic retry: ${String(error)}`);
  }
  const taskId = String(created.data[0].details.id);
  const check = await fetch(`${auth.api_domain}/crm/v8/Tasks/${taskId}`,{
    headers,signal:AbortSignal.timeout(30000),
  });
  if (!check.ok) throw new Error('CRM Task created but read-back uncertain');
  const live = (await check.json()).data?.[0];
  if (!live || live.Subject !== subject || String(live.What_Id?.id || '') !== String(row.zoho_lead_id) ||
      String(live.Owner?.id || '') !== String(row.owner_user_id))
    throw new Error('CRM Task created but Lead/owner read-back mismatch');
  await sql`UPDATE mumbai_nurture_handoffs SET status='VERIFIED',crm_task_id=${taskId},
    verified_at=now() WHERE event_key=${event_key} AND status='ATTEMPTING'`.execute();
  const journal = await sql`SELECT status,crm_task_id FROM mumbai_nurture_handoffs
    WHERE event_key=${event_key}`.fetchOne();
  if (journal?.status !== 'VERIFIED' || journal.crm_task_id !== taskId)
    throw new Error('CRM Task journal read-back failed');
  return {dry_run:false,event_key,status:'VERIFIED',crm_task_id:taskId,
    lead_id:row.zoho_lead_id,owner_user_id:row.owner_user_id};
}
