import {main as gmailSend} from './send_mumbai_gmail_step';
import {main as inspect} from './inspect_mumbai_reply_imap';
import * as wmill from 'windmill-client';

const ROOT = 'f/old_leads_churn';
const lanes: Record<string,string> = {
  'sai@beforest.co':'rakesh','community@beforest.co':'rakesh',
  'yogesh@beforest.co':'yogesh','harish@beforest.co':'harish',
};
const ownerIds: Record<string,string> = {
  rakesh:'863791000000520050',yogesh:'863791000008149001',
  harish:'863791000009584001',
};

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

/** One pre-reserved step. Dry run is read-only; live path requires every release gate. */
export async function main(send_id: number, dry_run: boolean = true) {
  if (!Number.isSafeInteger(send_id) || send_id < 1) throw new Error('Invalid send id');
  const sql = wmill.datatable('main');
  const row = await sql`SELECT s.id,s.recipient_id,s.step,s.status,s.sender,s.recipient_email,
    s.attempt_count,r.email_normalized,r.zoho_lead_id,r.state,r.collective,r.next_step,r.next_due_at,
    r.owner_user_id,r.sender AS recipient_sender,r.last_verified_send_at,r.source_version,
    s.reserved_at,
    EXISTS (SELECT 1 FROM mumbai_nurture_source_links l
      WHERE l.recipient_id=r.id AND l.batch_id IS NOT NULL) AS imported_legacy,
    (SELECT count(DISTINCT l.recipient_id)::integer FROM mumbai_nurture_source_links l
      WHERE l.batch_id IS NOT NULL) AS legacy_cohort_size,
    (SELECT count(*)::integer FROM mumbai_nurture_sends prior
      WHERE prior.recipient_id=r.id AND prior.status='VERIFIED_SENT'
        AND prior.step IN (1,2)) AS verified_initial_steps
    FROM mumbai_nurture_sends s JOIN mumbai_nurture_recipients r ON r.id=s.recipient_id
    WHERE s.id=${send_id}`.fetchOne();
  if (!row) throw new Error('Send not found');
  if(!row.zoho_lead_id) return gmailSend(send_id,dry_run);
  const holds: string[] = [];
  const key = lanes[row.sender];
  if (!key) holds.push('UNKNOWN_SENDER_LANE');
  if (key && String(row.owner_user_id || '') !== ownerIds[key]) holds.push('LANE_OWNER_MISMATCH');
  if (row.recipient_sender !== row.sender) holds.push('SENDER_CHANGED');
  if (row.status !== 'RESERVED' || Number(row.attempt_count) !== 0) holds.push('NOT_FRESH_RESERVATION');
  if (row.state !== 'READY' || Number(row.next_step) !== Number(row.step)) holds.push('RECIPIENT_NOT_READY');
  if (row.collective !== 'Mumbai') holds.push('COLLECTIVE_CHANGED');
  if (!row.zoho_lead_id) holds.push('NO_CRM_LEAD');
  if (row.email_normalized !== row.recipient_email) holds.push('ADDRESS_CHANGED');
  if (!row.next_due_at || new Date(row.next_due_at).getTime() > Date.now()) holds.push('NOT_DUE');
  if (!row.reserved_at) holds.push('NO_CLAIM_TIMESTAMP');
  if (row.last_verified_send_at && Date.now() - new Date(row.last_verified_send_at).getTime() < 48*3600000)
    holds.push('BEFORE_48_HOURS');
  const stop = await sql`SELECT kind FROM mumbai_nurture_events WHERE recipient_id=${row.recipient_id}
    AND kind IN ('REPLY','OPTOUT','BOUNCE','SALES_HANDOFF') LIMIT 1`.fetchOne();
  if (stop) holds.push(`STOP_${stop.kind}`);
  const flags = await Promise.all(['delivery_enabled','reply_visibility_verified',
    'email_copy_approved','owner_handoff_verified','offer_claims_verified'].map(x => wmill.getVariable(`${ROOT}/${x}`)));
  if (flags.some(x => x !== 'true')) holds.push('RELEASE_GATES_CLOSED');
  let queuesEnabled='false';try{queuesEnabled=await wmill.getVariable(`${ROOT}/sender_queues_enabled`);}catch{}
  if(queuesEnabled==='true'&&await wmill.getVariable(`${ROOT}/sender_domain_verified`)!=='true')
    holds.push('DOMAIN_AUTHENTICATION_HOLD');
  // Verify exact copy and live CRM identity on both the preview and send paths.
  const emailNumber = row.step <= 3 ? '01' : row.step <= 5 ? '02' : '03';
  const copy = JSON.parse(await wmill.getVariable(`${ROOT}/approved_email_${emailNumber}_json`));
  if (!copy.subject || !copy.html || copy.version !== row.source_version)
    throw new Error('Approved step copy missing or version mismatch');
  let auth=await cachedZohoAuth(key);
  const fromResponse = await fetch(`${auth.api_domain}/crm/v8/settings/emails/actions/from_addresses`, {
    headers:{Authorization:`Zoho-oauthtoken ${auth.access_token}`},signal:AbortSignal.timeout(30000),
  });
  if (!fromResponse.ok) throw new Error(`Zoho From-address preflight HTTP ${fromResponse.status}`);
  const allowed = ((await fromResponse.json()).from_addresses || []).filter((x:any) =>
    String(x.email || '').toLowerCase() === row.sender);
  if (allowed.length !== 1 || (row.sender === 'community@beforest.co' && allowed[0].type !== 'org_email'))
    throw new Error('Sender not uniquely allowed or community identity changed');
  const leadResponse = await fetch(`${auth.api_domain}/crm/v8/Leads/${row.zoho_lead_id}`, {
    headers:{Authorization:`Zoho-oauthtoken ${auth.access_token}`},signal:AbortSignal.timeout(30000),
  });
  if (!leadResponse.ok) throw new Error(`Zoho Lead preflight HTTP ${leadResponse.status}`);
  const leads = (await leadResponse.json()).data || [];
  const lead = leads.length === 1 ? leads[0] : null;
  if (!lead || String(lead.Email || '').toLowerCase() !== row.recipient_email ||
      lead.Email_Opt_Out || !row.owner_user_id ||
      String(lead.Owner?.id || '') !== String(row.owner_user_id))
    throw new Error('Zoho Lead email, opt-out, or owner preflight mismatch');
  const [expectedCollective,expectedStatus] = await Promise.all([
    wmill.getVariable(`${ROOT}/zoho_collective_name`),
    wmill.getVariable(`${ROOT}/zoho_new_lead_status_api_value`),
  ]);
  const legacy = row.imported_legacy===true && Number(row.legacy_cohort_size)===79 &&
    Number(row.verified_initial_steps)===2 && row.sender==='sai@beforest.co';
  if (row.imported_legacy && !legacy) holds.push('LEGACY_SEND_JOURNAL_INCOMPLETE');
  const requiredStatus = legacy ? 'Not Contacted' : expectedStatus;
  if (lead.Collective_Name!==expectedCollective || lead.Lead_Status!==requiredStatus)
    holds.push('CRM_COLLECTIVE_OR_SALES_STATUS_CHANGED');
  let openActivityCount:number|null=null;
  {
    const activityResponse=await fetch(
      `${auth.api_domain}/crm/v8/Leads/${row.zoho_lead_id}/Activities_Chronological_View?fields=Subject&per_page=200`,{
        headers:{Authorization:`Zoho-oauthtoken ${auth.access_token}`},
        signal:AbortSignal.timeout(30000)});
    if (activityResponse.status===204) openActivityCount=0;
    else {
      if(!activityResponse.ok) throw new Error(`Zoho open-activity preflight HTTP ${activityResponse.status}`);
      const activities=await activityResponse.json();
      if(activities.info?.more_records) throw new Error('Zoho open activities paginated');
      openActivityCount=(activities.data||[]).length;
    }
    if(openActivityCount!==0) holds.push('OPEN_CRM_SALES_ACTIVITY');
  }
  const historyResponse=await fetch(`${auth.api_domain}/crm/v8/Leads/${row.zoho_lead_id}/Emails?type=sent_from_crm`,{
    headers:{Authorization:`Zoho-oauthtoken ${auth.access_token}`},
    signal:AbortSignal.timeout(30000)});
  if(!historyResponse.ok) throw new Error(`Zoho outbound history HTTP ${historyResponse.status}`);
  const history=historyResponse.status===204?{Emails:[]}:await historyResponse.json();
  if(history.info?.more_records) throw new Error('Zoho outbound history paginated');
  const unjournaled=(history.Emails||[]).filter((m:any)=>
    (m.to||[]).some((x:any)=>String(x.email||'').toLowerCase()===row.recipient_email) &&
    new Date(m.time).getTime()>new Date(row.last_verified_send_at||row.reserved_at).getTime());
  if(unjournaled.length) holds.push('NEW_CRM_OUTBOUND_AFTER_LAST_VERIFIED_STEP');
  const inbound = await inspect(Number(row.recipient_id),!dry_run);
  if (inbound?.safe_to_send !== true) holds.push(`INBOUND_${inbound?.action || 'UNCERTAIN'}`);
  const payload = {data:[{from:{email:row.sender},reply_to:{email:row.sender},
    org_email:row.sender === 'community@beforest.co',to:[{email:row.recipient_email}],
    subject:copy.subject,content:copy.html,mail_format:'html'}]};
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))
    .map(x => x.toString(16).padStart(2,'0')).join('');
  if (dry_run) return {dry_run:true,send_id,step:row.step,sender:row.sender,
    status:row.status,action:'NO_SEND',holds,copy_version:copy.version,
    payload_sha256:hash,crm_lead_verified:true,from_address_verified:true,
    inbound_action:inbound.action,crm_status_seen:lead.Lead_Status||null,
    crm_collective_seen:lead.Collective_Name||null,
    imported_legacy:legacy,open_crm_activity_count:openActivityCount,
    unjournaled_crm_outbound_count:unjournaled.length};
  if (holds.length) throw new Error(`Send blocked: ${holds.join(',')}`);
  // Recheck and mark ATTEMPTING in one transaction before network I/O. A timeout stays UNCERTAIN.
  const [globalCap,senderCap,rakeshCap,newCap] = (await Promise.all([
    'pilot_global_daily_cap','pilot_sender_daily_cap','pilot_rakesh_api_daily_cap',
    'pilot_new_admissions_daily_cap'].map(x => wmill.getVariable(`${ROOT}/${x}`)))).map(Number);
  if (![globalCap,senderCap,rakeshCap,newCap].every(Number.isSafeInteger))
    throw new Error('Invalid pilot cap configuration');
  auth=await cachedZohoAuth(key);
  if(await wmill.getVariable(`${ROOT}/delivery_enabled`)!=='true') throw new Error('Delivery release closed');
  if(queuesEnabled==='true'&&await wmill.getVariable(`${ROOT}/sender_domain_verified`)!=='true')
    throw new Error('Sender domain authentication held');
  const apiScope = `api:${key}`;
  const marked = await sql`WITH locked AS (
    SELECT s.id FROM mumbai_nurture_sends s JOIN mumbai_nurture_recipients r ON r.id=s.recipient_id
    WHERE s.id=${send_id} AND s.status='RESERVED' AND s.attempt_count=0
      AND s.reserved_at IS NOT NULL
      AND (s.reserved_at AT TIME ZONE 'Asia/Kolkata')::date=(now() AT TIME ZONE 'Asia/Kolkata')::date
      AND r.state='READY' AND r.collective='Mumbai'
      AND r.email_normalized=s.recipient_email AND r.sender=s.sender
      AND r.owner_user_id=${row.owner_user_id} AND r.next_step=s.step
      AND r.next_due_at<=now()
      AND (r.last_verified_send_at IS NULL OR r.last_verified_send_at<=now()-interval '48 hours')
      AND r.zoho_lead_id=${row.zoho_lead_id} AND r.source_version=s.sequence_version
      AND NOT EXISTS (SELECT 1 FROM mumbai_nurture_events e WHERE e.recipient_id=r.id
        AND e.kind IN ('REPLY','OPTOUT','BOUNCE','SALES_HANDOFF'))
      AND EXISTS (SELECT 1 FROM mumbai_nurture_daily_capacity c WHERE
        c.local_day=(now() AT TIME ZONE 'Asia/Kolkata')::date AND c.scope='global'
        AND c.reserved_count BETWEEN 1 AND ${globalCap})
      AND EXISTS (SELECT 1 FROM mumbai_nurture_daily_capacity c WHERE
        c.local_day=(now() AT TIME ZONE 'Asia/Kolkata')::date AND c.scope=${`from:${row.sender}`}
        AND c.reserved_count BETWEEN 1 AND ${senderCap})
      AND EXISTS (SELECT 1 FROM mumbai_nurture_daily_capacity c WHERE
        c.local_day=(now() AT TIME ZONE 'Asia/Kolkata')::date AND c.scope=${apiScope}
        AND c.reserved_count BETWEEN 1 AND ${key === 'rakesh' ? rakeshCap : senderCap})
      AND (s.step<>1 OR EXISTS (SELECT 1 FROM mumbai_nurture_daily_capacity c WHERE
        c.local_day=(now() AT TIME ZONE 'Asia/Kolkata')::date AND c.scope='new_admission'
        AND c.reserved_count BETWEEN 1 AND ${newCap}))
    FOR UPDATE OF s,r
  ) UPDATE mumbai_nurture_sends SET status='ATTEMPTING',attempt_count=1,
      attempted_at=now(),intended_payload_hash=${hash}
    WHERE id IN (SELECT id FROM locked) RETURNING id`.fetchOne();
  if (!marked) throw new Error('Send lost final eligibility race');
  let response: Response;
  try {
    response = await fetch(`${auth.api_domain}/crm/v8/Leads/${row.zoho_lead_id}/actions/send_mail`, {
      method:'POST',headers:{Authorization:`Zoho-oauthtoken ${auth.access_token}`,
        'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(30000),
    });
  } catch (error) {
    await sql`UPDATE mumbai_nurture_sends SET status='UNCERTAIN' WHERE id=${send_id} AND status='ATTEMPTING'`.execute();
    throw new Error(`Zoho Send Mail outcome uncertain; manual reconciliation required: ${String(error)}`);
  }
  const result = await response.json().catch(() => ({}));
  const accepted = response.ok && result?.data?.length === 1 &&
    result.data[0].code === 'SUCCESS' && result.data[0].status === 'success' &&
    !!result.data[0].details?.message_id;
  // Even a successful API response is only dispatch. Exact Emails log reconciliation is separate.
  await sql`UPDATE mumbai_nurture_sends SET status='UNCERTAIN',crm_message_id=${accepted?String(result.data[0].details.message_id):null}
    WHERE id=${send_id} AND status='ATTEMPTING'`.execute();
  return {dry_run:false,send_id,dispatch_accepted:accepted,status:'UNCERTAIN',
    next_action:'RECONCILE_EXACT_CRM_EMAIL_LOG_NO_AUTOMATIC_RETRY'};
}
