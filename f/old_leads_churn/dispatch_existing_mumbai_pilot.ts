import * as wmill from 'windmill-client';
const ROOT='f/old_leads_churn';
/** Bounded existing-Sai dispatch. Exact CRM reconciliation; never retries uncertain sends. */
export async function main(execute:boolean=false,limit:number=10) {
 if(!Number.isInteger(limit)||limit<1||limit>10)throw new Error('Pilot limit1..10');
 const sql=wmill.datatable('main');
 if(!execute)return {preview:await sql`SELECT id,zoho_lead_id,sender,next_step FROM mumbai_nurture_recipients WHERE state='READY' AND sender='sai@beforest.co' AND next_due_at<=now() ORDER BY next_due_at,id LIMIT ${limit}`.fetch(),email_sends:0};
 if(await wmill.getVariable(`${ROOT}/delivery_enabled`)!=='true')throw new Error('Delivery closed');
 const maton=await wmill.getVariable(`${ROOT}/harsha_maton_api_key`);
 const response=await fetch('https://api.maton.ai/google-sheets/v4/spreadsheets/1LojS6cGdt8JJl0NbOONwG7wf9OXjWL4qfezbYT8sL7w/values/'+encodeURIComponent("'Mumbai Nurture Tracker'!A1:Z5000"),{headers:{Authorization:`Bearer ${maton}`,'Maton-Connection':'6463e553-eab2-4cb9-a46f-b1a5665c0031'}});
 if(!response.ok)throw new Error(`Tracker backup HTTP ${response.status}`);
 await sql`CREATE TABLE IF NOT EXISTS mumbai_nurture_launch_audits(run_id text PRIMARY KEY,tracker_backup jsonb,results jsonb,created_at timestamptz DEFAULT now())`.execute();
 const runId=crypto.randomUUID();await sql`INSERT INTO mumbai_nurture_launch_audits(run_id,tracker_backup) VALUES(${runId},${JSON.stringify(await response.json())}::jsonb)`.execute();
 const caps=(await Promise.all(['pilot_global_daily_cap','pilot_sender_daily_cap','pilot_rakesh_api_daily_cap','pilot_new_admissions_daily_cap'].map(k=>wmill.getVariable(`${ROOT}/${k}`)))).map(Number);
 const sends=[];
 for(let i=0;i<limit;i++) {
  const claim=await sql`SELECT mumbai_nurture_claim_step(now(),${caps[0]}::integer,${caps[1]}::integer,${caps[2]}::integer,${caps[3]}::integer,false,ARRAY['sai@beforest.co']::text[]) result`.fetchOne();
  if(!claim.result.claimed)break;
  const sendId=Number(claim.result.send_id);
  try {
   const sent=await wmill.runScriptByPath(`${ROOT}/send_mumbai_nurture_step`,{send_id:sendId,dry_run:false});
   const verified=await wmill.runScriptByPath(`${ROOT}/reconcile_mumbai_crm_send`,{send_id:sendId,dry_run:false});
   sends.push({send_id:sendId,dispatch_accepted:sent.dispatch_accepted,status:verified.status});
   if(verified.status!=='VERIFIED_SENT')break;
  } catch {
   const cancelled=await sql`UPDATE mumbai_nurture_sends SET status='CANCELLED' WHERE id=${sendId} AND status='RESERVED' AND attempt_count=0 RETURNING recipient_id`.fetchOne();
   if(cancelled)await sql`UPDATE mumbai_nurture_recipients SET state='HELD',stop_reason='SEND_PREFLIGHT_REVIEW',next_due_at=NULL WHERE id=${cancelled.recipient_id} AND state='READY'`.execute();
   sends.push({send_id:sendId,status:cancelled?'PRE_SEND_HELD':'UNCERTAIN_NO_RETRY'});
   if(!cancelled)break;
  }
 }
 const tracker=await wmill.runScriptByPath(`${ROOT}/mirror_mumbai_tracker`,{dry_run:false});
 const result={run_id:runId,sends,verified_sends:sends.filter((r:any)=>r.status==='VERIFIED_SENT').length,tracker};
 await sql`UPDATE mumbai_nurture_launch_audits SET results=${JSON.stringify(result)}::jsonb WHERE run_id=${runId}`.execute();
 return result;
}
