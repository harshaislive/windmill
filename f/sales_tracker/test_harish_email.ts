import * as wmill from 'windmill-client';
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';

const KEY='harish-harsha-email-test-20261012-01';
const FROM='harish@beforest.co',TO='harsha@beforest.co';
const MESSAGE_ID=`<${KEY}@beforest.co>`;
const payload={from:FROM,replyTo:FROM,to:TO,subject:'Beforest | Windmill email test',
  text:'Hi Harsha,\n\nThis is a test email sent from Harish’s account through Windmill. Please reply to confirm you received it.\n\nBeforest Team',
  messageId:MESSAGE_ID,envelope:{from:FROM,to:[TO]}};

export async function main(execute:boolean=false,approval_key:string='',readback_only:boolean=false) {
  const sql=wmill.datatable('main');
  if(readback_only) return {attempt:await sql`SELECT * FROM sales_tracker_email_tests WHERE test_key=${KEY}`.fetchOne()};
  if(execute&&approval_key!==KEY) throw new Error('Exact test approval required');
  if(!execute) return {dry_run:true,payload,messages_sent:0};
  const pass=await wmill.getVariable('f/old_leads_churn/harish_gmail_app_password');
  const smtp=nodemailer.createTransport({host:'smtp.gmail.com',port:587,secure:false,requireTLS:true,
    auth:{user:FROM,pass},tls:{rejectUnauthorized:true},logger:false,debug:false,
    connectionTimeout:15000,greetingTimeout:15000,socketTimeout:30000});
  try {
    await smtp.verify();
    await sql`CREATE TABLE IF NOT EXISTS sales_tracker_email_tests (
      test_key text PRIMARY KEY,status text NOT NULL,job_id text,payload jsonb NOT NULL,
      result jsonb,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
    )`.execute();
    const claimed=await sql`INSERT INTO sales_tracker_email_tests(test_key,status,job_id,payload)
      VALUES(${KEY},'ATTEMPTING',${process.env.WM_JOB_ID??null},${JSON.stringify(payload)}::jsonb)
      ON CONFLICT DO NOTHING RETURNING test_key`.fetchOne();
    if(!claimed) return {blocked:'Existing attempt; no automatic retry',test_key:KEY};
    let result:any;
    try {
      const info=await smtp.sendMail(payload);
      result={sender:FROM,recipient:TO,message_id:info.messageId,accepted:info.accepted,rejected:info.rejected,
        smtp_response:info.response,envelope:info.envelope,accepted_at_utc:new Date().toISOString(),
        job_id:process.env.WM_JOB_ID??null,sent_folder_verified:false,recipient_delivery_verified:false};
    } catch {
      await sql`UPDATE sales_tracker_email_tests SET status='UNCERTAIN',updated_at=now() WHERE test_key=${KEY}`.execute();
      throw new Error('SMTP outcome uncertain; do not resend automatically');
    }
    const accepted=result.message_id===MESSAGE_ID&&result.accepted?.length===1&&String(result.accepted[0]).toLowerCase()===TO&&!result.rejected?.length;
    await sql`UPDATE sales_tracker_email_tests SET status=${accepted?'SMTP_ACCEPTED':'UNACCEPTED'},result=${JSON.stringify(result)}::jsonb,updated_at=now() WHERE test_key=${KEY}`.execute();
    if(accepted) {
      const client=new ImapFlow({host:'imap.gmail.com',port:993,secure:true,auth:{user:FROM,pass},logger:false,
        tls:{rejectUnauthorized:true},connectionTimeout:15000,greetingTimeout:15000,socketTimeout:15000});
      try {
        await client.connect();
        const sent=(await client.list()).filter((box:any)=>box.specialUse==='\\Sent');
        if(sent.length===1) {
          const lock=await client.getMailboxLock(sent[0].path,{readOnly:true});
          try {
            const uids=await client.search({header:{'Message-ID':MESSAGE_ID}},{uid:true});
            if(Array.isArray(uids)&&uids.length===1) {
              const message=await client.fetchOne(uids[0],{envelope:true,internalDate:true},{uid:true});
              if(message?.envelope?.messageId===MESSAGE_ID&&(message.envelope.to||[]).some((x:any)=>x.address?.toLowerCase()===TO)) {
                result.sent_folder_verified=true;result.sent_uid=uids[0];result.sent_folder=sent[0].path;
                result.sent_internal_date=message.internalDate;
              }
            }
          } finally {lock.release();}
        }
      } catch {result.sent_folder_check='UNVERIFIED';}
      finally {try {await client.logout();}catch{}}
      await sql`UPDATE sales_tracker_email_tests SET status=${result.sent_folder_verified?'SENT_FOLDER_VERIFIED':'SMTP_ACCEPTED'},result=${JSON.stringify(result)}::jsonb,updated_at=now() WHERE test_key=${KEY}`.execute();
    }
    return {test_key:KEY,status:result.sent_folder_verified?'SENT_FOLDER_VERIFIED':accepted?'SMTP_ACCEPTED':'UNACCEPTED',...result};
  } finally {smtp.close();}
}
