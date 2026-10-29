import * as wmill from 'windmill-client';
const ROOT='f/old_leads_churn';
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

export async function main() {
 const [layoutId,explorationLink,delivery]=await Promise.all(['zoho_lead_layout_id','zoho_exploration_link_mumbai','delivery_enabled'].map(k=>wmill.getVariable(`${ROOT}/${k}`)));
 const a=await cachedZohoAuth('rakesh');
 const r=await fetch(`${a.api_domain}/crm/v8/settings/layouts?module=Leads`,{headers:{Authorization:`Zoho-oauthtoken ${a.access_token}`},signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw new Error(`Layout access check HTTP ${r.status}`);
 const l=((await r.json()).layouts||[]).find((x:any)=>String(x.id)===layoutId);
 const available=l?.visible===true&&l?.status==='active'&&/^https:\/\//.test(explorationLink);
 const sql=wmill.datatable('main');
 await sql`CREATE TABLE IF NOT EXISTS mumbai_nurture_layout_gate(gate_key text PRIMARY KEY,available boolean NOT NULL,layout_id text NOT NULL,checked_at timestamptz NOT NULL DEFAULT now(),changed_at timestamptz NOT NULL DEFAULT now())`.execute();
 const prior=await sql`SELECT available FROM mumbai_nurture_layout_gate WHERE gate_key='rakesh_create'`.fetchOne();
 await sql`INSERT INTO mumbai_nurture_layout_gate(gate_key,available,layout_id) VALUES('rakesh_create',${available},${layoutId}) ON CONFLICT(gate_key) DO UPDATE SET available=excluded.available,layout_id=excluded.layout_id,checked_at=now(),changed_at=CASE WHEN mumbai_nurture_layout_gate.available IS DISTINCT FROM excluded.available THEN now() ELSE mumbai_nurture_layout_gate.changed_at END`.execute();
 const count=await sql`SELECT count(*)::integer n FROM mumbai_nurture_admission_approvals p JOIN mumbai_nurture_recipients q ON q.id=p.recipient_id WHERE q.state='HELD' AND q.email_normalized=p.reviewed_email AND q.source_version=p.source_version`.fetchOne();
 return {action:available?'LAYOUT_AVAILABLE_PENDING_REVIEW_AND_RELEASE':'QUEUED_WAITING_LAYOUT_ACCESS',layout_id:layoutId,layout_name:l?.name||null,layout_visible:l?.visible===true,layout_active:l?.status==='active',exploration_link_configured:true,availability_changed:prior?prior.available!==available:false,approved_pending:Number(count.n),delivery_enabled:delivery,crm_writes:0,sheet_writes:0,email_sends:0,uncertain_attempts_retried:false};
}
