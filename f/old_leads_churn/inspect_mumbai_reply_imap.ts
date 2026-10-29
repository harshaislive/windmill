import * as wmill from 'windmill-client';
import { ImapFlow } from 'imapflow';

const ROOT = 'f/old_leads_churn';
const lanes: Record<string,string> = {
  'sai@beforest.co':'rakesh','community@beforest.co':'community',
  'yogesh@beforest.co':'yogesh','harish@beforest.co':'harish',
};

const normalizeId = (value: unknown) => String(value || '').trim().replace(/^<|>$/g,'').toLowerCase();
function headers(raw: Buffer | undefined) {
  const result: Record<string,string> = {};
  const unfolded = String(raw || '').replace(/\r?\n[ \t]+/g,' ');
  for (const line of unfolded.split(/\r?\n/)) {
    const at = line.indexOf(':');
    if (at > 0) result[line.slice(0,at).toLowerCase()] = line.slice(at+1).trim();
  }
  return result;
}
function safeClass(error: unknown) {
  const value = String((error as any)?.code || '')+' '+String((error as any)?.message || '');
  if (/certificate|cert_|tls|ssl/i.test(value)) return 'TLS_VERIFICATION_FAILED';
  if (/auth|login|credentials/i.test(value)) return 'AUTHENTICATION_FAILED';
  if (/timeout|timed out/i.test(value)) return 'CONNECTION_TIMEOUT';
  return 'IMAP_SCAN_FAILED';
}

