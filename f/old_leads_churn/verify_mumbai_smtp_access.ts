import * as wmill from 'windmill-client';
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';

/** Authentication and read-only Sent folder proof. Never calls sendMail. */
export async function main() {
  const results=[];
  for(const [sender,lane] of [['sai@beforest.co','rakesh'],['community@beforest.co','community'],
    ['yogesh@beforest.co','yogesh'],['harish@beforest.co','harish']]) {
    let smtp:any,client:any,stage='credential_read';
    try {
      const pass=await wmill.getVariable(`f/old_leads_churn/${lane}_gmail_app_password`);
      stage='smtp_authentication';
      smtp=nodemailer.createTransport({host:'smtp.gmail.com',port:587,secure:false,requireTLS:true,
        auth:{user:sender,pass},tls:{rejectUnauthorized:true},logger:false,debug:false,
        connectionTimeout:15000,greetingTimeout:15000,socketTimeout:20000});
      await smtp.verify();
      stage='sent_folder_read';
      client=new ImapFlow({host:'imap.gmail.com',port:993,secure:true,auth:{user:sender,pass},
        tls:{rejectUnauthorized:true},logger:false,connectionTimeout:15000,
        greetingTimeout:15000,socketTimeout:20000});
      await client.connect();
      const sent=(await client.list()).filter((x:any)=>x.specialUse==='\\Sent');
      if(sent.length!==1) throw new Error('Sent folder unavailable');
      const box=await client.mailboxOpen(sent[0].path,{readOnly:true});
      if(!box.readOnly||!box.uidValidity) throw new Error('Sent cursor unavailable');
      results.push({sender,smtp_authenticated:true,sent_read_only:true,action:'AUTH_AND_SENT_READ_VERIFIED'});
    } catch(error:any) {
      const value=String(error?.code||'')+' '+String(error?.message||'');
      const reason=/auth|login|credentials|password/i.test(value)?'AUTHENTICATION_FAILED':
        /certificate|cert_|tls|ssl/i.test(value)?'TLS_VERIFICATION_FAILED':
        /timeout|timed out/i.test(value)?'CONNECTION_TIMEOUT':
        /econn|network|socket|dns|enotfound/i.test(value)?'NETWORK_CONNECTION_FAILED':'CHECK_FAILED';
      results.push({sender,action:'HOLD_SMTP_OR_SENT_ACCESS_UNVERIFIED',stage,reason});
    } finally {
      try {smtp?.close();}catch{}
      try {await client?.logout();}catch{}
    }
  }
  return {results,all_verified:results.every(x=>x.action==='AUTH_AND_SENT_READ_VERIFIED'),
    email_sends:0,crm_writes:0,mailbox_writes:0};
}
