import {main as suppress} from './record_mumbai_suppression';
import * as wmill from 'windmill-client';
import { ImapFlow } from 'imapflow';

const ROOT='f/old_leads_churn';
const lanes:Record<string,string>={
  'sai@beforest.co':'rakesh','community@beforest.co':'community',
  'yogesh@beforest.co':'yogesh','harish@beforest.co':'harish'};

function parseDsn(raw:string) {
  const recipients=[...raw.matchAll(/^(?:Final-Recipient|Original-Recipient|X-Failed-Recipients):\s*(?:rfc822\s*;\s*)?([^\s<>;,]+)/gim)]
    .map(x=>x[1].trim().toLowerCase());
  const status=raw.match(/^Status:\s*([245])\.[0-9]+\.[0-9]+/im)?.[1]||null;
  return {recipients:[...new Set(recipients)],classification:
    status==='5'?'HARD_BOUNCE':status==='4'?'SOFT_BOUNCE':'AMBIGUOUS_DSN'};
}

/** One mailbox-level read-only DSN search, once per sender rather than per recipient. */
export async function main(sender:string,record:boolean=false,fixture_source:string='') {
  if(!lanes[sender]) throw new Error('Sender not in fixed lane allowlist');
  if(fixture_source) return {synthetic_only:true,record:false,...parseDsn(fixture_source)};
  const sql=wmill.datatable('main');
  const cursor=await sql`SELECT uid_validity,last_uid,updated_at
    FROM mumbai_nurture_bounce_cursors WHERE sender=${sender}`.fetchOne();
  const pass=await wmill.getVariable(`${ROOT}/${lanes[sender]}_gmail_app_password`);
  const client=new ImapFlow({host:'imap.gmail.com',port:993,secure:true,
    auth:{user:sender,pass},logger:false,tls:{rejectUnauthorized:true},
    connectionTimeout:12000,greetingTimeout:12000,socketTimeout:20000});
  try {
    await client.connect();
    const all=(await client.list()).filter((m:any)=>m.specialUse==='\\All');
    if(all.length!==1) return {sender,safe_to_continue:false,action:'HOLD_ALL_MAIL_UNAVAILABLE'};
    const lock=await client.getMailboxLock(all[0].path,{readOnly:true});
    try {
      const box=client.mailbox;
      if(!box?.readOnly||!box.uidValidity||!box.uidNext)
        return {sender,safe_to_continue:false,action:'HOLD_BOUNCE_CURSOR_UNAVAILABLE'};
      const validity=String(box.uidValidity);
      if(cursor&&cursor.uid_validity!==validity)
        return {sender,safe_to_continue:false,action:'HOLD_BOUNCE_UIDVALIDITY_CHANGED'};
      const since=cursor?new Date(new Date(cursor.updated_at).getTime()-86400000):
        new Date(Date.now()-7*86400000);
      const uids=await client.search({from:'mailer-daemon',since},{uid:true});
      if(uids===false||!Array.isArray(uids)||uids.length>100)
        return {sender,safe_to_continue:false,action:'HOLD_BOUNCE_SEARCH_UNCERTAIN'};
      const matched:any[]=[];
      let ambiguous=0;
      for(const uid of uids) {
        if(cursor&&uid<=Number(cursor.last_uid)) continue;
        const m=await client.fetchOne(uid,{uid:true,source:true,internalDate:true},{uid:true});
        if(!m?.source||!m.internalDate||m.source.length>1000000) {ambiguous++;continue;}
        const dsn=parseDsn(String(m.source));
        if(!dsn.recipients.length) {ambiguous++;continue;}
        for(const email of dsn.recipients) {
          const recipient=await sql`SELECT r.id FROM mumbai_nurture_recipients r
            WHERE r.email_normalized=${email} AND r.sender=${sender}
              AND EXISTS (SELECT 1 FROM mumbai_nurture_sends s
                WHERE s.recipient_id=r.id AND s.status='VERIFIED_SENT'
                  AND s.verified_at<=${new Date(m.internalDate).toISOString()}::timestamptz)`.fetchOne();
          if(!recipient) continue;
          matched.push({uid,recipient_id:Number(recipient.id),classification:dsn.classification,
            at:new Date(m.internalDate).toISOString()});
        }
      }
      const summary={sender,mailbox:'All Mail',uid_validity:validity,
        scanned_dsn_count:uids.length,matched_count:matched.length,
        ambiguous_count:ambiguous,hard_count:matched.filter(x=>x.classification==='HARD_BOUNCE').length,
        soft_count:matched.filter(x=>x.classification==='SOFT_BOUNCE').length,
        safe_to_continue:ambiguous===0 && matched.length===0};
      if(!record||ambiguous) return {...summary,action:ambiguous?'HOLD_AMBIGUOUS_DSN':'PREVIEW_ONLY'};
      for(const x of matched) {
        const kind=x.classification==='HARD_BOUNCE'?'BOUNCE':'IDENTITY_HOLD';
        await suppress(x.recipient_id,kind,`dsn:${lanes[sender]}:${validity}:${x.uid}:${x.recipient_id}`,
          'imap_dsn',{sender,uid_validity:validity,uid:x.uid,classification:x.classification},x.at,false);
      }
      const maxUid=Number(box.uidNext)-1;
      await sql`INSERT INTO mumbai_nurture_bounce_cursors
        (sender,uid_validity,last_uid) VALUES (${sender},${validity},${maxUid})
        ON CONFLICT (sender) DO UPDATE SET uid_validity=EXCLUDED.uid_validity,
          last_uid=EXCLUDED.last_uid,updated_at=now()
        WHERE mumbai_nurture_bounce_cursors.uid_validity=EXCLUDED.uid_validity`.execute();
      const check=await sql`SELECT last_uid FROM mumbai_nurture_bounce_cursors
        WHERE sender=${sender} AND uid_validity=${validity}`.fetchOne();
      if(Number(check?.last_uid)!==maxUid) throw new Error('Bounce cursor read-back failed');
      return {...summary,safe_to_continue:true,action:'DSN_SCAN_RECORDED'};
    } finally {lock.release();}
  } catch {
    return {sender,safe_to_continue:false,action:'HOLD_BOUNCE_SCAN_FAILED'};
  } finally {try{await client.logout();}catch{/* no logging */}}
}
