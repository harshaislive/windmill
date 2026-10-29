import * as wmill from 'windmill-client';

const ROOT = 'f/old_leads_churn';

/** Read-only internal QA plan. No CRM create, Note, Task, or email call. */
export async function main(internal_recipient: string = 'harsha@beforest.co') {
  if (!['harsha@beforest.co','seshu@beforest.co'].includes(internal_recipient))
    throw new Error('Only Harsha or Seshu internal test inbox is allowed');
  const recipient = internal_recipient;
  if (await wmill.getVariable(`${ROOT}/delivery_enabled`) !== 'false')
    throw new Error('Internal QA preview requires delivery disabled');
  const [client_id,client_secret,refresh_token,layoutId,statusValue,collectiveValue] =
    await Promise.all([
      wmill.getVariable(`${ROOT}/zoho_rakesh_client_id`),
      wmill.getVariable(`${ROOT}/zoho_rakesh_client_secret`),
      wmill.getVariable(`${ROOT}/zoho_rakesh_refresh_token`),
      wmill.getVariable(`${ROOT}/zoho_lead_layout_id`),
      wmill.getVariable(`${ROOT}/zoho_new_lead_status_api_value`),
      wmill.getVariable(`${ROOT}/zoho_collective_name`),
    ]);
  const authResponse = await fetch('https://accounts.zoho.in/oauth/v2/token', {
    method:'POST',body:new URLSearchParams({client_id,client_secret,refresh_token,
      grant_type:'refresh_token'}),signal:AbortSignal.timeout(30000),
  });
  if (!authResponse.ok) throw new Error(`Zoho OAuth HTTP ${authResponse.status}`);
  const auth = await authResponse.json();
  const headers = {Authorization:`Zoho-oauthtoken ${auth.access_token}`};
  const search = async (module:string) => {
    const response = await fetch(`${auth.api_domain}/crm/v8/${module}/search?email=${encodeURIComponent(recipient)}`, {
      headers,signal:AbortSignal.timeout(30000),
    });
    if (response.status===204) return [];
    if (!response.ok) throw new Error(`Zoho ${module} search HTTP ${response.status}`);
    return ((await response.json()).data || []).filter((r:any) =>
      String(r.Email || '').toLowerCase()===recipient);
  };
  const [leads,contacts,fromResponse] = await Promise.all([
    search('Leads'),search('Contacts'),
    fetch(`${auth.api_domain}/crm/v8/settings/emails/actions/from_addresses`, {
      headers,signal:AbortSignal.timeout(30000),
    }),
  ]);
  if (!fromResponse.ok) throw new Error(`Zoho From-address read HTTP ${fromResponse.status}`);
  const from = ((await fromResponse.json()).from_addresses || []).filter((x:any) =>
    String(x.email || '').toLowerCase()==='sai@beforest.co');
  const safeToCreate = leads.length===0 && contacts.length===0 && from.length===1;
  return {dry_run:true,internal_recipient:recipient,
    exact_existing_leads:leads.map((x:any)=>({id:x.id,owner_id:x.Owner?.id,opt_out:x.Email_Opt_Out})),
    exact_existing_contacts:contacts.map((x:any)=>({id:x.id,full_name:x.Full_Name,
      first_name:x.First_Name,last_name:x.Last_Name,
      owner_id:x.Owner?.id,opt_out:x.Email_Opt_Out,
      created_time:x.Created_Time})),
    sai_from_allowed:from.length===1,
    create_allowed_after_approval:safeToCreate,
    proposed_lead:safeToCreate ? {Email:recipient,Last_Name:'Internal Mumbai QA',
      Company:'Beforest',Owner:{id:'863791000000520050'},Layout:{id:layoutId},
      Lead_Status:statusValue,Collective_Name:collectiveValue} : null,
    proposed_followups:safeToCreate ? [
      'GET exact new Lead and owner read-back',
      'POST one labelled internal CRM Note and GET Notes read-back',
      'POST one owner-assigned internal CRM Task with exact Lead link and GET Task read-back',
      `POST one internal-only Send Mail to ${recipient} with sai From/Reply-To after separate test approval`,
      'GET exact Lead Emails log by returned message_id; reconcile uncertain outcomes without retry',
    ] : ['Use an existing exact CRM record only with an explicitly reviewed module/owner plan, or supply an isolated internal QA address for a new Lead test',
      `No Send Mail or CRM write to ${recipient} is approved by this preview`],
    action:safeToCreate ? 'INTERNAL_TEST_PLAN_READY_FOR_EXPLICIT_APPROVAL' :
      'HOLD_INTERNAL_TEST_RECIPIENT_ALREADY_IN_CRM_OR_FROM_UNAVAILABLE'};
}
