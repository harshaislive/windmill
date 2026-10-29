import * as wmill from 'windmill-client';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

// Read-only inspection of the exact authorized 30-message cohort. No sends or Sheet writes.
export async function main() {
  const sql=wmill.datatable('main');
  const attempts=await sql`SELECT collective,recipient,payload,result,attempted_at,status FROM sales_tracker_first_email_attempts
    WHERE batch_id='first-email-three-collectives-20261012-01' ORDER BY attempted_at`.fetch();
  if(attempts.length!==30||attempts.some((r:any)=>r.status!=='SENT_FOLDER_VERIFIED')) throw new Error('Verified cohort incomplete');
  const sender='sai@beforest.co';
  const pass=await wmill.getVariable('f/old_leads_churn/rakesh_gmail_app_password');
  const client=new ImapFlow({host:'imap.gmail.com',port:993,secure:true,auth:{user:sender,pass},logger:false,
    tls:{rejectUnauthorized:true},connectionTimeout:15000,greetingTimeout:15000,socketTimeout:30000});
  const replies:any[]=[];const automated:any[]=[];const bounces:any[]=[];const possible:any[]=[];const checked:string[]=[];
  const earliest=new Date(Math.min(...attempts.map((r:any)=>new Date(r.result.request_started_at_utc).getTime())));
  const seen=new Set<string>();
  try {
    await client.connect();
    const boxes=await client.list();const all=boxes.find((b:any)=>b.specialUse==='\\All');
    if(!all) throw new Error('All Mail unavailable');
    const folders=[all,...boxes.filter((b:any)=>b.specialUse==='\\Junk')];
    for(const box of folders) {
      const lock=await client.getMailboxLock(box.path,{readOnly:true});
      try {
        checked.push(box.path);
        for(const item of attempts) {
          const ids=await client.search({from:item.recipient,since:earliest},{uid:true});
          if(!Array.isArray(ids)||ids.length>50) throw new Error('Reply search incomplete');
          for(const uid of ids) {
            const m=await client.fetchOne(uid,{source:true,internalDate:true,envelope:true},{uid:true});
            if(!m?.source||!m.internalDate) throw new Error('Reply metadata unavailable');
            if(new Date(m.internalDate).getTime()<new Date(item.result.request_started_at_utc).getTime()) continue;
            const parsed=await simpleParser(m.source);
            const from=parsed.from?.value.map((r:any)=>String(r.address).toLowerCase())||[];
            if(!from.includes(item.recipient)) continue;
            const id=parsed.messageId||`${box.path}:${uid}`;if(seen.has(id)) continue;seen.add(id);
            const reference=String(parsed.inReplyTo||'')+' '+JSON.stringify(parsed.references||[]);
            const exact=reference.includes(item.payload.messageId);
            const sameSubject=String(parsed.subject||'').replace(/^(re|fw|fwd):\s*/ig,'').trim().toLowerCase()===item.payload.subject.toLowerCase();
            const auto=String(parsed.headers.get('auto-submitted')||'');
            const isAuto=(auto&&auto.toLowerCase()!=='no')||parsed.headers.has('list-id')||/auto.?reply|out of office|automatic reply/i.test(parsed.subject||'');
            const entry={collective:item.collective,recipient:item.recipient,received_at_utc:new Date(m.internalDate).toISOString(),
              subject:parsed.subject,message_id:parsed.messageId,in_reply_to:parsed.inReplyTo,exact_thread_match:exact,
              same_subject:sameSubject,folder:box.path,uid,text:(parsed.text||'').slice(0,3000)};
            if(isAuto) automated.push(entry);else if(exact||sameSubject) replies.push(entry);else possible.push(entry);
          }
        }
        const ids=await client.search({since:earliest,or:[{from:'mailer-daemon'},{from:'postmaster'},{subject:'Delivery Status Notification'},{subject:'Undeliverable'}]},{uid:true});
        if(!Array.isArray(ids)||ids.length>200) throw new Error('Bounce search incomplete');
        for(const uid of ids) {
          const m=await client.fetchOne(uid,{source:true,internalDate:true},{uid:true});
          if(!m?.source||!m.internalDate) throw new Error('Bounce metadata unavailable');
          if(new Date(m.internalDate).getTime()<earliest.getTime()) continue;
          const parsed=await simpleParser(m.source);const raw=m.source.toString();
          const id=parsed.messageId||`${box.path}:${uid}`;if(seen.has(id))continue;
          const matches=attempts.filter((r:any)=>raw.includes(r.payload.messageId)||raw.toLowerCase().includes(r.recipient.toLowerCase()));
          if(!matches.length) continue;seen.add(id);
          bounces.push({received_at_utc:new Date(m.internalDate).toISOString(),message_id:parsed.messageId,
            subject:parsed.subject,folder:box.path,uid,affected:matches.map((r:any)=>({collective:r.collective,recipient:r.recipient,exact_message_id_match:raw.includes(r.payload.messageId)})),
            text:(parsed.text||'').slice(0,4500)});
        }
      } finally {lock.release();}
    }
    return {checked_at_utc:new Date().toISOString(),sender,cohort_size:30,read_only:true,folders_checked:checked,
      replies,automated_responses:automated,other_inbound_from_recipients:possible,bounces,
      reply_count:replies.length,bounce_notice_count:bounces.length,
      counts:Object.fromEntries(['Mumbai','Hammiyala','Poomaale 2.0'].map(c=>[c,{replies:replies.filter(r=>r.collective===c).length,bounced_recipients:new Set(bounces.flatMap(b=>b.affected.filter((r:any)=>r.collective===c).map((r:any)=>r.recipient))).size}])),
      emails_sent:0,sheet_writes:0};
  } finally {try {await client.logout();}catch{}}
}
