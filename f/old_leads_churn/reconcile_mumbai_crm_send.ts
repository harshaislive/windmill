import {main as reconcileGmail} from './reconcile_mumbai_gmail_send';
import * as wmill from 'windmill-client';

const ROOT = 'f/old_leads_churn';
const owner = (sender: string) => sender === 'yogesh@beforest.co' ? 'yogesh' :
  sender === 'harish@beforest.co' ? 'harish' : 'rakesh';

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

async function token(lane: string) { return cachedZohoAuth(lane); }

/** Read-only reconciliation. Never retries an attempted or uncertain send. */
export async function main(send_id: number, dry_run: boolean = true) {
  if (!Number.isSafeInteger(send_id) || send_id < 1) throw new Error('Invalid send id');
  const sql = wmill.datatable('main');
  const row = await sql`SELECT s.id,s.recipient_id,s.step,s.status,s.sender,s.recipient_email,
    s.crm_message_id,s.transport,s.attempted_at,r.zoho_lead_id,r.state,r.source_version
    FROM mumbai_nurture_sends s JOIN mumbai_nurture_recipients r ON r.id=s.recipient_id
    WHERE s.id=${send_id}`.fetchOne();
  if (!row) throw new Error('Send not found');
  if(row.transport==='gmail_smtp') return reconcileGmail(send_id,dry_run);
  if (!row.zoho_lead_id) throw new Error('CRM send has no Lead');
  if (!['ATTEMPTING','UNCERTAIN','VERIFIED_SENT'].includes(row.status))
    return {dry_run,send_id,status:row.status,action:'NO_SEND_ATTEMPT_TO_RECONCILE'};
  const auth = await token(owner(row.sender));
  const response = await fetch(`${auth.api_domain}/crm/v8/Leads/${row.zoho_lead_id}/Emails?type=sent_from_crm`, {
    headers:{Authorization:`Zoho-oauthtoken ${auth.access_token}`}, signal:AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Zoho Emails HTTP ${response.status}`);
  const emails = (await response.json()).Emails || [];
  const matches = emails.filter((x: any) => String(x.from?.email || '').toLowerCase() === row.sender &&
    (x.to || []).some((y: any) => String(y.email || '').toLowerCase() === row.recipient_email) &&
    (!row.crm_message_id || String(x.message_id) === String(row.crm_message_id)) &&
    (!row.attempted_at || new Date(x.time).getTime() >= new Date(row.attempted_at).getTime() - 60000));
  if (matches.length !== 1) return {dry_run,send_id,status:row.status,
    matches:matches.length,action:'HOLD_UNCERTAIN_FOR_MANUAL_REVIEW'};
  const message = matches[0];
  if (dry_run) return {dry_run:true,send_id,status:row.status,matches:1,
    action:'WOULD_VERIFY_EXACT_CRM_MESSAGE',crm_message_id:message.message_id};
  if (row.status === 'VERIFIED_SENT') return {dry_run:false,send_id,status:row.status,
    crm_message_id:row.crm_message_id,action:'ALREADY_VERIFIED'};
  // Only an exact single CRM message can advance the journal. No send is made here.
  const updated = await sql`WITH accepted AS (
    UPDATE mumbai_nurture_sends SET status='VERIFIED_SENT',crm_message_id=${String(message.message_id)},
      verified_at=${String(message.time)}::timestamptz
    WHERE id=${send_id} AND status IN ('ATTEMPTING','UNCERTAIN') AND
      (crm_message_id IS NULL OR crm_message_id=${String(message.message_id)}) RETURNING recipient_id,step
  ), recipient AS (
    UPDATE mumbai_nurture_recipients SET last_verified_send_at=${String(message.time)}::timestamptz,
      next_step=CASE WHEN next_step=6 THEN NULL ELSE next_step+1 END,
      next_due_at=CASE WHEN next_step=6 THEN NULL ELSE ${String(message.time)}::timestamptz+interval '48 hours' END,
      state=CASE WHEN next_step=6 THEN 'COMPLETE' ELSE state END,updated_at=now()
    WHERE id IN (SELECT recipient_id FROM accepted) AND state='READY'
      AND next_step=(SELECT step FROM accepted) RETURNING id
  ) SELECT (SELECT count(*)::integer FROM accepted) send_updated,
    (SELECT count(*)::integer FROM recipient) recipient_advanced`.fetchOne();
  const verify = await sql`SELECT status,crm_message_id FROM mumbai_nurture_sends WHERE id=${send_id}`.fetchOne();
  if (verify?.status !== 'VERIFIED_SENT' || verify.crm_message_id !== String(message.message_id))
    throw new Error('CRM send reconciliation read-back failed');
  return {dry_run:false,send_id,status:verify.status,crm_message_id:verify.crm_message_id,
    recipient_advanced:Number(updated.recipient_advanced)};
}
