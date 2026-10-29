import {main as scan} from './scan_mumbai_bounces';
import {main as inspect} from './inspect_mumbai_reply_imap';
import {main as admit} from './admit_mumbai_candidate';
import {main as approve} from './record_mumbai_admission_approval';
import * as wmill from 'windmill-client';
const ROOT='f/old_leads_churn';
/** Harsha-authorized existing Mumbai cohort only. Reviews and admits; never sends. */
export async function main(execute:boolean=false,limit:number=10) {
 if(!Number.isInteger(limit)||limit<1||limit>10)throw new Error('Pilot bound 1..10');
 if(await wmill.getVariable(`${ROOT}/delivery_enabled`)==='true'&&await wmill.getVariable(`${ROOT}/legacy_continuation_authorized`)!=='true')throw new Error('Legacy continuation approval missing');
 const sql=wmill.datatable('main');
 const rows=await sql`SELECT r.id,r.email_normalized,r.next_step FROM mumbai_nurture_recipients r WHERE r.state='HELD' AND r.sender='sai@beforest.co' AND r.zoho_lead_id IS NOT NULL AND r.last_verified_send_at<=now()-interval '48 hours' AND r.stop_reason IN ('PENDING_REPLY_CHECK','HELD_EMAIL02_COPY_AND_REPLY_CHECK') AND EXISTS(SELECT 1 FROM mumbai_nurture_source_links l WHERE l.recipient_id=r.id AND l.batch_id IS NOT NULL AND l.source_present=true) AND NOT EXISTS(SELECT 1 FROM mumbai_nurture_events e WHERE e.recipient_id=r.id AND e.kind IN ('REPLY','OPTOUT','BOUNCE','SALES_HANDOFF','ADDRESS_CHANGE','COLLECTIVE_CHANGE','IDENTITY_HOLD')) ORDER BY r.updated_at,r.last_verified_send_at,r.id LIMIT 30`.fetch();
 if(!execute)return {action:'EXISTING_LEADS_ONLY_PREVIEW',proposed_ids:rows.slice(0,limit).map((r:any)=>({recipient_id:r.id,next_step:r.next_step})),email_sends:0};
 const bounce=await scan('sai@beforest.co',true);
 if(bounce.safe_to_continue!==true)return {action:'HOLD_SENDER_BOUNCE_CHECK',bounce,email_sends:0};
 const admitted=[],held=[];
 for(const r of rows) {
  if(admitted.length>=limit)break;
  await sql`UPDATE mumbai_nurture_recipients SET updated_at=now() WHERE id=${Number(r.id)} AND state='HELD'`.execute();
  const inbox=await inspect(Number(r.id),true);
  if(inbox.safe_to_send!==true){held.push({recipient_id:r.id,reason:inbox.action});continue;}
  const args={recipient_id:Number(r.id),reviewed_email:r.email_normalized,consent_confirmed:true,active_sales_clear:true,allow_crm_create:false};
  let check:any;try{check=await admit(args.recipient_id,true,args.reviewed_email,true,true,false);}catch{held.push({recipient_id:r.id,reason:'CRM_PREFLIGHT_FAILED'});continue;}
  if(check.action!=='WOULD_ADMIT'){held.push({recipient_id:r.id,reason:check.holds});continue;}
  const prior=await sql`SELECT reviewed_email FROM mumbai_nurture_admission_approvals WHERE recipient_id=${Number(r.id)}`.fetchOne();
  if(prior&&prior.reviewed_email!==r.email_normalized){held.push({recipient_id:r.id,reason:'APPROVAL_ADDRESS_CHANGED'});continue;}
  if(!prior) await approve(args.recipient_id,args.reviewed_email,'Automated CRM/inbox screening under Harsha explicit legacy launch authorization 2026-09-30; previously approved cohort only',true,true,false,'',false);
  let result:any;try{result=await admit(args.recipient_id,false,args.reviewed_email,true,true,false);}catch{held.push({recipient_id:r.id,reason:'ADMISSION_HELD_RECONCILE'});continue;}
  if(result.action==='ADMITTED_READY')admitted.push({recipient_id:r.id,next_step:r.next_step,lead_id:result.lead_id});else held.push({recipient_id:r.id,reason:result.holds});
 }
 return {action:'EXISTING_COHORT_REVIEWED_NO_SEND',admitted,held,email_sends:0,new_crm_leads:0};
}
