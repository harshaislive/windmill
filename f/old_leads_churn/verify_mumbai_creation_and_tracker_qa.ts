import * as wmill from 'windmill-client';
const ROOT='f/old_leads_churn', SHEET='1LojS6cGdt8JJl0NbOONwG7wf9OXjWL4qfezbYT8sL7w';
const cases=[['rakesh','sai@beforest.co','Rakesh','863791000000520050'],['community','community@beforest.co','Rakesh','863791000000520050'],['yogesh','yogesh@beforest.co','Yogesh','863791000008149001'],['harish','harish@beforest.co','Harish','863791000009584001']];
/** Approved internal-only CRM creation and real tracker append QA. No Send Mail calls. */
export async function main(execute:boolean=false,cleanup_sheet:boolean=false,rearm_rejected_first:boolean=false) {
 if(await wmill.getVariable(`${ROOT}/delivery_enabled`)!=='false') throw new Error('Delivery must remain disabled');
 if(!execute) return {plan:cases.map(c=>({sender:c[1],owner:c[2],email:`harsha+wmqa-${c[0]}-20260930@beforest.co`,label:'INTERNAL QA DO NOT CONTACT'})),crm_create:4,prospect_send:0,tracker_append:4,tracker_cleanup:true};
 const sql=wmill.datatable('main');
 await sql`CREATE TABLE IF NOT EXISTS mumbai_nurture_creation_qa (qa_key text PRIMARY KEY,recipient_id bigint,lead_id text,status text NOT NULL,proof jsonb,created_at timestamptz NOT NULL DEFAULT now())`.execute();
 const key=await wmill.getVariable(`${ROOT}/harsha_maton_api_key`);
 const base=`https://api.maton.ai/google-sheets/v4/spreadsheets/${SHEET}`;
 const headers={Authorization:`Bearer ${key}`,'Maton-Connection':'6463e553-eab2-4cb9-a46f-b1a5665c0031','Content-Type':'application/json'};
 const read=async()=>{const res=await fetch(`${base}/values/${encodeURIComponent("'Mumbai Nurture Tracker'!A1:Z5000")}`,{headers,signal:AbortSignal.timeout(30000)});if(!res.ok)throw new Error(`Sheet read HTTP ${res.status}`);return (await res.json()).values||[];};
 if(cleanup_sheet) {
  const saved=await sql`SELECT proof FROM mumbai_nurture_creation_qa WHERE qa_key='tracker-append-20260930' AND status='VERIFIED'`.fetchOne();
  if(!saved)throw new Error('No verified append proof');
  const before=saved.proof.before, appended=saved.proof.appended;
  const live=await read();
  if(JSON.stringify(live)!==JSON.stringify(appended))throw new Error('Concurrent Sheet change; no cleanup');
  const meta=await fetch(`${base}?fields=sheets(properties)`,{headers});if(!meta.ok)throw new Error('Sheet metadata failure');
  const tab=(await meta.json()).sheets.find((x:any)=>x.properties.title==='Mumbai Nurture Tracker');
  const res=await fetch(`${base}:batchUpdate`,{method:'POST',headers,body:JSON.stringify({requests:[{deleteDimension:{range:{sheetId:tab.properties.sheetId,dimension:'ROWS',startIndex:before.length,endIndex:appended.length}}}]}),signal:AbortSignal.timeout(30000)});
  if(!res.ok)throw new Error(`Cleanup outcome uncertain HTTP ${res.status}`);
  if(JSON.stringify(await read())!==JSON.stringify(before))throw new Error('Cleanup exact read-back mismatch');
  await sql`UPDATE mumbai_nurture_source_links SET source_present=false WHERE sheet_name='INTERNAL_QA_20260930'`.execute();
  await sql`UPDATE mumbai_nurture_creation_qa SET status='VERIFIED_CLEANED' WHERE qa_key='tracker-append-20260930'`.execute();
  return {sheet_qa_rows_removed:appended.length-before.length,original_rows_preserved:before.length-1,exact_read_back:true,prospect_send:0};
 }
 const initial=await read();
 await sql`INSERT INTO mumbai_nurture_creation_qa(qa_key,status,proof) VALUES('tracker-before-20260930','BACKUP',${JSON.stringify({before:initial})}::jsonb) ON CONFLICT DO NOTHING`.execute();
 if(rearm_rejected_first) {
  const [client_id,client_secret,refresh_token]=await Promise.all(['client_id','client_secret','refresh_token'].map(k=>wmill.getVariable(`${ROOT}/zoho_rakesh_${k}`)));
  const t=await fetch('https://accounts.zoho.in/oauth/v2/token',{method:'POST',body:new URLSearchParams({client_id,client_secret,refresh_token,grant_type:'refresh_token'})}); const a=await t.json();
  const r=await fetch(`${a.api_domain}/crm/v8/Leads/search?email=${encodeURIComponent('harsha+wmqa-rakesh-20260930@beforest.co')}`,{headers:{Authorization:`Zoho-oauthtoken ${a.access_token}`}});
  if(r.status!==204)throw new Error('Rearm requires exact empty CRM search; no create');
  const q=await sql`SELECT recipient_id FROM mumbai_nurture_creation_qa WHERE qa_key='create-rakesh-20260930' AND status='ATTEMPTING'`.fetchOne();
  if(!q)throw new Error('Rearm no matching failed test');
  await sql`UPDATE mumbai_nurture_recipients SET state='HELD',stop_reason='PENDING_CRM_IDENTITY_AND_SUPPRESSION_CHECKS' WHERE id=${q.recipient_id} AND zoho_lead_id IS NULL AND stop_reason='INTERNAL_QA_RECONCILE_NO_RETRY'`.execute();
  await sql`UPDATE mumbai_nurture_creation_qa SET status='REARMED_AFTER_EMPTY_SEARCH',proof='{"prior_rejected_missing_required_url":true,"exact_crm_search_empty":true}'::jsonb WHERE qa_key='create-rakesh-20260930'`.execute();
 }
 const output=[];
 for(const c of cases) {
  const qaKey=`create-${c[0]}-20260930`,email=`harsha+wmqa-${c[0]}-20260930@beforest.co`;
  const prior=await sql`SELECT * FROM mumbai_nurture_creation_qa WHERE qa_key=${qaKey}`.fetchOne();
  if(prior&&prior.status!=='REARMED_AFTER_EMPTY_SEARCH') {if(prior.status==='VERIFIED'){output.push(prior.proof);continue;}throw new Error(`Uncertain existing QA ${qaKey}; no retry`);}
  const row=prior?{id:prior.recipient_id}:await sql`INSERT INTO mumbai_nurture_recipients(email_normalized,person_name,sender,owner_name,owner_user_id,collective,state,stop_reason,next_step,source_version) VALUES(${email},${`INTERNAL QA DO NOT CONTACT ${c[0]} 20260930`},${c[1]},${c[2]},${c[3]},'Mumbai','HELD','PENDING_CRM_IDENTITY_AND_SUPPRESSION_CHECKS',1,'mumbai-v1') RETURNING id`.fetchOne();
  const id=Number(row.id);
  await sql`INSERT INTO mumbai_nurture_source_links(deal_id,recipient_id,spreadsheet_id,sheet_name,source_present) VALUES(${`INTERNAL-QA-${c[0]}-20260930`},${id},${SHEET},'INTERNAL_QA_20260930',true) ON CONFLICT DO NOTHING`.execute();
  await sql`INSERT INTO mumbai_nurture_creation_qa(qa_key,recipient_id,status) VALUES(${qaKey},${id},'ATTEMPTING') ON CONFLICT(qa_key) DO UPDATE SET status='ATTEMPTING'`.execute();
  try {
   const result=await wmill.runScriptByPath(`${ROOT}/admit_mumbai_candidate`,{recipient_id:id,dry_run:false,reviewed_email:email,consent_confirmed:true,active_sales_clear:true,allow_crm_create:true,company_for_new_lead:'Beforest INTERNAL TEST - DO NOT CONTACT',exploration_link:`https://docs.google.com/spreadsheets/d/${SHEET}/edit`});
   if(result.action!=='ADMITTED_READY'||result.owner_record_read_back!==true)throw new Error('Admission failed safe review');
   await sql`UPDATE mumbai_nurture_recipients SET state='SUPPRESSED',stop_reason='INTERNAL_QA_DO_NOT_CONTACT',next_due_at=NULL WHERE id=${id}`.execute();
   await sql`UPDATE mumbai_nurture_creation_qa SET status='VERIFIED',lead_id=${result.lead_id},proof=${JSON.stringify(result)}::jsonb WHERE qa_key=${qaKey}`.execute();
   output.push(result);
  } catch {await sql`UPDATE mumbai_nurture_recipients SET state='SUPPRESSED',stop_reason='INTERNAL_QA_RECONCILE_NO_RETRY',next_due_at=NULL WHERE id=${id}`.execute();throw new Error(`QA ${qaKey} requires reconciliation; no automatic retry`);}
 }
 const saved=await sql`SELECT proof FROM mumbai_nurture_creation_qa WHERE qa_key='tracker-before-20260930'`.fetchOne();
 if(JSON.stringify(await read())!==JSON.stringify(saved.proof.before))throw new Error('Sheet drift before append');
 const preview=await wmill.runScriptByPath(`${ROOT}/mirror_mumbai_tracker`,{dry_run:true});
 if(preview.new_rows!==4||preview.changed_rows!==0)throw new Error('Unexpected tracker diff');
 const mirrored=await wmill.runScriptByPath(`${ROOT}/mirror_mumbai_tracker`,{dry_run:false});
 if(mirrored.new_rows!==4||mirrored.read_back!==true)throw new Error('Tracker verification failed');
 const appended=await read();
 await sql`INSERT INTO mumbai_nurture_creation_qa(qa_key,status,proof) VALUES('tracker-append-20260930','VERIFIED',${JSON.stringify({before:saved.proof.before,appended,mirrored})}::jsonb)`.execute();
 return {all_four_lead_creates_verified:true,assigned_owner_read_back:true,leads:output,tracker:mirrored,internal_qa_only:true,prospect_send:0,cleanup_pending:true};
}
