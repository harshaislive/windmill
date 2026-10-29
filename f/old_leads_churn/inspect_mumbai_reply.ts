import * as wmill from 'windmill-client';

const ROOT = 'f/old_leads_churn';
const address = (header: string) => {
  if (header.includes(',') || /\r|\n/.test(header)) return null;
  const match = header.match(/<([^<>]+@[^<>]+)>/);
  const value = (match ? match[1] : header).trim().toLowerCase();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value) ? value : null;
};

/** Exact inbox reply evidence preview. Missing sender connection fails closed. */
export async function main(recipient_id: number, record: boolean = false) {
  if (!Number.isSafeInteger(recipient_id) || recipient_id < 1) throw new Error('Invalid recipient id');
  const sql = wmill.datatable('main');
  const row = await sql`SELECT r.id,r.email_normalized,r.sender,r.zoho_lead_id,r.state,
    min(s.verified_at) FILTER (WHERE s.status='VERIFIED_SENT') first_verified_send_at
    FROM mumbai_nurture_recipients r LEFT JOIN mumbai_nurture_sends s ON s.recipient_id=r.id
    WHERE r.id=${recipient_id} GROUP BY r.id`.fetchOne();
  if (!row) throw new Error('Recipient not found');
  if (!row.first_verified_send_at) return {recipient_id,reply_visibility:false,
    action:'HOLD_NO_VERIFIED_OUTBOUND_TO_REFERENCE'};
  const connectionName = row.sender.split('@')[0];
  let connection: string;
  try { connection = await wmill.getVariable(`${ROOT}/mail_connection_${connectionName}`); }
  catch { return {recipient_id,reply_visibility:false,action:'HOLD_MISSING_SENDER_INBOX_CONNECTION'}; }
  if (!connection || !/^[a-f0-9-]{36}$/i.test(connection))
    return {recipient_id,reply_visibility:false,action:'HOLD_INVALID_SENDER_INBOX_CONNECTION'};
  const key = await wmill.getVariable(`${ROOT}/harsha_maton_api_key`);
  const base = 'https://api.maton.ai/google-mail/gmail/v1/users/me/messages';
  const headers = {Authorization:`Bearer ${key}`,'Maton-Connection':connection};
  const query = `from:${row.email_normalized} to:${row.sender}`;
  const listed = await fetch(`${base}?q=${encodeURIComponent(query)}&maxResults=100`, {
    headers,signal:AbortSignal.timeout(30000),
  });
  if (!listed.ok) throw new Error(`Sender inbox listing HTTP ${listed.status}`);
  const listing = await listed.json();
  if (listing.nextPageToken) throw new Error('Reply search paginated; manual review required');
  const messages = listing.messages || [];
  const exact: Array<{id:string,thread_id:string,date:string}> = [];
  const ambiguous: Array<{id:string,reason:string}> = [];
  for (const item of messages) {
    const response = await fetch(`${base}/${encodeURIComponent(item.id)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date&metadataHeaders=In-Reply-To&metadataHeaders=References&metadataHeaders=Auto-Submitted&metadataHeaders=Precedence&metadataHeaders=List-Id&metadataHeaders=X-Autoreply`, {
      headers,signal:AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Sender inbox message HTTP ${response.status}`);
    const m = await response.json();
    const h = Object.fromEntries((m.payload?.headers || []).map((x:any) => [String(x.name).toLowerCase(),String(x.value)]));
    const from = address(h.from || '');
    const to = String(h.to || '').split(',').map(address);
    const stamp = Number(m.internalDate);
    if (!Number.isFinite(stamp) || stamp <= 0) { ambiguous.push({id:m.id,reason:'INVALID_DATE'}); continue; }
    const date = new Date(stamp).toISOString();
    if (stamp <= new Date(row.first_verified_send_at).getTime()) continue;
    if (from !== row.email_normalized || !to.includes(row.sender)) {
      ambiguous.push({id:m.id,reason:'HEADER_IDENTITY_MISMATCH'}); continue;
    }
    if (h['auto-submitted'] || h['x-autoreply'] || h['list-id'] ||
        /bulk|list|junk/i.test(h.precedence || '')) {
      ambiguous.push({id:m.id,reason:'AUTOMATED_OR_LIST_MAIL'}); continue;
    }
    if (!h['in-reply-to'] && !h.references) {
      ambiguous.push({id:m.id,reason:'NO_THREAD_REPLY_HEADER'}); continue;
    }
    exact.push({id:m.id,thread_id:m.threadId,date});
  }
  if (ambiguous.length) return {recipient_id,sender:row.sender,reply_visibility:true,
    exact_replies:exact,ambiguous,action:'HOLD_INBOUND_FOR_MANUAL_REVIEW'};
  if (!record || !exact.length) return {recipient_id,sender:row.sender,reply_visibility:true,
    exact_replies:exact,action:exact.length ? 'RECORD_SUPPRESSION_AND_OWNER_HANDOFF' : 'NO_NEW_EXACT_REPLY'};
  const first = exact.sort((a,b) => a.date.localeCompare(b.date))[0];
  const eventKey = `gmail-reply:${first.id}`;
  const result = await sql`WITH target AS (
    SELECT id FROM mumbai_nurture_recipients WHERE id=${recipient_id} FOR UPDATE
  ), event AS (
    INSERT INTO mumbai_nurture_events (event_key,recipient_id,kind,source,evidence,occurred_at)
    SELECT ${eventKey},id,'REPLY','google-mail',
      ${JSON.stringify({message_id:first.id,thread_id:first.thread_id,inbox:row.sender})}::jsonb,
      ${first.date}::timestamptz FROM target
    ON CONFLICT (event_key) DO NOTHING RETURNING event_key
  ), stopped AS (
    UPDATE mumbai_nurture_recipients SET state='SUPPRESSED',stop_reason='REPLY',
      next_due_at=NULL,updated_at=now() WHERE id IN (SELECT id FROM target)
      AND state<>'SUPPRESSED' RETURNING id
  ) SELECT (SELECT count(*)::integer FROM event) event_inserted,
    (SELECT count(*)::integer FROM stopped) state_changed`.fetchOne();
  const verify = await sql`SELECT r.state,e.kind FROM mumbai_nurture_recipients r
    JOIN mumbai_nurture_events e ON e.recipient_id=r.id
    WHERE r.id=${recipient_id} AND e.event_key=${eventKey}`.fetchOne();
  if (verify?.state !== 'SUPPRESSED' || verify?.kind !== 'REPLY')
    throw new Error('Reply suppression read-back failed');
  return {recipient_id,sender:row.sender,reply_visibility:true,exact_replies:exact,
    event_key:eventKey,event_inserted:Number(result.event_inserted),state:'SUPPRESSED',
    action:'CRM_NOTE_AND_OWNER_HANDOFF_PENDING'};
}
