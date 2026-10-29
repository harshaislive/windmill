import * as wmill from 'windmill-client';

type Legacy = {
  batch_id: string; pipedrive_deal_id: string; zoho_lead_id: string;
  email: string; sender: string; owner: string; source_mumbai_row_present: boolean;
  email01_verified_sends: number; email02_verified_sends: number;
  email03_verified_sends: number; prior_crm_message_ids: string[];
  last_verified_send_at: string; earliest_next_at_48h: string;
  next_step: string; migration_state: string;
};

const SOURCE = '1LojS6cGdt8JJl0NbOONwG7wf9OXjWL4qfezbYT8sL7w';
const expectedStates = new Set([
  'PENDING_REPLY_CHECK', 'HELD_EMAIL02_COPY_AND_REPLY_CHECK',
  'HELD_ADDRESS', 'SUPPRESSED_REPLY',
]);

/** Run only after all 79 live CRM addresses and exact message IDs match the manifest. */
export async function main(records: Legacy[] = [], dry_run: boolean = true) {
  if (records.length !== 79) throw new Error('Expected exactly 79 legacy recipients');
  const seenEmail = new Set<string>();
  const seenDeal = new Set<string>();
  const seenLead = new Set<string>();
  const states: Record<string, number> = {};
  let messages = 0;
  for (const r of records) {
    const email = String(r.email || '').trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email) || r.sender !== 'sai@beforest.co' ||
        r.owner !== 'Sai Rakesh' || !expectedStates.has(r.migration_state) ||
        !/^\d+$/.test(String(r.pipedrive_deal_id)) || !/^\d+$/.test(String(r.zoho_lead_id)) ||
        seenEmail.has(email) || seenDeal.has(String(r.pipedrive_deal_id)) ||
        seenLead.has(String(r.zoho_lead_id)) ||
        r.email01_verified_sends !== r.prior_crm_message_ids.length ||
        r.email02_verified_sends !== 0 || r.email03_verified_sends !== 0 ||
        r.email01_verified_sends < 2 || r.email01_verified_sends > 3 ||
        r.prior_crm_message_ids.some((id) => !id)) {
      throw new Error('Invalid or duplicate manifest record');
    }
    seenEmail.add(email); seenDeal.add(String(r.pipedrive_deal_id));
    seenLead.add(String(r.zoho_lead_id)); messages += r.prior_crm_message_ids.length;
    states[r.migration_state] = (states[r.migration_state] || 0) + 1;
  }
  if (states.PENDING_REPLY_CHECK !== 19 ||
      states.HELD_EMAIL02_COPY_AND_REPLY_CHECK !== 58 ||
      states.HELD_ADDRESS !== 1 || states.SUPPRESSED_REPLY !== 1 ||
      records.filter((r) => !r.source_mumbai_row_present).length !== 15) {
    throw new Error('Manifest state totals differ from the reviewed baseline');
  }
  if (dry_run) return { dry_run: true, recipients: 79, messages, states, absent_source_rows: 15 };

  const sql = wmill.datatable('main');
  let inserted = 0, alreadyPresent = 0;
  for (const r of records) {
    const email = r.email.trim().toLowerCase();
    const existing = await sql`SELECT id, email_normalized, zoho_lead_id, sender, owner_name, owner_user_id, state,
      next_step, next_due_at::text AS next_due_at FROM mumbai_nurture_recipients
      WHERE email_normalized = ${email} OR zoho_lead_id = ${r.zoho_lead_id}`.fetch();
    if (existing.length > 1) throw new Error('Conflicting recipient identity');
    const nextStep = r.email01_verified_sends + 1;
    const state = r.migration_state === 'SUPPRESSED_REPLY' ? 'SUPPRESSED' : 'HELD';
    let recipientId: number;
    if (existing.length) {
      const x = existing[0];
      if (x.email_normalized !== email || x.zoho_lead_id !== r.zoho_lead_id ||
          x.sender !== r.sender || x.owner_name !== r.owner || x.state !== state ||
          Number(x.next_step) !== nextStep ||
          (x.owner_user_id && x.owner_user_id !== '863791000000520050'))
        throw new Error('Existing legacy recipient differs');
      recipientId = Number(x.id); alreadyPresent++;
      if (!x.owner_user_id) await sql`UPDATE mumbai_nurture_recipients
        SET owner_user_id='863791000000520050',updated_at=now()
        WHERE id=${recipientId} AND owner_user_id IS NULL`.execute();
    } else {
      const row = await sql`INSERT INTO mumbai_nurture_recipients
        (email_normalized, zoho_lead_id, sender, owner_name, owner_user_id, collective, state,
         stop_reason, next_step, next_due_at, last_verified_send_at)
        VALUES (${email}, ${r.zoho_lead_id}, ${r.sender}, ${r.owner}, '863791000000520050', 'Mumbai',
         ${state}, ${r.migration_state}, ${nextStep}, ${r.earliest_next_at_48h}::timestamptz,
         ${r.last_verified_send_at}::timestamptz) RETURNING id`.fetchOne();
      recipientId = Number(row.id); inserted++;
    }
    const link = await sql`SELECT recipient_id, batch_id, source_present FROM mumbai_nurture_source_links
      WHERE deal_id = ${String(r.pipedrive_deal_id)}`.fetchOne();
    if (link) {
      if (Number(link.recipient_id) !== recipientId || link.batch_id !== r.batch_id ||
          link.source_present !== r.source_mumbai_row_present) throw new Error('Existing source link differs');
    } else {
      await sql`INSERT INTO mumbai_nurture_source_links
        (deal_id, recipient_id, spreadsheet_id, sheet_name, source_present, batch_id)
        VALUES (${String(r.pipedrive_deal_id)}, ${recipientId}, ${SOURCE},
         'Sales Call List', ${r.source_mumbai_row_present}, ${r.batch_id})`.execute();
    }
    for (let i = 0; i < r.prior_crm_message_ids.length; i++) {
      const step = i + 1, messageId = r.prior_crm_message_ids[i];
      const prior = await sql`SELECT status, crm_message_id, recipient_email, sender
        FROM mumbai_nurture_sends WHERE recipient_id = ${recipientId}
        AND sequence_version = 'mumbai-v1' AND step = ${step}`.fetchOne();
      if (prior) {
        if (prior.status !== 'VERIFIED_SENT' || prior.crm_message_id !== messageId ||
            prior.recipient_email !== email || prior.sender !== r.sender)
          throw new Error('Existing send journal differs');
      } else {
        await sql`INSERT INTO mumbai_nurture_sends
          (recipient_id, sequence_version, step, status, recipient_email, sender,
           crm_message_id, attempt_count, verified_at)
          VALUES (${recipientId}, 'mumbai-v1', ${step}, 'VERIFIED_SENT', ${email},
           ${r.sender}, ${messageId}, 1, ${r.last_verified_send_at}::timestamptz)`.execute();
      }
    }
    if (r.migration_state === 'SUPPRESSED_REPLY') {
      const key = `legacy-reply:${r.zoho_lead_id}`;
      await sql`INSERT INTO mumbai_nurture_events
        (event_key, recipient_id, kind, source, evidence, occurred_at)
        VALUES (${key}, ${recipientId}, 'REPLY', 'legacy_tracker',
         '{"confirmed":true}'::jsonb, ${r.last_verified_send_at}::timestamptz)
        ON CONFLICT (event_key) DO NOTHING`.execute();
    }
  }
  const summary = await sql`SELECT
    (SELECT count(*)::integer FROM mumbai_nurture_recipients) recipients,
    (SELECT count(*)::integer FROM mumbai_nurture_sends WHERE status='VERIFIED_SENT') verified_sends,
    (SELECT count(*)::integer FROM mumbai_nurture_source_links WHERE NOT source_present) absent_source_rows`.fetchOne();
  return { dry_run: false, inserted, already_present: alreadyPresent, ...summary };
}
