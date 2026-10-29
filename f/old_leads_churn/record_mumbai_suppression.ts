import * as wmill from 'windmill-client';

type Kind = 'REPLY' | 'OPTOUT' | 'BOUNCE' | 'SALES_HANDOFF' | 'COLLECTIVE_CHANGE' | 'ADDRESS_CHANGE' | 'IDENTITY_HOLD';
const stopKinds = new Set<Kind>(['REPLY', 'OPTOUT', 'BOUNCE', 'SALES_HANDOFF']);
const allKinds = new Set<Kind>([...stopKinds, 'COLLECTIVE_CHANGE', 'ADDRESS_CHANGE', 'IDENTITY_HOLD']);

/** Exact, idempotent suppression recording. Upstream must verify the event first. */
export async function main(
  recipient_id: number,
  kind: Kind,
  event_key: string,
  source: string,
  evidence: Record<string, unknown> = {},
  occurred_at: string = '',
  dry_run: boolean = true,
) {
  if (!Number.isSafeInteger(recipient_id) || recipient_id <= 0 || !allKinds.has(kind) ||
      !/^[a-z0-9:_-]{8,180}$/i.test(event_key) || !source.trim() ||
      !occurred_at || Number.isNaN(Date.parse(occurred_at)))
    throw new Error('Invalid suppression event identity or timestamp');
  const sql = wmill.datatable('main');
  const recipient = await sql`SELECT id, state, zoho_lead_id, email_normalized
    FROM mumbai_nurture_recipients WHERE id=${recipient_id}`.fetchOne();
  if (!recipient) throw new Error('Recipient not found');
  const old = await sql`SELECT recipient_id,kind,source,
    evidence=${JSON.stringify(evidence)}::jsonb AS same_evidence
    FROM mumbai_nurture_events WHERE event_key=${event_key}`.fetchOne();
  if (old && (Number(old.recipient_id) !== recipient_id || old.kind !== kind || old.source !== source ||
      !old.same_evidence))
    throw new Error('Event key collision with different evidence');
  if (dry_run) return { dry_run: true, recipient_id, kind, existing: !!old,
    result_state: stopKinds.has(kind) ? 'SUPPRESSED' : 'HELD', crm_note_required: false,
    manual_reply_review_required:kind==='REPLY' };
  const targetState = stopKinds.has(kind) ? 'SUPPRESSED' : 'HELD';
  const result = await sql`WITH target AS (
      SELECT id FROM mumbai_nurture_recipients WHERE id=${recipient_id} FOR UPDATE
    ), event AS (
      INSERT INTO mumbai_nurture_events
        (event_key,recipient_id,kind,source,evidence,occurred_at)
      SELECT ${event_key},id,${kind},${source},${JSON.stringify(evidence)}::jsonb,
        ${occurred_at}::timestamptz FROM target
      ON CONFLICT (event_key) DO NOTHING RETURNING event_key
    ), stopped AS (
      UPDATE mumbai_nurture_recipients SET state=${targetState},stop_reason=${kind},
        next_due_at=NULL,updated_at=now()
      WHERE id IN (SELECT id FROM target) AND state<>'SUPPRESSED'
      RETURNING id
    ) SELECT (SELECT count(*)::integer FROM event) event_inserted,
      (SELECT count(*)::integer FROM stopped) state_changed`.fetchOne();
  const verify = await sql`SELECT r.state, r.stop_reason, e.kind, e.source
    FROM mumbai_nurture_recipients r JOIN mumbai_nurture_events e ON e.recipient_id=r.id
    WHERE r.id=${recipient_id} AND e.event_key=${event_key}`.fetchOne();
  if (!verify || verify.kind !== kind ||
      (targetState === 'SUPPRESSED' && verify.state !== 'SUPPRESSED'))
    throw new Error('Suppression read-back failed');
  return { dry_run: false, recipient_id, kind, ...result,
    result_state: verify.state, crm_note_required: false,manual_reply_review_required:kind==='REPLY' };
}
