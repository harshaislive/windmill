import * as wmill from 'windmill-client';
const ROOT='f/old_leads_churn',SHEET='1LojS6cGdt8JJl0NbOONwG7wf9OXjWL4qfezbYT8sL7w';
/** Explicit synthetic tracker-row mutation QA. No CRM or email calls. */
export async function main(execute:boolean=false) {
 if(!execute)return {plan:'Append one explicitly synthetic QA tracker row, verify exact values, remove only that row, verify original tracker unchanged',crm_writes:0,email_sends:0};
 if(await wmill.getVariable(`${ROOT}/delivery_enabled`)!=='false')throw new Error('Delivery closed required');
 const sql=wmill.datatable('main'), tag=crypto.randomUUID().slice(0,8);
 const headers={Authorization:`Bearer ${await wmill.getVariable(`${ROOT}/harsha_maton_api_key`)}`,'Maton-Connection':'6463e553-eab2-4cb9-a46f-b1a5665c0031','Content-Type':'application/json'};
 const base=`https://api.maton.ai/google-sheets/v4/spreadsheets/${SHEET}`;
 const read=async()=>{const r=await fetch(`${base}/values/${encodeURIComponent("'Mumbai Nurture Tracker'!A1:Z5000")}`,{headers});if(!r.ok)throw new Error(`Sheet read HTTP ${r.status}`);return(await r.json()).values||[];};
 const before=await read();
 await sql`CREATE TABLE IF NOT EXISTS mumbai_nurture_tracker_live_qa(qa_key text PRIMARY KEY,status text,proof jsonb)`.execute();
 const key=`tracker-live-${tag}`;
 await sql`INSERT INTO mumbai_nurture_tracker_live_qa VALUES(${key},'BACKUP',${JSON.stringify({before})}::jsonb)`.execute();
 const row=await sql`INSERT INTO mumbai_nurture_recipients(email_normalized,person_name,zoho_lead_id,sender,owner_name,owner_user_id,collective,state,stop_reason,next_step,source_version) VALUES(${`harsha+trackerqa-${tag}@beforest.co`},'INTERNAL QA SYNTHETIC CRM ID DO NOT CONTACT',${`SYNTHETIC-QA-NOT-CRM-${tag}`},'yogesh@beforest.co','Yogesh','863791000008149001','Mumbai','SUPPRESSED','INTERNAL_QA_DO_NOT_CONTACT',1,'mumbai-v1') RETURNING id`.fetchOne();
 const id=Number(row.id);
 await sql`INSERT INTO mumbai_nurture_source_links(deal_id,recipient_id,spreadsheet_id,sheet_name,source_present) VALUES(${`SYNTHETIC-QA-NOT-DEAL-${tag}`},${id},${SHEET},'INTERNAL_TRACKER_QA',true)`.execute();
 const preview=await wmill.runScriptByPath(`${ROOT}/mirror_mumbai_tracker`,{dry_run:true});
 if(preview.new_rows!==1||preview.changed_rows!==0)throw new Error('Unexpected diff; no write');
 const mirror=await wmill.runScriptByPath(`${ROOT}/mirror_mumbai_tracker`,{dry_run:false});
 const appended=await read();
 if(mirror.new_rows!==1||!mirror.read_back||appended.length!==before.length+1||JSON.stringify(appended.slice(0,before.length))!==JSON.stringify(before))throw new Error('Append failed exact check');
 await sql`UPDATE mumbai_nurture_tracker_live_qa SET status='APPEND_VERIFIED',proof=${JSON.stringify({before,appended,mirror})}::jsonb WHERE qa_key=${key}`.execute();
 const m=await fetch(`${base}?fields=sheets(properties)`,{headers});if(!m.ok)throw new Error('Metadata failure');const tab=(await m.json()).sheets.find((x:any)=>x.properties.title==='Mumbai Nurture Tracker');
 if(JSON.stringify(await read())!==JSON.stringify(appended))throw new Error('Concurrent change; cleanup held');
 const res=await fetch(`${base}:batchUpdate`,{method:'POST',headers,body:JSON.stringify({requests:[{deleteDimension:{range:{sheetId:tab.properties.sheetId,dimension:'ROWS',startIndex:before.length,endIndex:before.length+1}}}]}),signal:AbortSignal.timeout(30000)});
 if(!res.ok)throw new Error(`Cleanup outcome uncertain HTTP ${res.status}`);
 const after=await read();if(JSON.stringify(after)!==JSON.stringify(before))throw new Error('Cleanup read-back failed');
 await sql`DELETE FROM mumbai_nurture_source_links WHERE recipient_id=${id}`.execute();
 await sql`DELETE FROM mumbai_nurture_recipients WHERE id=${id} AND stop_reason='INTERNAL_QA_DO_NOT_CONTACT'`.execute();
 await sql`UPDATE mumbai_nurture_tracker_live_qa SET status='VERIFIED_CLEANED' WHERE qa_key=${key}`.execute();
 return {passed:true,real_sheet_append_verified:true,new_rows:1,test_row_removed:true,original_tracker_rows:before.length-1,exact_original_read_back:true,synthetic_row:true,crm_creation_verified:false,email_sends:0,qa_key:key};
}
