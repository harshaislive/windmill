import * as wmill from 'windmill-client';

const ROOT = 'f/old_leads_churn';
const SHEET_ID = '1LojS6cGdt8JJl0NbOONwG7wf9OXjWL4qfezbYT8sL7w';
const CONNECTION = '6463e553-eab2-4cb9-a46f-b1a5665c0031';

/** Read-only source and queue inspection. This script never creates Leads or sends mail. */
export async function main(dry_run: boolean = true) {
  const delivery = await wmill.getVariable(`${ROOT}/delivery_enabled`);
  if (delivery !== 'false') throw new Error('Inspection requires delivery_enabled=false');
  const key = await wmill.getVariable(`${ROOT}/harsha_maton_api_key`);
  const range = encodeURIComponent("'Sales Call List'!A1:N4000");
  const response = await fetch(
    `https://api.maton.ai/google-sheets/v4/spreadsheets/${SHEET_ID}/values/${range}`,
    { headers: { Authorization: `Bearer ${key}`, 'Maton-Connection': CONNECTION },
      signal: AbortSignal.timeout(30000) },
  );
  if (!response.ok) throw new Error(`Sheets read failed: HTTP ${response.status}`);
  const body = await response.json();
  const rows: string[][] = body.values || [];
  const header = rows[0] || [];
  if (header[1] !== 'Lead Name' || header[3] !== 'Collective' || header[10] !== 'Pipedrive')
    throw new Error('Sales Call List columns changed');
  const emailIndex = header.findIndex((x) => x.trim().toLowerCase() === 'email');
  const mumbai = rows.slice(1).filter((x) => x[3] === 'Mumbai');
  const reviewedEmailRows = emailIndex < 0 ? 0 : mumbai.filter((x) => /^\S+@\S+\.\S+$/.test((x[emailIndex] || '').trim())).length;
  const sql = wmill.datatable('main');
  const queue = await sql`SELECT state, count(*)::integer AS count FROM mumbai_nurture_recipients GROUP BY state ORDER BY state`.fetch();
  const journal = await sql`SELECT count(*)::integer AS count FROM mumbai_nurture_sends WHERE status='VERIFIED_SENT'`.fetchOne();
  return {
    dry_run, delivery_enabled: false, source_rows: rows.length - 1,
    mumbai_rows: mumbai.length, email_column_present: emailIndex >= 0,
    reviewed_email_rows: reviewedEmailRows, queue, historical_verified_sends: journal.count,
    action: 'inspection_only',
  };
}
