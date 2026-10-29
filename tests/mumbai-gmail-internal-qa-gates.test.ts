import {beforeEach,expect,mock,test} from 'bun:test';
let approved=false,old:any=null,writes=0,smtp=0;
const key='mumbai-gmail-community-harsha-20260930-01';
const copy={version:'mumbai-v1',subject:'What if water came before the home?',html:'<p>Approved original</p>'};
mock.module('windmill-client',()=>({
 getVariable:async(path:string)=>{
  if(path.endsWith('approved_email_01_json'))return JSON.stringify(copy);
  if(path.endsWith('gmail_internal_qa_approved_key'))return approved?key:'';
  if(path.endsWith('non_crm_sending_enabled')||path.endsWith('crm_handoff_writes_enabled'))return 'false';
  throw new Error('Unapproved variable access '+path);
 },
 datatable:()=> (parts:TemplateStringsArray)=>({fetchOne:async()=>parts.join('?').includes('to_regclass')?
  {existing_table:old?'mumbai_nurture_gmail_qa':null}:old,
  execute:async()=>{writes++;throw new Error('Unexpected write');}})
}));
mock.module('nodemailer',()=>({default:{createTransport:()=>{smtp++;throw new Error('Unexpected SMTP access');}}}));
mock.module('imapflow',()=>({ImapFlow:class {constructor(){throw new Error('Unexpected mailbox access');}}}));
mock.module('mailparser',()=>({simpleParser:async()=>{throw new Error('Unexpected parser access');}}));
const {main}=await import('../f/old_leads_churn/mumbai_gmail_internal_qa.ts');
beforeEach(()=>{approved=false;old=null;writes=0;smtp=0;});
test('default preview fixes exactly one sender/recipient and never touches a mailbox or writes',async()=>{
 const plan=await main();expect(plan.qa_key).toBe(key);expect(plan.exact_sender).toBe('community@beforest.co');
 expect(plan.exact_recipient).toBe('harsha@beforest.co');expect(plan.payload.envelope.to).toEqual(['harsha@beforest.co']);
 expect(plan.email_sends).toBe(0);expect(plan.crm_calls).toBe(0);expect(writes).toBe(0);expect(smtp).toBe(0);
});
test('knowing the preview hash cannot authorize a send',async()=>{
 const plan=await main();await expect(main('send',plan.payload_sha256)).rejects.toThrow('not approved');
 expect(writes).toBe(0);expect(smtp).toBe(0);
});
test('a changed payload hash cannot use an approved key',async()=>{
 approved=true;await expect(main('send','0'.repeat(64))).rejects.toThrow('reviewed payload hash');
 expect(writes).toBe(0);expect(smtp).toBe(0);
});
test('an uncertain existing QA attempt can never be sent again',async()=>{
 const plan=await main();approved=true;old={status:'UNCERTAIN',sender:'community@beforest.co',recipient:'harsha@beforest.co',
  payload_sha256:plan.payload_sha256,message_id:plan.message_id};
 const result=await main('send',plan.payload_sha256);expect(result.action).toBe('EXISTING_ATTEMPT_NO_RESEND');
 expect(writes).toBe(0);expect(smtp).toBe(0);
});
