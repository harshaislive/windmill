import * as wmill from 'windmill-client';

const ROOT = 'f/old_leads_churn';
const SHEET_ID = '1LojS6cGdt8JJl0NbOONwG7wf9OXjWL4qfezbYT8sL7w';
const CONNECTION = '6463e553-eab2-4cb9-a46f-b1a5665c0031';
const lanes = [
  { sender: 'sai@beforest.co', owner: 'Sai Rakesh', owner_id: '863791000000520050' },
  { sender: 'community@beforest.co', owner: 'Sai Rakesh', owner_id: '863791000000520050' },
  { sender: 'yogesh@beforest.co', owner: 'Yogesh Suresh', owner_id: '863791000008149001' },
  { sender: 'harish@beforest.co', owner: 'Harish Bhardwaj', owner_id: '863791000009584001' },
];

function laneFor(email: string) {
  let hash = 2166136261;
  for (const ch of email) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  return lanes[(hash >>> 0) % lanes.length];
}
function dealId(link: string) {
  const match = link.trim().match(/(\d+)\/?$/);
  return match?.[1] || null;
}
function validEmail(s: string) {
  const x = s.trim().toLowerCase();
  return /^\S+@\S+\.\S+$/.test(x) ? x : null;
}

/** Ingests new candidates into HELD state; reconciles source removals without sending. */
export async function main(dry_run: boolean = true) {
  const key = await wmill.getVariable(`${ROOT}/harsha_maton_api_key`);
  const url = `https://api.maton.ai/google-sheets/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent("'Sales Call List'!A1:N4000")}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${key}`, 'Maton-Connection': CONNECTION },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Sheets read HTTP ${response.status}`);
  const rows: string[][] = (await response.json()).values || [];
  const header = rows[0] || [];
  if (header[1] !== 'Lead Name' || header[3] !== 'Collective' ||
      header[10] !== 'Pipedrive' || header[13] !== 'Email')
    throw new Error('Sales Call List schema changed');

  const byDeal = new Map<string, any>();
  const namesByEmail = new Map<string, Set<string>>();
  const allSourceDeals = new Map<string, string>();
  let mumbaiRows = 0, invalidOrMissing = 0;
  for (let index = 1; index < rows.length; index++) {
    const row = rows[index];
    const id = dealId(row[10] || '');
    if (row[3] !== 'Mumbai') {
      if (id && !allSourceDeals.has(id)) allSourceDeals.set(id, row[3] || '');
      continue;
    }
    if (!id || allSourceDeals.has(id)) throw new Error('Missing or duplicate Mumbai deal ID');
    allSourceDeals.set(id, 'Mumbai');
    mumbaiRows++;
    const email = validEmail(row[13] || '');
    if (!email) { invalidOrMissing++; continue; }
    const name = (row[1] || '').trim().replace(/\s+/g, ' ');
    const nameKey = name.toLowerCase();
    if (!namesByEmail.has(email)) namesByEmail.set(email, new Set());
    if (nameKey) namesByEmail.get(email)!.add(nameKey);
    byDeal.set(id, { deal_id: id, email, name, row: index + 1 });
  }
  const ambiguous = new Set([...namesByEmail].filter(([, names]) => names.size > 1).map(([email]) => email));
  const source = [...byDeal.values()];
  const unique = [...namesByEmail.keys()];
  const sql = wmill.datatable('main');
  const existing = await sql`SELECT id, email_normalized, sender, owner_name, zoho_lead_id, state
    FROM mumbai_nurture_recipients`.fetch();
  const existingEmails = new Set(existing.map((r: any) => r.email_normalized));
  const newEmails = unique.filter((email) => !existingEmails.has(email));
  const existingLinks = await sql`SELECT deal_id, recipient_id, l.source_present, r.email_normalized
    FROM mumbai_nurture_source_links l JOIN mumbai_nurture_recipients r ON r.id=l.recipient_id`.fetch();
  const linkMap = new Map(existingLinks.map((x: any) => [x.deal_id, x]));
  const conflicts = source.filter((r) => linkMap.has(r.deal_id) && linkMap.get(r.deal_id).email_normalized !== r.email);
  const changedCollective = existingLinks.filter((x: any) => allSourceDeals.has(x.deal_id) && allSourceDeals.get(x.deal_id) !== 'Mumbai');
  const removedFromSource = existingLinks.filter((x:any)=>x.source_present && !allSourceDeals.has(x.deal_id));
  const summary = {
    dry_run, source_rows: rows.length - 1, mumbai_rows: mumbaiRows,
    valid_email_rows: source.length, held_no_email: invalidOrMissing,
    unique_emails: unique.length, new_candidate_emails: newEmails.length,
    duplicate_email_groups: unique.length - source.length ? [...namesByEmail].filter(([email]) => source.filter((r) => r.email === email).length > 1).length : 0,
    ambiguous_name_emails: ambiguous.size,
    existing_link_address_conflicts: conflicts.length,
    collective_changed_links: changedCollective.length,
    removed_source_links: removedFromSource.length,
  };
  if (dry_run) return summary;
  const conflictedDeals = new Set(conflicts.map((x) => x.deal_id));
  const safeSource = source.filter((x) => !conflictedDeals.has(x.deal_id));

  for (let i = 0; i < newEmails.length; i += 200) {
    const batch = newEmails.slice(i, i + 200).map((email) => {
      const row = source.find((x) => x.email === email);
      return { email, name: row.name, ...laneFor(email),
        reason: ambiguous.has(email) ? 'IDENTITY_AMBIGUITY' : 'PENDING_CRM_IDENTITY_AND_SUPPRESSION_CHECKS' };
    });
    await sql`INSERT INTO mumbai_nurture_recipients
      (email_normalized, person_name, sender, owner_name, owner_user_id, collective, state, stop_reason, next_step)
      SELECT v->>'email',v->>'name',v->>'sender',v->>'owner',v->>'owner_id',
        'Mumbai','HELD',v->>'reason',1
      FROM jsonb_array_elements(${JSON.stringify(batch)}::jsonb) v
      ON CONFLICT (email_normalized) DO NOTHING`.execute();
  }
  for (let i = 0; i < safeSource.length; i += 200) {
    const batch = safeSource.slice(i, i + 200);
    await sql`INSERT INTO mumbai_nurture_source_links
      (deal_id, recipient_id, spreadsheet_id, sheet_name, sheet_row, source_present)
      SELECT v->>'deal_id', r.id, ${SHEET_ID}, 'Sales Call List', (v->>'row')::integer, true
      FROM jsonb_array_elements(${JSON.stringify(batch)}::jsonb) v
      JOIN mumbai_nurture_recipients r ON r.email_normalized=v->>'email'
      ON CONFLICT (deal_id) DO UPDATE SET sheet_row=excluded.sheet_row, source_present=true
      WHERE mumbai_nurture_source_links.recipient_id=excluded.recipient_id`.execute();
  }
  for (const x of conflicts) {
    const prior = linkMap.get(x.deal_id);
    const eventKey = `address-change:${x.deal_id}:${x.email}`;
    await sql`INSERT INTO mumbai_nurture_events
      (event_key,recipient_id,kind,source,evidence,occurred_at)
      VALUES (${eventKey},${prior.recipient_id},'ADDRESS_CHANGE','Sales Call List',
        ${JSON.stringify({ deal_id: x.deal_id, proposed_email: x.email })}::jsonb,now())
      ON CONFLICT (event_key) DO NOTHING`.execute();
    await sql`UPDATE mumbai_nurture_recipients SET state='HELD',stop_reason='ADDRESS_CHANGE',
      next_due_at=NULL,updated_at=now() WHERE id=${prior.recipient_id} AND state<>'SUPPRESSED'`.execute();
  }
  for (const x of changedCollective) {
    const eventKey = `collective-change:${x.deal_id}:${allSourceDeals.get(x.deal_id)}`;
    await sql`INSERT INTO mumbai_nurture_events
      (event_key,recipient_id,kind,source,evidence,occurred_at)
      VALUES (${eventKey},${x.recipient_id},'COLLECTIVE_CHANGE','Sales Call List',
        ${JSON.stringify({ deal_id: x.deal_id, collective: allSourceDeals.get(x.deal_id) })}::jsonb,now())
      ON CONFLICT (event_key) DO NOTHING`.execute();
    await sql`UPDATE mumbai_nurture_recipients SET state='HELD',stop_reason='COLLECTIVE_CHANGE',
      next_due_at=NULL,updated_at=now() WHERE id=${x.recipient_id} AND state<>'SUPPRESSED'`.execute();
  }
  // A missing deal is a hold, not an automatic deletion or reassignment.
  for (const x of removedFromSource) {
    await sql`UPDATE mumbai_nurture_source_links SET source_present=false
      WHERE deal_id=${x.deal_id} AND recipient_id=${x.recipient_id}`.execute();
    await sql`UPDATE mumbai_nurture_recipients SET state='HELD',
      stop_reason='SOURCE_REMOVED',next_due_at=NULL,updated_at=now()
      WHERE id=${x.recipient_id} AND state<>'SUPPRESSED'
        AND NOT EXISTS (SELECT 1 FROM mumbai_nurture_source_links l
          WHERE l.recipient_id=${x.recipient_id} AND l.source_present=true)`.execute();
  }
  const totals = await sql`SELECT
    (SELECT count(*)::integer FROM mumbai_nurture_recipients) recipients,
    (SELECT count(*)::integer FROM mumbai_nurture_source_links) source_links,
    (SELECT count(*)::integer FROM mumbai_nurture_sends WHERE status='VERIFIED_SENT') verified_sends`.fetchOne();
  return { ...summary, dry_run: false, ...totals };
}
