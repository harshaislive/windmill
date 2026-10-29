import {beforeEach,expect,mock,test} from 'bun:test';

let row:any,gate=true,finalEligible=true,smtpFails=false,sentExists=false,
  duplicateSent=false,wrongBody=false,sendCalls=0,advanceCalls=0,stopBeforeSend=false,campaignReleased=true;
const copy={version:'mumbai-v1',subject:'Approved original',html:'<!doctype html><p>Original body</p>'};
const id='<mumbai-nurture-901-mumbai-v1@beforest.co>';
mock.module('../f/old_leads_churn/admit_mumbai_candidate',()=>({main:async()=>({action:'WOULD_ADMIT',admission_mode:'gmail'})}));
mock.module('../f/old_leads_churn/inspect_mumbai_reply_imap',()=>({main:async()=>({safe_to_send:!stopBeforeSend})}));
mock.module('windmill-client',()=>({
 getVariable:async(path:string)=>{
  if(path.includes('approved_email_'))return JSON.stringify(copy);
  if(path.endsWith('_gmail_app_password'))return 'test-password';
  if(path.endsWith('_daily_cap'))return path.includes('global')?'40':path.includes('new_admissions')?'5':path.includes('rakesh_api')?'20':'10';
  if(path.endsWith('non_crm_sending_enabled'))return gate?'true':'false';
  if(path.endsWith('crm_handoff_writes_enabled'))return 'false';
  if(path.endsWith('sheet_campaign_authorization'))return campaignReleased?'harsha:sheet-campaign:Sales Call List:Mumbai:2026-10-01':'';
  return 'true';
 },
 runScriptByPath:async(path:string,args:any)=>{
  if(path.endsWith('/admit_mumbai_candidate'))return {action:'WOULD_ADMIT',admission_mode:'gmail'};
  if(path.endsWith('/inspect_mumbai_reply_imap'))return {safe_to_send:!stopBeforeSend};
  if(path.endsWith('/reconcile_mumbai_gmail_send'))return reconcile(args.send_id,args.dry_run);
  throw new Error('Unexpected child '+path);
 },
 datatable:()=> (parts:TemplateStringsArray,...values:any[])=>{
  const query=parts.join('?');
  return {fetchOne:async()=>{
   if(query.includes('SELECT s.*'))return {...row};
   if(query.includes("SET status='ATTEMPTING'")){
    if(!finalEligible)return null;
    row.status='ATTEMPTING';row.attempt_count=1;row.attempted_at=new Date().toISOString();
    row.mail_message_id=id;return {id:901};
   }
   if(query.includes('WITH accepted AS')){
    const wasPending=['ATTEMPTING','UNCERTAIN'].includes(row.status);
    if(wasPending){row.status='VERIFIED_SENT';advanceCalls++;row.next_step=2;row.verified_at=values[0];}
    return {send_updated:wasPending?1:0,recipient_advanced:wasPending?1:0};
   }
   if(query.includes('SELECT status,transport'))return {...row};
   throw new Error('Unexpected fetch '+query);
  },execute:async()=>{
   if(query.includes("SET status='UNCERTAIN'")){row.status='UNCERTAIN';return;}
   throw new Error('Unexpected write '+query);
  }};
 }
}));
mock.module('nodemailer',()=>({default:{createTransport:()=>({
 verify:async()=>true,close:()=>{},sendMail:async(payload:any)=>{
  sendCalls++;expect(payload.to).toBe(row.recipient_email);expect(payload.envelope.to).toEqual([row.recipient_email]);
  if(smtpFails)throw new Error('Timeout after SMTP submission');
  sentExists=true;return {messageId:payload.messageId,accepted:[row.recipient_email],rejected:[]};
 }
})}}));
mock.module('imapflow',()=>({ImapFlow:class {
 mailbox={readOnly:true,uidValidity:1};
 connect=async()=>{};logout=async()=>{};
 list=async()=>[{path:'Sent',specialUse:'\\Sent'}];
 getMailboxLock=async()=>({release:()=>{}});
 search=async(query:any)=>query.header?(sentExists?(duplicateSent?[7,8]:[7]):[]):[];
 fetchOne=async()=>({envelope:{},internalDate:new Date(),source:Buffer.from('mock RFC message')});
}}));
mock.module('mailparser',()=>({simpleParser:async()=>({messageId:id,
 from:{value:[{address:row.sender}]},to:{value:[{address:row.recipient_email}]},
 replyTo:{value:[{address:row.sender}]},subject:copy.subject,html:wrongBody?'Unapproved body':copy.html+'\r\n'
})}));
const {main:send}=await import('../f/old_leads_churn/send_mumbai_gmail_step.ts');
const {main:reconcile}=await import('../f/old_leads_churn/reconcile_mumbai_gmail_send.ts');
const {main:note}=await import('../f/old_leads_churn/handoff_mumbai_reply.ts');
const {main:task}=await import('../f/old_leads_churn/handoff_mumbai_reply_task.ts');
beforeEach(()=>{
 gate=true;finalEligible=true;smtpFails=false;sentExists=false;duplicateSent=false;
 wrongBody=false;sendCalls=0;advanceCalls=0;stopBeforeSend=false;campaignReleased=true;
 row={id:901,recipient_id:900,step:1,status:'RESERVED',sender:'harish@beforest.co',
 recipient_sender:'harish@beforest.co',recipient_email:'fixture@example.invalid',email_normalized:'fixture@example.invalid',
 attempt_count:0,zoho_lead_id:null,admission_mode:'gmail',transport:'gmail_smtp',state:'READY',collective:'Mumbai',
 owner_user_id:'863791000009584001',next_step:1,next_due_at:new Date(Date.now()-1000).toISOString(),
 source_version:'mumbai-v1',sequence_version:'mumbai-v1',reviewed_email:'fixture@example.invalid',
 approval_version:'mumbai-v1',consent_confirmed:true,active_sales_clear:true,
 recipient_created_at:new Date(Date.now()-86400000).toISOString(),reserved_at:new Date().toISOString()};
});
test('closed release, changed approval, and replies prevent SMTP submission',async()=>{
 gate=false;await expect(send(901,false)).rejects.toThrow('RELEASE_GATES_CLOSED');expect(sendCalls).toBe(0);
 gate=true;row.consent_confirmed=false;await expect(send(901,false)).rejects.toThrow('APPROVAL_CHANGED');expect(sendCalls).toBe(0);
 row.consent_confirmed=true;stopBeforeSend=true;await expect(send(901,false)).rejects.toThrow('INBOUND_REVIEW');expect(sendCalls).toBe(0);
});
test('lost final eligibility race prevents SMTP submission',async()=>{
 finalEligible=false;await expect(send(901,false)).rejects.toThrow('lost final eligibility');
 expect(sendCalls).toBe(0);expect(row.status).toBe('RESERVED');
});
test('SMTP timeout is uncertain and a second call cannot resend',async()=>{
 smtpFails=true;await expect(send(901,false)).rejects.toThrow('outcome uncertain');
 expect(row.status).toBe('UNCERTAIN');expect(row.mail_message_id).toBe(id);
 await expect(send(901,false)).rejects.toThrow('NOT_FRESH_RESERVATION');expect(sendCalls).toBe(1);expect(advanceCalls).toBe(0);
});
test('only exact Sent readback advances the journal once',async()=>{
 const result=await send(901,false);expect(result.status).toBe('VERIFIED_SENT');
 expect(sendCalls).toBe(1);expect(advanceCalls).toBe(1);expect(row.zoho_lead_id).toBeNull();
 const again=await reconcile(901,false);expect(again.action).toBe('ALREADY_VERIFIED');
 expect(advanceCalls).toBe(1);expect(sendCalls).toBe(1);
});
test('duplicate Sent matches and changed content never advance an uncertain send',async()=>{
 row.status='UNCERTAIN';row.attempt_count=1;row.attempted_at=new Date().toISOString();row.mail_message_id=id;
 sentExists=true;duplicateSent=true;const result=await reconcile(901,false);
 expect(result.action).toBe('HOLD_UNCERTAIN_FOR_MANUAL_REVIEW');expect(advanceCalls).toBe(0);
 duplicateSent=false;wrongBody=true;await expect(reconcile(901,false)).rejects.toThrow('content, address or time mismatch');
 expect(row.status).toBe('UNCERTAIN');expect(sendCalls).toBe(0);expect(advanceCalls).toBe(0);
});
test('dry run never submits a message',async()=>{
 const result=await send(901,true);expect(result.action).toBe('NO_SEND');expect(result.holds).toEqual([]);
 expect(sendCalls).toBe(0);expect(row.status).toBe('RESERVED');
});
test('manual review mode prevents both CRM Notes and owner Tasks before database or OAuth access',async()=>{
 expect((await note('qa:manual:reviewgate',false)).action).toBe('AWAITING_HARSHA_REVIEW');
 expect((await task('qa:manual:reviewgate',false)).action).toBe('AWAITING_HARSHA_REVIEW');
 expect(sendCalls).toBe(0);expect(advanceCalls).toBe(0);
});