/** Read-only by default; scans Gmail All Mail without marking messages read. */
export async function main(recipient_id: number, record: boolean = false) {
  if (!Number.isSafeInteger(recipient_id) || recipient_id < 1) throw new Error('Invalid recipient id');
  const sql = wmill.datatable('main');
  const row = await sql`SELECT r.id,r.email_normalized,r.sender,r.state,r.created_at,
    min(s.verified_at) FILTER (WHERE s.status='VERIFIED_SENT') first_sent_at
    FROM mumbai_nurture_recipients r LEFT JOIN mumbai_nurture_sends s ON s.recipient_id=r.id
    WHERE r.id=${recipient_id} GROUP BY r.id`.fetchOne();
  if (!row) throw new Error('Recipient not found');
  const lane = lanes[row.sender];
  if (!lane) return {recipient_id,safe_to_send:false,action:'HOLD_UNKNOWN_SENDER'};
  const password = await wmill.getVariable(`${ROOT}/${lane}_gmail_app_password`);
  const client = new ImapFlow({host:'imap.gmail.com',port:993,secure:true,
    auth:{user:row.sender,pass:password},logger:false,tls:{rejectUnauthorized:true},
    connectionTimeout:12000,greetingTimeout:12000,socketTimeout:15000});
  try {
    await client.connect();
    const allMail = (await client.list()).filter((m:any) => m.specialUse==='\\All');
    if (allMail.length!==1) return {recipient_id,safe_to_send:false,
      action:'HOLD_ALL_MAIL_NOT_UNIQUE_OR_UNAVAILABLE'};
    const lock = await client.getMailboxLock(allMail[0].path,{readOnly:true});
    try {
      const box = client.mailbox;
      if (!box?.readOnly || !box.uidValidity || !box.uidNext)
        return {recipient_id,safe_to_send:false,action:'HOLD_MAILBOX_CURSOR_UNAVAILABLE'};
      const validity = String(box.uidValidity);
      const cursor = await sql`SELECT sender,uid_validity,last_uid FROM mumbai_nurture_mail_cursors
        WHERE recipient_id=${recipient_id}`.fetchOne();
      if (cursor && (cursor.sender!==row.sender || cursor.uid_validity!==validity))
        return {recipient_id,safe_to_send:false,action:'HOLD_UIDVALIDITY_OR_SENDER_CHANGED'};
      const anchor = row.first_sent_at || row.created_at;
      const since = new Date(new Date(anchor).getTime()-24*3600000);
      const result = await client.search({from:row.email_normalized,since},{uid:true});
      if (result===false || !Array.isArray(result))
        return {recipient_id,safe_to_send:false,action:'HOLD_IMAP_SEARCH_UNCERTAIN'};
      if (result.length>100) return {recipient_id,safe_to_send:false,
        action:'HOLD_TOO_MANY_MATCHING_MAIL_UIDS',matching_uid_count:result.length};
      const confirmed: Array<{uid:number,at:string,message_id:string,classification:string,subject:string}> = [];
      const ambiguous: Array<{uid:number,reason:string}> = [];
      for (const uid of result) {
        const m = await client.fetchOne(uid,{uid:true,envelope:true,internalDate:true,
          headers:['Auto-Submitted','X-Autoreply','List-Id','Precedence','References','In-Reply-To']},
          {uid:true});
        if (!m || !m.envelope || !m.internalDate) {
          ambiguous.push({uid,reason:'MAIL_METADATA_UNAVAILABLE'}); continue;
        }
        const at = new Date(m.internalDate).getTime();
        if (!Number.isFinite(at)) { ambiguous.push({uid,reason:'INVALID_DATE'}); continue; }
        if (at<=new Date(anchor).getTime()) continue;
        const from = (m.envelope.from || []).map((a:any)=>String(a.address || '').toLowerCase());
        const to = (m.envelope.to || []).map((a:any)=>String(a.address || '').toLowerCase());
        if (from.length!==1 || from[0]!==row.email_normalized || !to.includes(row.sender)) {
          ambiguous.push({uid,reason:'EXACT_ADDRESS_MISMATCH'}); continue;
        }
        const h = headers(m.headers);
        if ((h['auto-submitted'] && h['auto-submitted'].toLowerCase()!=='no') ||
            h['x-autoreply'] || h['list-id'] || /bulk|list|junk/i.test(h.precedence || '')) {
          ambiguous.push({uid,reason:'AUTO_OR_LIST_MAIL'}); continue;
        }
        if (!row.first_sent_at) { ambiguous.push({uid,reason:'NO_VERIFIED_OUTBOUND'}); continue; }
        // Zoho's CRM message_id is opaque; do not pretend it is an RFC Message-ID.
        // Any exact manual inbound after a verified send stops nurture, including an
        // unthreaded opt-out or a separate active sales conversation.
        const hasReferences = Boolean(h.references || h['in-reply-to'] || m.envelope.inReplyTo);
        confirmed.push({uid,at:new Date(at).toISOString(),
          subject:String(m.envelope.subject||'').slice(0,300),
          message_id:normalizeId(m.envelope.messageId),
          classification:hasReferences ? 'INBOUND_CONVERSATION_WITH_REFERENCES' :
            'UNTHREADED_INBOUND_CONVERSATION'});
      }
      const summary = {recipient_id,source:'imap.gmail.com',mailbox:'All Mail',
        uid_validity:validity,checked_through_uid:Number(box.uidNext)-1,
        prior_cursor_uid:cursor ? Number(cursor.last_uid) : null,
        confirmed_count:confirmed.length,ambiguous_count:ambiguous.length,
        ambiguous_reasons:[...new Set(ambiguous.map(x=>x.reason))]};
      if (ambiguous.length) return {...summary,safe_to_send:false,
        action:'HOLD_AMBIGUOUS_INBOUND_FOR_REVIEW'};
      if (confirmed.length) {
        if (!record) return {...summary,safe_to_send:false,action:'CONFIRMED_REPLY_PREVIEW'};
        const first = confirmed.sort((a,b)=>a.at.localeCompare(b.at))[0];
        const eventKey = `imap:${lane}:${validity}:${first.uid}`;
        const evidence = JSON.stringify({mailbox:'All Mail',sender:row.sender,
          uid_validity:validity,uid:first.uid,message_id:first.message_id,
          subject:first.subject,review_status:'AWAITING_HARSHA_REVIEW',
          classification:first.classification});
        await sql`WITH target AS (
          SELECT id FROM mumbai_nurture_recipients WHERE id=${recipient_id} FOR UPDATE
        ), event AS (
          INSERT INTO mumbai_nurture_events
            (event_key,recipient_id,kind,source,evidence,occurred_at)
          SELECT ${eventKey},id,'REPLY','imap',${evidence}::jsonb,
            ${first.at}::timestamptz FROM target
          ON CONFLICT (event_key) DO NOTHING RETURNING event_key
        ) UPDATE mumbai_nurture_recipients SET state='SUPPRESSED',stop_reason='REPLY',
          next_due_at=NULL,updated_at=now()
          WHERE id IN (SELECT id FROM target) AND state<>'SUPPRESSED'`.execute();
        const check = await sql`SELECT r.state,r.stop_reason,e.kind FROM mumbai_nurture_recipients r
          JOIN mumbai_nurture_events e ON e.recipient_id=r.id
          WHERE r.id=${recipient_id} AND e.event_key=${eventKey}`.fetchOne();
        if (check?.state!=='SUPPRESSED' || check?.kind!=='REPLY')
          throw new Error('Reply suppression read-back failed');
        return {...summary,safe_to_send:false,action:'REPLY_RECORDED_SUPPRESSED',
          classification:first.classification,event_key:eventKey};
      }
      if (record) {
        const maxUid = Number(box.uidNext)-1;
        await sql`INSERT INTO mumbai_nurture_mail_cursors
          (recipient_id,sender,uid_validity,last_uid) VALUES
          (${recipient_id},${row.sender},${validity},${maxUid})
          ON CONFLICT (recipient_id) DO UPDATE SET last_uid=EXCLUDED.last_uid,
            updated_at=now() WHERE mumbai_nurture_mail_cursors.sender=EXCLUDED.sender
            AND mumbai_nurture_mail_cursors.uid_validity=EXCLUDED.uid_validity`.execute();
        const check = await sql`SELECT last_uid FROM mumbai_nurture_mail_cursors
          WHERE recipient_id=${recipient_id} AND sender=${row.sender}
            AND uid_validity=${validity}`.fetchOne();
        if (Number(check?.last_uid)!==maxUid) throw new Error('IMAP cursor read-back failed');
      }
      return {...summary,safe_to_send:true,action:'NO_MATCHING_POST_BASELINE_INBOUND'};
    } finally { lock.release(); }
  } catch (error) {
    return {recipient_id,safe_to_send:false,action:safeClass(error),
      recording_outcome:'VERIFY_JOURNAL_BEFORE_RETRY'};
  } finally { try { await client.logout(); } catch { /* no logging */ } }
}
