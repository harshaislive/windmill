import * as wmill from 'windmill-client';

const ROOT = 'f/old_leads_churn';

async function currentRakeshToken() {
  const [clientId, clientSecret, refreshToken] = await Promise.all([
    wmill.getVariable(`${ROOT}/zoho_rakesh_client_id`),
    wmill.getVariable(`${ROOT}/zoho_rakesh_client_secret`),
    wmill.getVariable(`${ROOT}/zoho_rakesh_refresh_token`),
  ]);
  const response = await fetch('https://accounts.zoho.in/oauth/v2/token', {
    method: 'POST',
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret,
      refresh_token: refreshToken, grant_type: 'refresh_token' }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Zoho token HTTP ${response.status}`);
  const token = await response.json();
  if (!token.api_domain || !token.access_token) throw new Error('Zoho token missing fields');
  return token;
}

async function search(base: string, token: string, module: string, email: string): Promise<any[]> {
  const response = await fetch(`${base}/crm/v8/${module}/search?email=${encodeURIComponent(email)}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
    signal: AbortSignal.timeout(30000),
  });
  if (response.status === 204) return [];
  if (!response.ok) throw new Error(`Zoho ${module} search HTTP ${response.status}`);
  return ((await response.json()).data || []).filter((r: any) =>
    String(r.Email || '').trim().toLowerCase() === email);
}

/** Exact-address admission preview. It never creates or updates a CRM record. */
export async function main(recipient_id: number) {
  if (!Number.isSafeInteger(recipient_id) || recipient_id < 1) throw new Error('Invalid recipient id');
  const sql = wmill.datatable('main');
  const recipient = await sql`SELECT id,email_normalized,zoho_lead_id,zoho_contact_id,
    sender,owner_name,owner_user_id,collective,state,stop_reason,next_step
    FROM mumbai_nurture_recipients WHERE id=${recipient_id}`.fetchOne();
  if (!recipient) throw new Error('Recipient not found');
  const token = await currentRakeshToken();
  const [leads, contacts, layoutId, statusValue, collectiveValue, delivery,
    replyVisibility, copyApproved, ownerHandoff] = await Promise.all([
      search(token.api_domain, token.access_token, 'Leads', recipient.email_normalized),
      search(token.api_domain, token.access_token, 'Contacts', recipient.email_normalized),
      wmill.getVariable(`${ROOT}/zoho_lead_layout_id`),
      wmill.getVariable(`${ROOT}/zoho_new_lead_status_api_value`),
      wmill.getVariable(`${ROOT}/zoho_collective_name`),
      wmill.getVariable(`${ROOT}/delivery_enabled`),
      wmill.getVariable(`${ROOT}/reply_visibility_verified`),
      wmill.getVariable(`${ROOT}/email_copy_approved`),
      wmill.getVariable(`${ROOT}/owner_handoff_verified`),
    ]);
  const fieldsResponse = await fetch(`${token.api_domain}/crm/v8/settings/fields?module=Leads`, {
    headers: { Authorization: `Zoho-oauthtoken ${token.access_token}` },
    signal: AbortSignal.timeout(30000),
  });
  if (!fieldsResponse.ok) throw new Error(`Zoho Lead field metadata HTTP ${fieldsResponse.status}`);
  const fields = (await fieldsResponse.json()).fields || [];
  const statusField = fields.find((x: any) => x.api_name === 'Lead_Status');
  const collectiveField = fields.find((x: any) => x.api_name === 'Collective_Name');
  if (!statusField?.pick_list_values?.some((x: any) =>
        x.display_value === 'New Lead' && x.actual_value === statusValue) ||
      !collectiveField?.pick_list_values?.some((x: any) => x.actual_value === collectiveValue))
    throw new Error('Zoho Lead picklist mapping changed');
  const reasons: string[] = [];
  const expectedOwnerId = recipient.owner_user_id ||
    (recipient.sender === 'sai@beforest.co' || recipient.sender === 'community@beforest.co'
      ? '863791000000520050' : null);
  if (recipient.state === 'SUPPRESSED') reasons.push('ALREADY_SUPPRESSED');
  if (recipient.stop_reason === 'ADDRESS_CHANGE' || recipient.stop_reason === 'IDENTITY_AMBIGUITY')
    reasons.push(recipient.stop_reason);
  if (contacts.length) reasons.push('EXISTING_CONTACT');
  if (leads.length > 1) reasons.push('MULTIPLE_EXACT_LEADS');
  if (leads.some((x: any) => x.Email_Opt_Out)) reasons.push('CRM_OPT_OUT');
  if (expectedOwnerId && leads.some((x: any) => x.Owner?.id !== expectedOwnerId)) reasons.push('EXISTING_LEAD_OTHER_OWNER');
  if (recipient.zoho_lead_id && !leads.some((x: any) => x.id === recipient.zoho_lead_id))
    reasons.push('JOURNAL_LEAD_NOT_FOUND_BY_EMAIL');
  if (recipient.collective !== 'Mumbai') reasons.push('COLLECTIVE_CHANGED');
  if (delivery !== 'false') reasons.push('DELIVERY_SWITCH_UNEXPECTED');
  if (replyVisibility !== 'true') reasons.push('REPLY_VISIBILITY_UNVERIFIED');
  if (copyApproved !== 'true') reasons.push('COPY_UNAPPROVED');
  if (ownerHandoff !== 'true') reasons.push('OWNER_HANDOFF_UNVERIFIED');
  reasons.push('ACTIVE_SALES_AND_CONSENT_REVIEW_REQUIRED');
  const action = reasons.some((x) => ['EXISTING_CONTACT','MULTIPLE_EXACT_LEADS',
    'EXISTING_LEAD_OTHER_OWNER','JOURNAL_LEAD_NOT_FOUND_BY_EMAIL','ADDRESS_CHANGE',
    'IDENTITY_AMBIGUITY','ALREADY_SUPPRESSED'].includes(x)) ? 'HOLD_IDENTITY' :
    leads.length === 1 ? 'REUSE_EXACT_LEAD_AFTER_REVIEW' : 'CREATE_LEAD_AFTER_REVIEW';
  return {
    dry_run: true, recipient_id, state: recipient.state, sender: recipient.sender,
    owner: recipient.owner_name, exact_leads: leads.length, exact_contacts: contacts.length,
    action, reasons, live_mapping_verified: true, proposed_new_lead_fields: {
      Layout: { id: layoutId }, Lead_Status: statusValue, Collective_Name: collectiveValue,
      Owner: { id: expectedOwnerId }, Email: '[current reviewed Sheet email]',
    },
  };
}
