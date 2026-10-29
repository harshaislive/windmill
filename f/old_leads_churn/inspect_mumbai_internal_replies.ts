import * as wmill from 'windmill-client';
import { ImapFlow } from 'imapflow';

const ROOT='f/old_leads_churn';
const FROM='sai@beforest.co';
const expected:Record<string,string>={
  'harsha@beforest.co':'tested.',
  'seshu@beforest.co':'tahnks for the information',
};

/** Exact read-only IMAP proof for the two approved internal sends. */
export async function main(record:boolean=false) {
  const sql=wmill.datatable('main');
  const tests=await sql`SELECT qa_key,recipient_email,attempted_at,status
    FROM mumbai_nurture_internal_tests
    WHERE qa_key IN ('mumbai-internal-e01-20260930-harsha',
      'mumbai-internal-e01-20260930-seshu') ORDER BY recipient_email`.fetch();
  if(tests.length!==2||tests.some((x:any)=>x.status!=='VERIFIED'))
    throw new Error('Both internal sends must be CRM-log verified first');
  const password=await wmill.getVariable(`${ROOT}/rakesh_gmail_app_password`);
  const client=new ImapFlow({host:'imap.gmail.com',port:993,secure:true,
    auth:{user:FROM,pass:password},logger:false,tls:{rejectUnauthorized:true},
    connectionTimeout:12000,greetingTimeout:12000,socketTimeout:20000});
  try {
    await client.connect();
    const all=(await client.list()).filter((x:any)=>x.specialUse==='\\All');
    if(all.length!==1) throw new Error('All Mail unavailable');
    const lock=await client.getMailboxLock(all[0].path,{readOnly:true});
    try {
      const box=client.mailbox;
      if(!box?.readOnly||!box.uidValidity) throw new Error('Mailbox not read-only');
      const validity=String(box.uidValidity);
      const output=[];
      for(const test of tests) {
        const email=String(test.recipient_email).toLowerCase();
        const since=new Date(new Date(test.attempted_at).getTime()-86400000);
        const ids=await client.search({from:email,since},{uid:true});
        if(ids===false||!Array.isArray(ids)||ids.length>30)
          throw new Error('Internal reply search ambiguous');
        const matches=[];
        const skipped={metadata:0,address_or_time:0,automated:0,text_missing:0};
        for(const uid of ids) {
          const m=await client.fetchOne(uid,{uid:true,envelope:true,internalDate:true,
            source:true,headers:['Auto-Submitted','List-Id','Precedence','In-Reply-To','References']},
            {uid:true});
          if(!m?.envelope||!m.internalDate||!m.source) {skipped.metadata++;continue;}
          const from=(m.envelope.from||[]).map((x:any)=>String(x.address||'').toLowerCase());
          const to=(m.envelope.to||[]).map((x:any)=>String(x.address||'').toLowerCase());
          const at=new Date(m.internalDate).getTime();
          if(from.length!==1||from[0]!==email||!to.includes(FROM)||
            at<=new Date(test.attempted_at).getTime()) {skipped.address_or_time++;continue;}
          const raw=String(m.source);
          if(/^(Auto-Submitted:\s*(?!no\s*$)|List-Id:|Precedence:\s*(?:bulk|list|junk))/im.test(raw))
            {skipped.automated++;continue;}
          const textPresent=raw.toLowerCase().includes(expected[email]);
          if(!textPresent) skipped.text_missing++;
          const subject=String(m.envelope.subject||'');
          const threadLike=/^re:\s*what if water came before the home\?\s*$/i.test(subject)&&
            /^(?:In-Reply-To|References):\s*\S+/im.test(raw);
          matches.push({uid,at:new Date(at).toISOString(),
            message_id:String(m.envelope.messageId||''),
            subject,thread_like:threadLike,expected_text_present:textPresent});
        }
        const exact=matches.filter(x=>x.expected_text_present||x.thread_like);
        if(record&&exact.length===1) {
          const m=exact[0];
          await sql`INSERT INTO mumbai_nurture_internal_replies
            (qa_key,recipient_email,sender_inbox,uid_validity,imap_uid,
             rfc_message_id,received_at)
            VALUES (${test.qa_key},${email},${FROM},${validity},${m.uid},
              ${m.message_id},${m.at}::timestamptz)
            ON CONFLICT (qa_key) DO NOTHING`.execute();
          const check=await sql`SELECT imap_uid,uid_validity FROM mumbai_nurture_internal_replies
            WHERE qa_key=${test.qa_key}`.fetchOne();
          if(Number(check?.imap_uid)!==m.uid||check.uid_validity!==validity)
            throw new Error('Internal reply event read-back mismatch');
        }
        output.push({recipient_email:email,qa_key:test.qa_key,
          search_count:ids.length,skipped,exact_reply_count:exact.length,
          matches:exact,recorded:record&&exact.length===1});
      }
      return {mailbox:'All Mail',read_only:true,uid_validity:validity,replies:output};
    } finally {lock.release();}
  } finally {try{await client.logout();}catch{/* no logging */}}
}
