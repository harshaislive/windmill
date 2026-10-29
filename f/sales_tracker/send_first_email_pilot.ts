import * as wmill from 'windmill-client';
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';

const BATCH='first-email-three-collectives-20261012-01';
const SENDER='sai@beforest.co';
const SHEET='1MuhXeDttrZCy6yOolrGNvwU8hlAHD6JbvLOJW80_ni0';
const CONNECTION='6463e553-eab2-4cb9-a46f-b1a5665c0031';
const COLLECTIVES=['Mumbai','Hammiyala','Poomaale 2.0'];

// One explicitly authorized 10-per-collective batch, preview-only. No Sheet writes.
export async function main(manifest:any[]=[],execute:boolean=false,approval_batch:string='',readback_only:boolean=false) {
  const sql=wmill.datatable('main');
  if(readback_only) return {batch:BATCH,attempts:await sql`SELECT * FROM sales_tracker_first_email_attempts WHERE batch_id=${BATCH} ORDER BY attempted_at`.fetch()};
  if(manifest.length!==30||new Set(manifest.map(r=>r.email)).size!==30||COLLECTIVES.some(c=>manifest.filter(r=>r.collective===c).length!==10)) throw new Error('Exactly 10 unique recipients per approved collective required');
  if(manifest.some(r=>!COLLECTIVES.includes(r.collective)||r.payload.from!==SENDER||r.payload.replyTo!==SENDER||r.payload.to!==r.email||!r.payload.subject||r.payload.messageId!==`<${BATCH}-${r.sheet_id}-${r.original_row}@beforest.co>`||!r.payload.text.includes('+91 89779 45351')||!r.payload.text.endsWith('Rakesh\nBeforest')||/\{\{/.test(r.payload.text))) throw new Error('Unexpected message scope or unresolved variable');
  if(!execute) return {dry_run:true,batch:BATCH,manifest,messages_sent:0};
  if(approval_batch!==BATCH) throw new Error('Exact batch approval required');
  // A single retry must never restart already sent rows or silently replace recipients.
  await sql`CREATE TABLE IF NOT EXISTS sales_tracker_first_email_attempts (
    batch_id text NOT NULL,lead_key text NOT NULL,collective text NOT NULL,recipient text NOT NULL,
    status text NOT NULL,job_id text,payload jsonb NOT NULL,result jsonb,
    attempted_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(batch_id,lead_key)
  )`.execute();
  const prior=await sql`SELECT lead_key,recipient,status FROM sales_tracker_first_email_attempts WHERE batch_id=${BATCH}`.fetch();
  if(prior.length) return {batch:BATCH,blocked:'Batch already attempted; no automatic retry',attempts:prior};
  const maton=await wmill.getVariable('f/old_leads_churn/harsha_maton_api_key');
  const ranges=COLLECTIVES.map(c=>`ranges=${encodeURIComponent(`'${c}'!A1:AZ1000`)}`).join('&');
  const sheetResponse=await fetch(`https://api.maton.ai/google-sheets/v4/spreadsheets/${SHEET}/values:batchGet?valueRenderOption=UNFORMATTED_VALUE&${ranges}`,
    {headers:{Authorization:`Bearer ${maton}`,'Maton-Connection':CONNECTION},signal:AbortSignal.timeout(30000)});
  if(!sheetResponse.ok) throw new Error(`Current Sheet review failed HTTP ${sheetResponse.status}`);
  const current=await sheetResponse.json();
  for(const item of manifest) {
    const index=COLLECTIVES.indexOf(item.collective);
    const rows=current.valueRanges[index].values;
    const h=rows[0];const keyIndex=h.indexOf('Lead key');
    const matched=rows.slice(1).filter((r:any[])=>r[keyIndex]===item.lead_key);
    if(matched.length!==1) throw new Error(`Current lead identity changed: ${item.lead_key}`);
    const r=matched[0];
    const value=(name:string)=>h.includes(name)?String(r[h.indexOf(name)]??'').trim():'';
    if(value('Email').toLowerCase()!==item.email||value('Email sent')||value('Meeting date')||/^(yes|booked|true)$/i.test(value('Meeting booked'))||!/^(unknown|no reply|pending|)$/i.test(value('Reply status'))||!/^(true|i agree|yes)$/i.test(value('Contact consent'))||/closed|lost|won|do not|unsub|stop/i.test(value('Deal Final Status'))) throw new Error(`Current row is no longer eligible: ${item.collective}/${item.email}`);
  }
  const pass=await wmill.getVariable('f/old_leads_churn/rakesh_gmail_app_password');
  const smtp=nodemailer.createTransport({host:'smtp.gmail.com',port:587,secure:false,requireTLS:true,
    auth:{user:SENDER,pass},tls:{rejectUnauthorized:true},logger:false,debug:false,
    connectionTimeout:15000,greetingTimeout:15000,socketTimeout:30000});
  const client=new ImapFlow({host:'imap.gmail.com',port:993,secure:true,auth:{user:SENDER,pass},logger:false,
    tls:{rejectUnauthorized:true},connectionTimeout:15000,greetingTimeout:15000,socketTimeout:30000});
  const results:any[]=[];
  try {
    await smtp.verify();await client.connect();
    const boxes=await client.list();const all=boxes.find((b:any)=>b.specialUse==='\\All');const sent=boxes.find((b:any)=>b.specialUse==='\\Sent');
    if(!all||!sent) throw new Error('Mailbox proof folders unavailable');
    for(const item of manifest) {
      const lock=await client.getMailboxLock(all.path,{readOnly:true});
      try {
        const incoming=await client.search({from:item.email,since:new Date('2026-08-12T00:00:00+05:30')},{uid:true});
        const recent=await client.search({to:item.email,since:new Date(Date.now()-48*3600000)},{uid:true});
        const exact=await client.search({header:{'Message-ID':item.payload.messageId}},{uid:true});
        if(!Array.isArray(incoming)||!Array.isArray(recent)||!Array.isArray(exact)||incoming.length||recent.length||exact.length) return {batch:BATCH,halted:true,reason:'Mailbox activity changed; owner review required',held_recipient:item.email,results};
      } finally {lock.release();}
      const claim=await sql`INSERT INTO sales_tracker_first_email_attempts(batch_id,lead_key,collective,recipient,status,job_id,payload)
        VALUES(${BATCH},${item.lead_key},${item.collective},${item.email},'ATTEMPTING',${process.env.WM_JOB_ID??null},${JSON.stringify(item.payload)}::jsonb)
        ON CONFLICT DO NOTHING RETURNING lead_key`.fetchOne();
      if(!claim) return {batch:BATCH,halted:true,reason:'Another job claimed recipient',results};
      const started=new Date().toISOString();const start=Date.now();let info:any;
      try {info=await smtp.sendMail(item.payload);} catch {
        await sql`UPDATE sales_tracker_first_email_attempts SET status='UNCERTAIN',result=${JSON.stringify({request_started_at_utc:started,no_automatic_retry:true})}::jsonb,updated_at=now() WHERE batch_id=${BATCH} AND lead_key=${item.lead_key}`.execute();
        return {batch:BATCH,halted:true,reason:'SMTP outcome uncertain; reconcile before any retry',recipient:item.email,results};
      }
      const accepted=info.messageId===item.payload.messageId&&info.accepted?.length===1&&String(info.accepted[0]).toLowerCase()===item.email&&!info.rejected?.length;
      const result:any={collective:item.collective,lead_key:item.lead_key,recipient:item.email,sender:SENDER,
        job_id:process.env.WM_JOB_ID??null,message_id:info.messageId,accepted:info.accepted,rejected:info.rejected,
        smtp_response:info.response,request_started_at_utc:started,response_received_at_utc:new Date().toISOString(),
        elapsed_ms:Date.now()-start,sent_folder_verified:false,recipient_delivery_verified:false};
      await sql`UPDATE sales_tracker_first_email_attempts SET status=${accepted?'SMTP_ACCEPTED':'UNACCEPTED'},result=${JSON.stringify(result)}::jsonb,updated_at=now() WHERE batch_id=${BATCH} AND lead_key=${item.lead_key}`.execute();
      if(accepted) {
        const sentLock=await client.getMailboxLock(sent.path,{readOnly:true});
        try {
          for(let attempt=0;attempt<3;attempt++) {
            const uids=await client.search({header:{'Message-ID':item.payload.messageId}},{uid:true});
            if(Array.isArray(uids)&&uids.length===1) {
              const m=await client.fetchOne(uids[0],{envelope:true,internalDate:true},{uid:true});
              if(m?.envelope?.messageId===item.payload.messageId&&(m.envelope.to||[]).some((r:any)=>String(r.address).toLowerCase()===item.email)) {
                result.sent_folder_verified=true;result.sent_uid=uids[0];result.sent_internal_date=m.internalDate;result.sent_folder=sent.path;break;
              }
            }
            if(attempt<2) await new Promise(resolve=>setTimeout(resolve,1000));
          }
        } finally {sentLock.release();}
      }
      const status=result.sent_folder_verified?'SENT_FOLDER_VERIFIED':accepted?'SMTP_ACCEPTED':'UNACCEPTED';
      await sql`UPDATE sales_tracker_first_email_attempts SET status=${status},result=${JSON.stringify(result)}::jsonb,updated_at=now() WHERE batch_id=${BATCH} AND lead_key=${item.lead_key}`.execute();
      results.push({status,...result});
      console.log(`${item.collective}: ${results.filter(r=>r.collective===item.collective).length}/10 ${status}`);
      if(!result.sent_folder_verified) return {batch:BATCH,halted:true,reason:'Sent proof not complete; no automatic retry',results};
    }
    return {batch:BATCH,results,sent_verified_count:results.filter(r=>r.sent_folder_verified).length,
      counts:Object.fromEntries(COLLECTIVES.map(c=>[c,results.filter(r=>r.collective===c&&r.sent_folder_verified).length])),
      sheet_writes:0,crm_writes:0,recipient_delivery_verified:false};
  } finally {smtp.close();try {await client.logout();}catch{}}
}
