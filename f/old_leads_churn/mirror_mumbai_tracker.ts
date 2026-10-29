import * as wmill from 'windmill-client';

const ROOT = 'f/old_leads_churn';
const SHEET = '1LojS6cGdt8JJl0NbOONwG7wf9OXjWL4qfezbYT8sL7w';
const CONNECTION = '6463e553-eab2-4cb9-a46f-b1a5665c0031';
const HEADERS = ['Sequence Version','Sender','Zoho Owner','Current Step','Next Due At',
  'Email #2 Sends (of 2)','Email #3 Sends (of 1)','Overall State','Stop Reason'];
const stepName = ['','E01-S01','E01-S02','E01-S03','E02-S01','E02-S02','E03-S01'];
const machineCells = (row:string[]) =>
  Array.from({length:9},(_,i)=>String(row[17+i]||''));

function ist(value: string | null) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(value)).replace(',', '') + ' IST';
}

/** Mirrors R:Z for existing rows and appends new Lead rows after an exact recheck. */
export async function main(dry_run: boolean = true) {
  const key = await wmill.getVariable(`${ROOT}/harsha_maton_api_key`);
  const base = `https://api.maton.ai/google-sheets/v4/spreadsheets/${SHEET}`;
  const headers = { Authorization: `Bearer ${key}`, 'Maton-Connection': CONNECTION };
  const read = async (range: string) => {
    const response = await fetch(`${base}/values/${encodeURIComponent(range)}`, {
      headers, signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Tracker read HTTP ${response.status}`);
    return (await response.json()).values || [];
  };
  const sheetRange = "'Mumbai Nurture Tracker'!A1:Z5000";
  const original = await read(sheetRange);
  if (original.length < 80 ||
      original[0].slice(17,26).join('|') !== HEADERS.join('|') ||
      original[0][1] !== 'Zoho Lead ID')
    throw new Error('Tracker rows or machine headers changed');
  const sql = wmill.datatable('main');
  const records = await sql`SELECT r.zoho_lead_id,r.person_name,r.email_normalized,
    r.source_version,r.sender,r.owner_name,
    r.next_step,r.next_due_at,r.state,r.stop_reason,
    (SELECT min(l.deal_id) FROM mumbai_nurture_source_links l
      WHERE l.recipient_id=r.id AND l.source_present=true) source_deal_id,
    count(s.id) FILTER (WHERE s.step IN (4,5) AND s.status='VERIFIED_SENT')::integer email02_sends,
    count(s.id) FILTER (WHERE s.step=6 AND s.status='VERIFIED_SENT')::integer email03_sends
    FROM mumbai_nurture_recipients r LEFT JOIN mumbai_nurture_sends s ON s.recipient_id=r.id
    WHERE r.zoho_lead_id IS NOT NULL
    GROUP BY r.id ORDER BY r.zoho_lead_id`.fetch();
  const byLead = new Map(records.map((x: any) => [x.zoho_lead_id, x]));
  const seen = new Set<string>();
  const matrix: string[][] = [];
  const changed: {row: number; values: string[]}[] = [];
  for (let i = 1; i < original.length; i++) {
    const row: string[] = original[i];
    const leadId = String(row[1] || '');
    if (!leadId || seen.has(leadId)) throw new Error('Duplicate or blank tracker Lead ID');
    seen.add(leadId);
    const r = byLead.get(leadId);
    if (!r) throw new Error('Tracker Lead missing in Windmill journal');
    const next = Number(r.next_step);
    const values = [r.source_version,r.sender,r.owner_name,
      next >= 1 && next <= 6 ? stepName[next] : 'COMPLETE',
      ist(r.next_due_at),String(r.email02_sends),String(r.email03_sends),
      r.state,String(r.stop_reason || '')];
    matrix.push(values);
    if (JSON.stringify(machineCells(row)) !== JSON.stringify(values))
      changed.push({row:i+1,values});
  }
  if (seen.size < 79) throw new Error('Original tracker cohort is incomplete');
  const additions: string[][] = [];
  for (const [leadId,r] of byLead) {
    if (seen.has(leadId) || !r.source_deal_id) continue;
    if (!r.email_normalized || !r.person_name || r.email_normalized.endsWith('.invalid'))
      throw new Error('New tracker Lead missing verified identity');
    const next = Number(r.next_step);
    const machine = [r.source_version,r.sender,r.owner_name,
      next >= 1 && next <= 6 ? stepName[next] : 'COMPLETE',
      ist(r.next_due_at),String(r.email02_sends),String(r.email03_sends),
      r.state,String(r.stop_reason || '')];
    additions.push([String(r.source_deal_id),String(leadId),String(r.person_name),
      String(r.email_normalized),'Mumbai Nurture',...Array(12).fill(''),...machine]);
  }
  additions.sort((a,b)=>a[1].localeCompare(b[1]));
  if (dry_run) return { dry_run: true, tracker_rows: seen.size,
    changed_rows: changed.length,changed_row_numbers:changed.map(x=>x.row),
    new_rows: additions.length,
    source_columns_preserved: 'A:Q', target_columns: 'R:Z' };
  if (!changed.length && !additions.length) return { dry_run: false,
    tracker_rows: seen.size, changed_rows: 0,new_rows:0,read_back:true };
  const recheck = await read(sheetRange);
  if (JSON.stringify(recheck)!==JSON.stringify(original))
    throw new Error('Tracker changed before mirror; retry after review');
  const sourceCells = (row: string[]) => Array.from({length: 17}, (_, i) => String(row[i] || ''));
  const beforeSource = original.map(sourceCells);
  if (changed.length) {
    const body = JSON.stringify({ valueInputOption: 'RAW', data: changed.map(x=>({
      range: `'Mumbai Nurture Tracker'!R${x.row}:Z${x.row}`, values: [x.values],
    })) });
    const response = await fetch(`${base}/values:batchUpdate`, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
      body, signal: AbortSignal.timeout(40000),
    });
    if (!response.ok) throw new Error(`Tracker write uncertain or rejected: HTTP ${response.status}`);
  }
  let after = await read(sheetRange);
  if (JSON.stringify(after.map(sourceCells)) !== JSON.stringify(beforeSource) ||
      after.length !== original.length)
    throw new Error('Tracker A:Q or row count changed during mirror');
  for (let i = 1; i < after.length; i++) {
    if (JSON.stringify(machineCells(after[i])) !== JSON.stringify(matrix[i-1]))
      throw new Error(`Tracker machine column read-back mismatch row ${i+1}`);
  }
  if (additions.length) {
    const verifiedPrefix = JSON.stringify(after);
    const res = await fetch(`${base}/values/${encodeURIComponent("'Mumbai Nurture Tracker'!A:Z")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method:'POST',headers:{...headers,'Content-Type':'application/json'},
      body:JSON.stringify({values:additions}),signal:AbortSignal.timeout(40000),
    });
    if (!res.ok) throw new Error(`Tracker append uncertain or rejected: HTTP ${res.status}`);
    after = await read(sheetRange);
    if (after.length!==original.length+additions.length ||
      JSON.stringify(after.slice(0,original.length))!==verifiedPrefix)
      throw new Error('Tracker append row count or prefix read-back failed');
    for (let i=0;i<additions.length;i++) {
      const actual=Array.from({length:26},(_,j)=>String(after[original.length+i][j]||''));
      if (JSON.stringify(actual)!==JSON.stringify(additions[i]))
        throw new Error(`Tracker appended row read-back mismatch ${i+1}`);
    }
  }
  return { dry_run: false, tracker_rows: after.length-1, changed_rows: changed.length,
    changed_row_numbers:changed.map(x=>x.row),
    new_rows:additions.length,source_columns_preserved: 'A:Q', target_columns: 'R:Z', read_back: true };
}
