import * as wmill from 'windmill-client';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

const ROOT='f/old_leads_churn';
const lanes:Record<string,string>={'sai@beforest.co':'rakesh','community@beforest.co':'community',
  'harish@beforest.co':'harish','yogesh@beforest.co':'yogesh'};
const canonical=(x:unknown)=>String(x||'').replace(/\r\n/g,'\n').replace(/\n+$/,'');

/** Exact Sent mailbox readback. Never sends, retries or writes to Zoho. */
export async function main(send_id:number,dry_run:boolean=true) {
  if(!Number.isSafeInteger(send_id)||send_id<1) throw new Error('Invalid send id');
  const sql=wmill.datatable('main');
  const row=await sql`SELECT s.*,r.source_version FROM mumbai_nurture_sends s
    JOIN mumbai_nurture_recipients r ON r.id=s.recipient_id WHERE s.id=${send_id}`.fetchOne();
  if(!row||row.transport!=='gmail_smtp'||!lanes[row.sender]) throw new Error('Mail-only send not found');
  if(!['ATTEMPTING','UNCERTAIN','VERIFIED_SENT'].includes(row.status))
    return {dry_run,send_id,action:'NO_SEND_ATTEMPT_TO_RECONCILE',status:row.status};
  const expectedId=`<mumbai-nurture-${send_id}-${row.sequence_version}@beforest.co>`;
  if(row.mail_message_id!==expectedId||!row.attempted_at||Number(row.attempt_count)!==1)
    throw new Error('Missing exact durable mail attempt marker; manual review');
  const copy=JSON.parse(await wmill.getVariable(`${ROOT}/approved_email_${row.step<=3?'01':row.step<=5?'02':'03'}_json`));
  if(copy.version!==row.sequence_version||!copy.subject||!copy.html) throw new Error('Copy version changed');
  const pass=await wmill.getVariable(`${ROOT}/${lanes[row.sender]}_gmail_app_password`);
  const client=new ImapFlow({host:'imap.gmail.com',port:993,secure:true,auth:{user:row.sender,pass},
    tls:{rejectUnauthorized:true},logger:false,connectionTimeout:15000,greetingTimeout:15000,socketTimeout:20000});
  let at='';
  try {
    await client.connect();
    const sent=(await client.list()).filter((x:any)=>x.specialUse==='\\Sent');
    if(sent.length!==1) throw new Error('Sent folder not unique');
    const lock=await client.getMailboxLock(sent[0].path,{readOnly:true});
    try {
      if(!client.mailbox?.readOnly) throw new Error('Sent folder not read-only');
      const uids=await client.search({header:{'Message-ID':expectedId}},{uid:true});
      if(!Array.isArray(uids)||uids.length!==1) return {dry_run,send_id,status:row.status,
        action:'HOLD_UNCERTAIN_FOR_MANUAL_REVIEW',matches:Array.isArray(uids)?uids.length:null};
      const m=await client.fetchOne(uids[0],{envelope:true,internalDate:true,source:true},{uid:true});
      if(!m?.envelope||!m.internalDate||!m.source) throw new Error('Sent evidence incomplete');
      const parsed=await simpleParser(m.source);
      const from=parsed.from?.value||[],to=Array.isArray(parsed.to)?[]:parsed.to?.value||[];
      const reply=parsed.replyTo?.value||[];
      const sentAt=Date.parse(String(m.internalDate));
      if(parsed.messageId!==expectedId||from.length!==1||from[0].address?.toLowerCase()!==row.sender||
        to.length!==1||to[0].address?.toLowerCase()!==row.recipient_email||parsed.cc||parsed.bcc||
        reply.length!==1||reply[0].address?.toLowerCase()!==row.sender||parsed.subject!==copy.subject||
        canonical(parsed.html)!==canonical(copy.html)||(parsed.attachments||[]).length!==0||!Number.isFinite(sentAt)||
        sentAt<Date.parse(row.attempted_at)-60000||sentAt>Date.now()+60000)
        throw new Error('Exact Gmail Sent content, address or time mismatch; no retry');
      // Never allow a mailbox clock to shorten the 48-hour recipient gap.
      at=new Date(Math.max(sentAt,Date.parse(row.attempted_at))).toISOString();
    } finally {lock.release();}
  } finally {try{await client.logout();}catch{}}
  if(dry_run) return {dry_run:true,send_id,action:'WOULD_VERIFY_EXACT_GMAIL_SENT',mail_message_id:expectedId,crm_write:false};
  if(row.status==='VERIFIED_SENT') return {dry_run:false,send_id,status:row.status,action:'ALREADY_VERIFIED',crm_write:false};
  const updated=await sql`WITH accepted AS (
    UPDATE mumbai_nurture_sends SET status='VERIFIED_SENT',verified_at=${at}::timestamptz
    WHERE id=${send_id} AND status IN ('ATTEMPTING','UNCERTAIN') AND transport='gmail_smtp'
      AND mail_message_id=${expectedId} AND attempt_count=1 RETURNING recipient_id,step,sequence_version,recipient_email,sender
  ), advanced AS (
    UPDATE mumbai_nurture_recipients r SET last_verified_send_at=${at}::timestamptz,
      next_step=CASE WHEN next_step=6 THEN NULL ELSE next_step+1 END,
      next_due_at=CASE WHEN next_step=6 THEN NULL ELSE ${at}::timestamptz+interval '48 hours' END,
      state=CASE WHEN next_step=6 THEN 'COMPLETE' ELSE state END,updated_at=now()
    WHERE r.id IN(SELECT recipient_id FROM accepted) AND r.state='READY'
      AND r.admission_mode='gmail' AND r.zoho_lead_id IS NULL
      AND r.email_normalized=(SELECT recipient_email FROM accepted) AND r.sender=(SELECT sender FROM accepted)
      AND r.source_version=(SELECT sequence_version FROM accepted) AND r.next_step=(SELECT step FROM accepted)
      AND NOT EXISTS(SELECT 1 FROM mumbai_nurture_events e WHERE e.recipient_id=r.id
        AND e.kind IN ('REPLY','OPTOUT','BOUNCE','SALES_HANDOFF','COLLECTIVE_CHANGE','ADDRESS_CHANGE','IDENTITY_HOLD'))
    RETURNING id
  ) SELECT (SELECT count(*)::integer FROM accepted) send_updated,
    (SELECT count(*)::integer FROM advanced) recipient_advanced`.fetchOne();
  const check=await sql`SELECT status,transport,mail_message_id,verified_at FROM mumbai_nurture_sends WHERE id=${send_id}`.fetchOne();
  if(check?.status!=='VERIFIED_SENT'||check.transport!=='gmail_smtp'||check.mail_message_id!==expectedId)
    throw new Error('Mail journal read-back failed');
  return {dry_run:false,send_id,status:check.status,transport:'gmail_smtp',mail_message_id:expectedId,
    recipient_advanced:Number(updated.recipient_advanced),read_back:true,crm_write:false};
}
