import {main as admit} from './admit_mumbai_candidate';
import {main as inspect} from './inspect_mumbai_reply_imap';
import {main as reconcile} from './reconcile_mumbai_gmail_send';
import * as wmill from 'windmill-client';
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';

const ROOT='f/old_leads_churn';
const lanes:Record<string,{mail:string,api:string,id:string}>={
  'sai@beforest.co':{mail:'rakesh',api:'rakesh',id:'863791000000520050'},
  'community@beforest.co':{mail:'community',api:'rakesh',id:'863791000000520050'},
  'yogesh@beforest.co':{mail:'yogesh',api:'yogesh',id:'863791000008149001'},
  'harish@beforest.co':{mail:'harish',api:'harish',id:'863791000009584001'},
};

/** One pre-reserved mail-only step. Never creates or updates a CRM person. */
export async function main(send_id:number,dry_run:boolean=true) {
  if(!Number.isSafeInteger(send_id)||send_id<1) throw new Error('Invalid send id');
  const sql=wmill.datatable('main');
  const row=await sql`SELECT s.*,r.state,r.collective,r.zoho_lead_id,r.admission_mode,
    r.owner_user_id,r.email_normalized,r.sender recipient_sender,r.next_step,r.next_due_at,
    r.last_verified_send_at,r.created_at recipient_created_at,r.source_version,
    a.reviewed_email,a.consent_confirmed,a.active_sales_clear,a.reviewed_by,a.allow_crm_create,a.source_version approval_version
    FROM mumbai_nurture_sends s JOIN mumbai_nurture_recipients r ON r.id=s.recipient_id
    LEFT JOIN mumbai_nurture_admission_approvals a ON a.recipient_id=r.id WHERE s.id=${send_id}`.fetchOne();
  if(!row) throw new Error('Send not found');
  const lane=lanes[row.sender];
  const holds:string[]=[];
  if(!lane||row.owner_user_id!==lane.id||row.recipient_sender!==row.sender) holds.push('LANE_CHANGED');
  if(row.zoho_lead_id||row.admission_mode!=='gmail'||row.transport!=='gmail_smtp') holds.push('NOT_MAIL_ONLY');
  if(row.status!=='RESERVED'||Number(row.attempt_count)!==0) holds.push('NOT_FRESH_RESERVATION');
  if(row.state!=='READY'||row.collective!=='Mumbai'||Number(row.next_step)!==Number(row.step)) holds.push('NOT_READY');
  const basis='harsha:sheet-campaign:Sales Call List:Mumbai:2026-10-01';
  const campaign=row.reviewed_by===basis&&!row.allow_crm_create;
  if(row.recipient_email!==row.email_normalized||row.reviewed_email!==row.email_normalized||
    row.approval_version!==row.source_version||(!campaign&&(!row.consent_confirmed||!row.active_sales_clear))) holds.push('APPROVAL_CHANGED');
  if(campaign&&await wmill.getVariable(`${ROOT}/sheet_campaign_authorization`)!==basis) holds.push('CAMPAIGN_RELEASE_CLOSED');
  if(!row.next_due_at||Date.parse(row.next_due_at)>Date.now()) holds.push('NOT_DUE');
  if(row.last_verified_send_at&&Date.now()-Date.parse(row.last_verified_send_at)<48*3600000) holds.push('BEFORE_48_HOURS');
  const gates=await Promise.all(['delivery_enabled','non_crm_sending_enabled','reply_visibility_verified',
    'email_copy_approved','offer_claims_verified'].map(x=>wmill.getVariable(`${ROOT}/${x}`)));
  if(gates.some(x=>x!=='true')) holds.push('RELEASE_GATES_CLOSED');
  let queuesEnabled='false';try{queuesEnabled=await wmill.getVariable(`${ROOT}/sender_queues_enabled`);}catch{}
  if(queuesEnabled==='true'&&await wmill.getVariable(`${ROOT}/sender_domain_verified`)!=='true')
    holds.push('DOMAIN_AUTHENTICATION_HOLD');
  const emailNumber=row.step<=3?'01':row.step<=5?'02':'03';
  const copy=JSON.parse(await wmill.getVariable(`${ROOT}/approved_email_${emailNumber}_json`));
  if(!copy.subject||!copy.html||copy.version!==row.source_version) throw new Error('Approved copy mismatch');
  if(holds.length) {
    if(dry_run) return {dry_run:true,send_id,action:'NO_SEND',holds};
    throw new Error(`Mail-only send held: ${holds.join(',')}`);
  }
  // Repeat exact CRM searches read-only. A person entering Sales/CRM since approval
  // blocks this outside-CRM route; never silently adopt or create their CRM record.
  const admission=await admit(Number(row.recipient_id),true,row.reviewed_email,row.consent_confirmed,row.active_sales_clear);
  if(admission.action!=='WOULD_ADMIT'||admission.admission_mode!=='gmail') holds.push('CURRENT_IDENTITY_OR_SALES_REVIEW_FAILED');
  const inbound=await inspect(Number(row.recipient_id),!dry_run);
  if(inbound.safe_to_send!==true) holds.push('INBOUND_REVIEW');
  const messageId=`<mumbai-nurture-${send_id}-${row.source_version}@beforest.co>`;
  if(!/^<mumbai-nurture-\d+-[a-z0-9_-]+@beforest\.co>$/i.test(messageId)) throw new Error('Invalid outbound marker');
  const pass=await wmill.getVariable(`${ROOT}/${lane.mail}_gmail_app_password`);
  const client=new ImapFlow({host:'imap.gmail.com',port:993,secure:true,auth:{user:row.sender,pass},
    tls:{rejectUnauthorized:true},logger:false,connectionTimeout:15000,greetingTimeout:15000,socketTimeout:20000});
  try {
    await client.connect();
    const sent=(await client.list()).filter((x:any)=>x.specialUse==='\\Sent');
    if(sent.length!==1) throw new Error('Sent folder not unique');
    const lock=await client.getMailboxLock(sent[0].path,{readOnly:true});
    try {
      if(!client.mailbox?.readOnly) throw new Error('Sent folder not read-only');
      const exact=await client.search({header:{'Message-ID':messageId}},{uid:true});
      if(!Array.isArray(exact)||exact.length) holds.push('OUTBOUND_MARKER_EXISTS_OR_SEARCH_UNCERTAIN');
      const baseline=Date.parse(row.last_verified_send_at||row.recipient_created_at);
      const uids=await client.search({to:row.recipient_email,since:new Date(baseline-86400000)},{uid:true});
      if(!Array.isArray(uids)||uids.length>200) throw new Error('Sent history incomplete');
      for(const uid of uids) {
        const m=await client.fetchOne(uid,{envelope:true,internalDate:true},{uid:true});
        if(!m?.envelope||!m.internalDate) throw new Error('Sent message metadata missing');
        if(Date.parse(String(m.internalDate))>baseline&&
          (m.envelope.to||[]).some((x:any)=>String(x.address||'').toLowerCase()===row.recipient_email))
          holds.push('NEW_MAIL_OUTBOUND_AFTER_LAST_VERIFIED_STEP');
      }
    } finally {lock.release();}
  } finally {try{await client.logout();}catch{}}
  const payload={from:row.sender,replyTo:row.sender,to:row.recipient_email,subject:copy.subject,
    html:copy.html,messageId,envelope:{from:row.sender,to:[row.recipient_email]}};
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(JSON.stringify(payload))))).map(x=>x.toString(16).padStart(2,'0')).join('');
  if(dry_run) return {dry_run:true,send_id,action:'NO_SEND',holds,transport:'gmail_smtp',
    intended_message_id:messageId,payload_sha256:hash,crm_write:false};
  if(holds.length) throw new Error(`Mail-only send held: ${[...new Set(holds)].join(',')}`);
  const smtp=nodemailer.createTransport({host:'smtp.gmail.com',port:587,secure:false,requireTLS:true,
    auth:{user:row.sender,pass},tls:{rejectUnauthorized:true},logger:false,debug:false,
    connectionTimeout:15000,greetingTimeout:15000,socketTimeout:30000});
  try {
    await smtp.verify();
    const caps=(await Promise.all(['pilot_global_daily_cap','pilot_sender_daily_cap',
      'pilot_rakesh_api_daily_cap','pilot_new_admissions_daily_cap'].map(x=>wmill.getVariable(`${ROOT}/${x}`)))).map(Number);
    if(caps.some(x=>!Number.isSafeInteger(x)||x<0)) throw new Error('Invalid daily caps');
    if(await wmill.getVariable(`${ROOT}/non_crm_sending_enabled`)!=='true'||
      await wmill.getVariable(`${ROOT}/delivery_enabled`)!=='true') throw new Error('Mail release closed');
    if(campaign&&await wmill.getVariable(`${ROOT}/sheet_campaign_authorization`)!==basis) throw new Error('Campaign release closed');
    if(queuesEnabled==='true'&&await wmill.getVariable(`${ROOT}/sender_domain_verified`)!=='true')
      throw new Error('Sender domain authentication held');
    const marked=await sql`WITH locked AS (
      SELECT s.id FROM mumbai_nurture_sends s JOIN mumbai_nurture_recipients r ON r.id=s.recipient_id
      WHERE s.id=${send_id} AND s.status='RESERVED' AND s.attempt_count=0 AND s.transport='gmail_smtp'
        AND s.reserved_at IS NOT NULL AND (s.reserved_at AT TIME ZONE 'Asia/Kolkata')::date=(now() AT TIME ZONE 'Asia/Kolkata')::date
        AND r.state='READY' AND r.collective='Mumbai' AND r.admission_mode='gmail' AND r.zoho_lead_id IS NULL
        AND r.email_normalized=s.recipient_email AND r.sender=s.sender AND r.owner_user_id=${lane.id}
        AND r.next_step=s.step AND r.source_version=s.sequence_version AND r.next_due_at<=now()
        AND (r.last_verified_send_at IS NULL OR r.last_verified_send_at<=now()-interval '48 hours')
        AND EXISTS(SELECT 1 FROM mumbai_nurture_admission_approvals a WHERE a.recipient_id=r.id
          AND a.reviewed_email=r.email_normalized AND a.source_version=r.source_version
          AND ((a.consent_confirmed AND a.active_sales_clear) OR (a.reviewed_by=${basis} AND NOT a.allow_crm_create)))
        AND EXISTS(SELECT 1 FROM mumbai_nurture_source_links l WHERE l.recipient_id=r.id AND l.source_present)
        AND NOT EXISTS(SELECT 1 FROM mumbai_nurture_events e WHERE e.recipient_id=r.id
          AND e.kind IN ('REPLY','OPTOUT','BOUNCE','SALES_HANDOFF','COLLECTIVE_CHANGE','ADDRESS_CHANGE','IDENTITY_HOLD'))
        AND EXISTS(SELECT 1 FROM mumbai_nurture_daily_capacity c WHERE c.local_day=(now() AT TIME ZONE 'Asia/Kolkata')::date
          AND c.scope='global' AND c.reserved_count BETWEEN 1 AND ${caps[0]})
        AND EXISTS(SELECT 1 FROM mumbai_nurture_daily_capacity c WHERE c.local_day=(now() AT TIME ZONE 'Asia/Kolkata')::date
          AND c.scope=${`from:${row.sender}`} AND c.reserved_count BETWEEN 1 AND ${caps[1]})
        AND EXISTS(SELECT 1 FROM mumbai_nurture_daily_capacity c WHERE c.local_day=(now() AT TIME ZONE 'Asia/Kolkata')::date
          AND c.scope=${`api:${lane.api}`} AND c.reserved_count BETWEEN 1 AND ${lane.api==='rakesh'?caps[2]:caps[1]})
        AND (s.step<>1 OR EXISTS(SELECT 1 FROM mumbai_nurture_daily_capacity c WHERE c.local_day=(now() AT TIME ZONE 'Asia/Kolkata')::date
          AND c.scope='new_admission' AND c.reserved_count BETWEEN 1 AND ${caps[3]}))
      FOR UPDATE OF s,r
    ) UPDATE mumbai_nurture_sends SET status='ATTEMPTING',attempt_count=1,attempted_at=now(),
      mail_message_id=${messageId},intended_payload_hash=${hash}
      WHERE id IN (SELECT id FROM locked) RETURNING id`.fetchOne();
    if(!marked) throw new Error('Mail-only send lost final eligibility race');
    let accepted=false;
    try {
      const info=await smtp.sendMail(payload);
      accepted=info.messageId===messageId&&info.accepted?.length===1&&
        String(info.accepted[0]).toLowerCase()===row.recipient_email&&!(info.rejected||[]).length;
    } catch {
      await sql`UPDATE mumbai_nurture_sends SET status='UNCERTAIN' WHERE id=${send_id} AND status='ATTEMPTING'`.execute();
      throw new Error('SMTP outcome uncertain; no automatic retry');
    }
    await sql`UPDATE mumbai_nurture_sends SET status='UNCERTAIN' WHERE id=${send_id} AND status='ATTEMPTING'`.execute();
    if(accepted) {
      try {return await reconcile(send_id,false);}catch{}
    }
    return {dry_run:false,send_id,dispatch_accepted:accepted,status:'UNCERTAIN',
      next_action:'VERIFY_EXACT_GMAIL_SENT_MESSAGE_NO_RETRY',crm_write:false};
  } finally {smtp.close();}
}
