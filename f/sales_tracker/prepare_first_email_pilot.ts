import * as wmill from 'windmill-client';
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';

// Read-only candidate, reply, SMTP and existing campaign review. No sends or writes.
export async function main(candidates:any[]=[]) {
  if(!candidates.length||candidates.length>400||candidates.some(c=>!['Mumbai','Hammiyala','Poomaale 2.0'].includes(c.collective))) throw new Error('Unexpected candidate scope');
  const sender='sai@beforest.co';
  const pass=await wmill.getVariable('f/old_leads_churn/rakesh_gmail_app_password');
  const smtp=nodemailer.createTransport({host:'smtp.gmail.com',port:587,secure:false,requireTLS:true,
    auth:{user:sender,pass},tls:{rejectUnauthorized:true},logger:false,debug:false,
    connectionTimeout:15000,greetingTimeout:15000,socketTimeout:20000});
  try {await smtp.verify();} finally {smtp.close();}
  const sql=wmill.datatable('main');
  const active=await sql`SELECT email_normalized,state,next_step,stop_reason FROM mumbai_nurture_recipients
    WHERE state IN ('READY','ACTIVE','ENROLLED') OR stop_reason IN ('REPLY','OPTOUT','BOUNCE','SALES_HANDOFF')`.fetch();
  const holds=new Map(active.map((r:any)=>[String(r.email_normalized).toLowerCase(),r]));
  const selected:any[]=[];const excluded:any[]=[];const used=new Set<string>();
  const client=new ImapFlow({host:'imap.gmail.com',port:993,secure:true,auth:{user:sender,pass},logger:false,
    tls:{rejectUnauthorized:true},connectionTimeout:15000,greetingTimeout:15000,socketTimeout:30000});
  try {
    await client.connect();
    const boxes=await client.list();
    const all=boxes.find((b:any)=>b.specialUse==='\\All');
    if(!all) throw new Error('All Mail unavailable; reply review incomplete');
    const lock=await client.getMailboxLock(all.path,{readOnly:true});
    try {
      for(const collective of ['Mumbai','Hammiyala','Poomaale 2.0']) {
        let count=0;
        for(const c of candidates.filter(c=>c.collective===collective).sort((a,b)=>a.date_serial-b.date_serial)) {
          if(count===10) break;
          const reasons:string[]=[];
          if(used.has(c.email)) reasons.push('DUPLICATE_IN_THIS_BATCH');
          if(holds.has(c.email)) reasons.push('EXISTING_ACTIVE_CAMPAIGN_OR_STOP');
          if(!reasons.length) {
            const incoming=await client.search({from:c.email,since:new Date('2026-08-12T00:00:00+05:30')},{uid:true});
            if(!Array.isArray(incoming)) throw new Error('Incomplete inbound search');
            if(incoming.length) reasons.push('EXISTING_INBOUND_REQUIRES_OWNER_REVIEW');
            const outgoing=await client.search({to:c.email,since:new Date(Date.now()-48*3600000)},{uid:true});
            if(!Array.isArray(outgoing)) throw new Error('Incomplete recent outbound search');
            if(outgoing.length) reasons.push('OUTBOUND_WITHIN_48_HOURS');
            const same=await client.search({to:c.email,subject:`A conversation about ${collective}`},{uid:true});
            if(!Array.isArray(same)) throw new Error('Incomplete duplicate search');
            if(same.length) reasons.push('EMAIL_1_SUBJECT_ALREADY_PRESENT');
          }
          if(reasons.length) excluded.push({collective,row:c.row,email:c.email,reasons});
          else {selected.push(c);used.add(c.email);count++;}
        }
      }
    } finally {lock.release();}
    return {sender,smtp_authenticated:true,mailbox_review_read_only:true,selected,excluded,
      counts:Object.fromEntries(['Mumbai','Hammiyala','Poomaale 2.0'].map(c=>[c,selected.filter(r=>r.collective===c).length])),
      emails_sent:0,sheet_writes:0};
  } finally {try {await client.logout();}catch{}}
}
