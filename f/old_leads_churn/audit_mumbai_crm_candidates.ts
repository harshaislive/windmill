import * as wmill from 'windmill-client';

const ROOT = 'f/old_leads_churn';
type CRMRecord = { id: string; Email?: string; Owner?: { id?: string; name?: string }; Email_Opt_Out?: boolean; Lead_Status?: string; Collective_Name?: string };

async function token() {
  const [clientId, clientSecret, refreshToken] = await Promise.all([
    wmill.getVariable(`${ROOT}/zoho_rakesh_client_id`),
    wmill.getVariable(`${ROOT}/zoho_rakesh_client_secret`),
    wmill.getVariable(`${ROOT}/zoho_rakesh_refresh_token`),
  ]);
  const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret,
    refresh_token: refreshToken, grant_type: 'refresh_token' });
  const response = await fetch('https://accounts.zoho.in/oauth/v2/token', {
    method: 'POST', body, signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Zoho refresh HTTP ${response.status}`);
  const result = await response.json();
  if (!result.access_token || !result.api_domain) throw new Error('Zoho refresh incomplete');
  return { base: `${result.api_domain}/crm/v8`, access: result.access_token };
}

async function listModule(base: string, access: string, module: 'Leads' | 'Contacts', fields: string): Promise<CRMRecord[]> {
  const all: CRMRecord[] = [];
  let page = 1, pageToken: string | null = null;
  for (let requestNumber = 1; requestNumber <= 100; requestNumber++) {
    const query = new URLSearchParams({ fields, per_page: '200' });
    if (pageToken) query.set('page_token', pageToken);
    else query.set('page', String(page));
    const url = `${base}/${module}?${query}`;
    const response = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${access}` },
      signal: AbortSignal.timeout(30000) });
    if (response.status === 204) break;
    if (!response.ok) throw new Error(`${module} page ${requestNumber} HTTP ${response.status}`);
    const result = await response.json();
    all.push(...(result.data || []));
    if (!result.info?.more_records) break;
    if (result.info?.next_page_token) pageToken = result.info.next_page_token;
    else if (page < 10) page++;
    else throw new Error(`${module} missing next page token at 2000 records`);
    if (requestNumber === 100) throw new Error(`${module} page limit`);
  }
  return all;
}

/** Read-only bulk CRM identity and opt-out preflight. No admission or send. */
export async function main() {
  if (await wmill.getVariable(`${ROOT}/delivery_enabled`) !== 'false')
    throw new Error('CRM audit requires delivery_enabled=false');
  const { base, access } = await token();
  const leads = await listModule(base, access, 'Leads', 'id,Email,Owner,Email_Opt_Out,Lead_Status,Collective_Name');
  const contacts = await listModule(base, access, 'Contacts', 'id,Email,Owner,Email_Opt_Out');
  const byEmail = new Map<string, { leads: CRMRecord[]; contacts: CRMRecord[] }>();
  for (const r of leads) {
    const email = (r.Email || '').trim().toLowerCase();
    if (!email) continue;
    if (!byEmail.has(email)) byEmail.set(email, { leads: [], contacts: [] });
    byEmail.get(email)!.leads.push(r);
  }
  for (const r of contacts) {
    const email = (r.Email || '').trim().toLowerCase();
    if (!email) continue;
    if (!byEmail.has(email)) byEmail.set(email, { leads: [], contacts: [] });
    byEmail.get(email)!.contacts.push(r);
  }
  const sql = wmill.datatable('main');
  const recipients = await sql`SELECT email_normalized, zoho_lead_id, owner_user_id, state
    FROM mumbai_nurture_recipients`.fetch();
  const result = {
    dry_run: true, crm_leads_scanned: leads.length, crm_contacts_scanned: contacts.length,
    recipients: recipients.length, exact_existing_lead: 0, existing_other_owner: 0,
    multiple_leads: 0, exact_contact: 0, crm_optout: 0,
    no_crm_record: 0, legacy_lead_mismatch: 0,
  };
  for (const r of recipients) {
    const m = byEmail.get(r.email_normalized);
    if (!m) { result.no_crm_record++; if (r.zoho_lead_id) result.legacy_lead_mismatch++; continue; }
    if (m.contacts.length) result.exact_contact++;
    if (m.leads.length > 1) result.multiple_leads++;
    if (m.leads.length) {
      result.exact_existing_lead++;
      if (m.leads.some((x) => x.Owner?.id !== r.owner_user_id && r.owner_user_id)) result.existing_other_owner++;
      if (r.zoho_lead_id && !m.leads.some((x) => x.id === r.zoho_lead_id)) result.legacy_lead_mismatch++;
    }
    if ([...m.leads, ...m.contacts].some((x) => x.Email_Opt_Out)) result.crm_optout++;
  }
  return result;
}