test('full Sheet authorization sends without inventing per-person consent or Sales approval',async()=>{
 row.reviewed_by='harsha:sheet-campaign:Sales Call List:Mumbai:2026-10-01';
 row.allow_crm_create=false;row.consent_confirmed=false;row.active_sales_clear=false;
 const result=await send(901,false);expect(result.status).toBe('VERIFIED_SENT');expect(sendCalls).toBe(1);
 expect(row.consent_confirmed).toBe(false);expect(row.active_sales_clear).toBe(false);
});
test('closed campaign authorization, changed address and a reply still block campaign dispatch',async()=>{
 row.reviewed_by='harsha:sheet-campaign:Sales Call List:Mumbai:2026-10-01';
 row.allow_crm_create=false;row.consent_confirmed=false;row.active_sales_clear=false;
 campaignReleased=false;await expect(send(901,false)).rejects.toThrow('CAMPAIGN_RELEASE_CLOSED');
 campaignReleased=true;row.reviewed_email='changed@example.invalid';await expect(send(901,false)).rejects.toThrow('APPROVAL_CHANGED');
 row.reviewed_email=row.email_normalized;stopBeforeSend=true;await expect(send(901,false)).rejects.toThrow('INBOUND_REVIEW');
 expect(sendCalls).toBe(0);
});
