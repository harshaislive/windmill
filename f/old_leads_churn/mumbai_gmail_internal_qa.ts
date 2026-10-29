import * as wmill from 'windmill-client';
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

const ROOT='f/old_leads_churn';
const KEY='mumbai-gmail-community-harsha-20260930-01';
const FROM='community@beforest.co',TO='harsha@beforest.co';
const MESSAGE_ID=`<${KEY}@beforest.co>`;
const canonical=(x:unknown)=>String(x||'').replace(/\r\n/g,'\n').replace(/\n+$/,'');
const digest=async(x:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
  new TextEncoder().encode(x)))).map(x=>x.toString(16).padStart(2,'0')).join('');

/** One fixed internal QA. Preview default. Sending needs a separate approved key and exact hash. */
export async function main(phase:string='preview',approved_payload_sha256:string='',record:boolean=false) {
  if(!['preview','send','reconcile_sent','reconcile_reply'].includes(phase)) throw new Error('Invalid QA phase');
  const sql=wmill.datatable('main');
  const copy=JSON.parse(await wmill.getVariable(`${ROOT}/approved_email_01_json`));
  if(copy.version!=='mumbai-v1'||!copy.subject||!copy.html) throw new Error('Original Email 01 unavailable');
  const payload={from:FROM,replyTo:FROM,to:TO,subject:copy.subject,html:copy.html,
    messageId:MESSAGE_ID,envelope:{from:FROM,to:[TO]}};
  const hash=await digest(JSON.stringify(payload));
  const table=await sql`SELECT to_regclass('mumbai_nurture_gmail_qa')::text AS existing_table`.fetchOne();
  const old=table?.existing_table?await sql`SELECT * FROM mumbai_nurture_gmail_qa WHERE qa_key=${KEY}`.fetchOne():null;
  if(phase==='preview') return {phase,action:'PREVIEW_ONLY_NO_APPROVAL_OR_SEND',qa_key:KEY,
    exact_recipient:TO,exact_sender:FROM,subject:copy.subject,copy_version:copy.version,
    payload_sha256:hash,original_copy_sha256:await digest(copy.subject+'\n'+copy.html),
    message_id:MESSAGE_ID,payload,prior_status:old?.status||null,
    approval_variable:`${ROOT}/gmail_internal_qa_approved_key`,
    required_approval:'Exactly one additional original Email 01 from community to Harsha; Harsha replies to that same message. No prospect send, CRM write or fresh transport activation.',
    email_sends:0,crm_calls:0,crm_writes:0,queue_writes:0};
  if(old&&(old.sender!==FROM||old.recipient!==TO||old.payload_sha256!==hash||old.message_id!==MESSAGE_ID))
    throw new Error('QA key or approved original changed; no retry');
  const mutating=phase==='send'||record;
  if(mutating) {
    if(approved_payload_sha256!==hash) throw new Error('Exact reviewed payload hash required');
    let key='';try{key=await wmill.getVariable(`${ROOT}/gmail_internal_qa_approved_key`);}catch{}
    if(key!==KEY) throw new Error('One-email internal QA is not approved');
    if(await wmill.getVariable(`${ROOT}/non_crm_sending_enabled`)!=='false')
      throw new Error('Fresh prospect transport must remain closed during internal QA');
    if(await wmill.getVariable(`${ROOT}/crm_handoff_writes_enabled`)!=='false')
      throw new Error('CRM handoff must remain closed');
  }
  if(phase==='send'&&old) return {phase,qa_key:KEY,status:old.status,action:'EXISTING_ATTEMPT_NO_RESEND',email_sends:0};
  if(phase!=='send'&&!old) return {phase,qa_key:KEY,action:'NO_QA_ATTEMPT_TO_RECONCILE',email_sends:0};
  const pass=await wmill.getVariable(`${ROOT}/community_gmail_app_password`);
  if(phase==='send') {
    const smtp=nodemailer.createTransport({host:'smtp.gmail.com',port:587,secure:false,requireTLS:true,
      auth:{user:FROM,pass},tls:{rejectUnauthorized:true},logger:false,debug:false,
      connectionTimeout:15000,greetingTimeout:15000,socketTimeout:30000});
    try {
      await smtp.verify();
      const priorClient=new ImapFlow({host:'imap.gmail.com',port:993,secure:true,auth:{user:FROM,pass},
        tls:{rejectUnauthorized:true},logger:false,connectionTimeout:15000,greetingTimeout:15000,socketTimeout:20000});
      try {
        await priorClient.connect();
        const sent=(await priorClient.list()).filter((x:any)=>x.specialUse==='\\Sent');
        if(sent.length!==1) throw new Error('QA Sent folder unavailable');
        const lock=await priorClient.getMailboxLock(sent[0].path,{readOnly:true});
        try {
          if(!priorClient.mailbox?.readOnly) throw new Error('QA Sent not read-only');
          const ids=await priorClient.search({header:{'Message-ID':MESSAGE_ID}},{uid:true});
          if(!Array.isArray(ids)||ids.length) return {phase,qa_key:KEY,
            action:'HOLD_EXISTING_MESSAGE_MARKER_OR_UNCERTAIN_SEARCH_NO_RESEND',email_sends:0};
        } finally {lock.release();}
      } finally {try{await priorClient.logout();}catch{}}
      // Persist the one-shot attempt before SMTP. A timeout or a rejected request
      // is never a license to repeat this QA email.
      await sql`CREATE TABLE IF NOT EXISTS mumbai_nurture_gmail_qa (
        qa_key text PRIMARY KEY,sender text NOT NULL,recipient text NOT NULL,
        payload_sha256 text NOT NULL,payload jsonb NOT NULL,message_id text NOT NULL UNIQUE,
        status text NOT NULL CHECK(status IN ('ATTEMPTING','UNCERTAIN','SENT_VERIFIED','REPLY_VERIFIED')),
        attempted_at timestamptz NOT NULL DEFAULT now(),sent_verified_at timestamptz,
        sent_uid bigint,sent_uid_validity text,reply_evidence jsonb,reply_verified_at timestamptz
      )`.execute();
      const lease=await sql`INSERT INTO mumbai_nurture_gmail_qa
        (qa_key,sender,recipient,payload_sha256,payload,message_id,status)
        VALUES(${KEY},${FROM},${TO},${hash},${JSON.stringify(payload)}::jsonb,${MESSAGE_ID},'ATTEMPTING')
        ON CONFLICT(qa_key) DO NOTHING RETURNING qa_key`.fetchOne();
      if(!lease) return {phase,qa_key:KEY,action:'EXISTING_ATTEMPT_NO_RESEND',email_sends:0};
      let accepted=false;
      try {
        const result=await smtp.sendMail(payload);
        accepted=result.messageId===MESSAGE_ID&&result.accepted?.length===1&&
          String(result.accepted[0]).toLowerCase()===TO&&!(result.rejected||[]).length;
      } catch {
        await sql`UPDATE mumbai_nurture_gmail_qa SET status='UNCERTAIN' WHERE qa_key=${KEY} AND status='ATTEMPTING'`.execute();
        throw new Error('Internal SMTP outcome uncertain; reconcile exact Sent, never resend');
      }
      await sql`UPDATE mumbai_nurture_gmail_qa SET status='UNCERTAIN' WHERE qa_key=${KEY} AND status='ATTEMPTING'`.execute();
      return {phase,qa_key:KEY,dispatch_accepted:accepted,status:'UNCERTAIN',
        next_action:'RECONCILE_EXACT_SENT_THEN_WAIT_FOR_HARSHA_REPLY',crm_calls:0,crm_writes:0,queue_writes:0};
    } finally {smtp.close();}
  }
  const client=new ImapFlow({host:'imap.gmail.com',port:993,secure:true,auth:{user:FROM,pass},
    tls:{rejectUnauthorized:true},logger:false,connectionTimeout:15000,greetingTimeout:15000,socketTimeout:20000});
  try {
    await client.connect();
    const use=phase==='reconcile_sent'?'\\Sent':'\\All';
    const boxes=(await client.list()).filter((x:any)=>x.specialUse===use);
    if(boxes.length!==1) throw new Error('QA mailbox folder not unique');
    const lock=await client.getMailboxLock(boxes[0].path,{readOnly:true});
    try {
      const box=client.mailbox;
      if(!box?.readOnly||!box.uidValidity) throw new Error('QA mailbox not read-only');
      if(phase==='reconcile_sent') {
        const ids=await client.search({header:{'Message-ID':MESSAGE_ID}},{uid:true});
        if(!Array.isArray(ids)||ids.length!==1) return {phase,qa_key:KEY,action:'HOLD_EXACT_SENT_NOT_UNIQUE',email_sends:0};
        const m=await client.fetchOne(ids[0],{source:true,internalDate:true},{uid:true});
        if(!m?.source||!m.internalDate) throw new Error('QA Sent evidence incomplete');
        const p=await simpleParser(m.source),from=p.from?.value||[],to=Array.isArray(p.to)?[]:p.to?.value||[],reply=p.replyTo?.value||[];
        if(p.messageId!==MESSAGE_ID||from.length!==1||from[0].address?.toLowerCase()!==FROM||
          to.length!==1||to[0].address?.toLowerCase()!==TO||reply.length!==1||reply[0].address?.toLowerCase()!==FROM||
          p.cc||p.bcc||(p.attachments||[]).length||p.subject!==payload.subject||canonical(p.html)!==canonical(payload.html)||
          new Date(m.internalDate).getTime()<Date.parse(old.attempted_at)-60000||
          new Date(m.internalDate).getTime()>Date.now()+60000)
          throw new Error('QA exact Sent content/address/time mismatch');
        const at=new Date(m.internalDate).toISOString();
        if(record) {
          await sql`UPDATE mumbai_nurture_gmail_qa SET status='SENT_VERIFIED',sent_verified_at=${at}::timestamptz,
            sent_uid=${Number(ids[0])},sent_uid_validity=${String(box.uidValidity)}
            WHERE qa_key=${KEY} AND status IN('ATTEMPTING','UNCERTAIN') AND payload_sha256=${hash}`.execute();
          const check=await sql`SELECT status,sent_uid FROM mumbai_nurture_gmail_qa WHERE qa_key=${KEY}`.fetchOne();
          if(!['SENT_VERIFIED','REPLY_VERIFIED'].includes(check?.status)||Number(check.sent_uid)!==Number(ids[0]))
            throw new Error('QA Sent journal read-back mismatch');
        }
        return {phase,qa_key:KEY,action:record?'QA_SENT_VERIFIED':'WOULD_VERIFY_QA_SENT',sent_at:at,
          uid:Number(ids[0]),read_only_mailbox:true,email_sends:0,crm_writes:0,queue_writes:0};
      }
      if(!['SENT_VERIFIED','REPLY_VERIFIED'].includes(old.status))
        return {phase,qa_key:KEY,action:'SENT_MUST_BE_VERIFIED_FIRST',email_sends:0};
      const ids=await client.search({from:TO,since:new Date(Date.parse(old.attempted_at)-86400000)},{uid:true});
      if(!Array.isArray(ids)||ids.length>50) throw new Error('QA reply search incomplete');
      const matches=[];
      for(const uid of ids) {
        const m=await client.fetchOne(uid,{source:true,internalDate:true},{uid:true});
        if(!m?.source||!m.internalDate) throw new Error('QA reply evidence incomplete');
        const p=await simpleParser(m.source),from=p.from?.value||[],to=Array.isArray(p.to)?[]:p.to?.value||[];
        const refs=Array.isArray(p.references)?p.references:String(p.references||'').split(/\s+/);
        const auto=String(p.headers.get('auto-submitted')||'');
        if(from.length!==1||from[0].address?.toLowerCase()!==TO||!to.some(x=>x.address?.toLowerCase()===FROM)||
          new Date(m.internalDate).getTime()<=Date.parse(old.attempted_at)||!p.messageId||
          (p.inReplyTo!==MESSAGE_ID&&!refs.includes(MESSAGE_ID))||(auto&&auto!=='no')||p.headers.has('list-id')||
          /bulk|list|junk/i.test(String(p.headers.get('precedence')||''))) continue;
        matches.push({uid:Number(uid),uid_validity:String(box.uidValidity),message_id:p.messageId,
          received_at:new Date(m.internalDate).toISOString(),subject:p.subject||'',
          reply_preview:String(p.text||'').slice(0,400),classification:'EXACT_INTERNAL_MANUAL_REPLY'});
      }
      if(matches.length!==1) return {phase,qa_key:KEY,action:'WAIT_OR_REVIEW_QA_REPLY',matches:matches.length,email_sends:0};
      if(record) {
        await sql`UPDATE mumbai_nurture_gmail_qa SET status='REPLY_VERIFIED',reply_evidence=${JSON.stringify(matches[0])}::jsonb,
          reply_verified_at=now() WHERE qa_key=${KEY} AND status='SENT_VERIFIED' AND payload_sha256=${hash}`.execute();
        const check=await sql`SELECT status,reply_evidence FROM mumbai_nurture_gmail_qa WHERE qa_key=${KEY}`.fetchOne();
        if(check?.status!=='REPLY_VERIFIED'||Number(check.reply_evidence?.uid)!==matches[0].uid)
          throw new Error('QA reply journal read-back mismatch');
      }
      return {phase,qa_key:KEY,action:record?'QA_REPLY_VERIFIED':'WOULD_VERIFY_QA_REPLY',
        reply:matches[0],email_sends:0,crm_writes:0,queue_writes:0};
    } finally {lock.release();}
  } finally {try{await client.logout();}catch{}}
}
