import * as wmill from 'windmill-client';

const ROOT='f/old_leads_churn';
const owners:Record<string,{lane:string,id:string}>={
  'sai@beforest.co':{lane:'rakesh',id:'863791000000520050'},
  'community@beforest.co':{lane:'rakesh',id:'863791000000520050'},
  'yogesh@beforest.co':{lane:'yogesh',id:'863791000008149001'},
  'harish@beforest.co':{lane:'harish',id:'863791000009584001'},
};

async function cachedZohoAuth(lane:string) {
 const path=`${ROOT}/zoho_${lane}_token_cache`;
 try { const c=JSON.parse(await wmill.getVariable(path));
  if(c.access_token&&c.api_domain==='https://www.zohoapis.in'&&Number(c.expires_at)>Date.now()+90000)return c;
 } catch {}
 const sql=wmill.datatable('main');
 await sql`CREATE TABLE IF NOT EXISTS mumbai_nurture_oauth_refresh_locks(lane text PRIMARY KEY,lease_until timestamptz NOT NULL)`.execute();
 const lease=await sql`INSERT INTO mumbai_nurture_oauth_refresh_locks(lane,lease_until) VALUES(${lane},now()+interval '2 minutes') ON CONFLICT(lane) DO UPDATE SET lease_until=excluded.lease_until WHERE mumbai_nurture_oauth_refresh_locks.lease_until<now() RETURNING lane`.fetchOne();
 if(!lease)throw new Error('OAuth refresh held by concurrency/backoff guard');
 const [client_id,client_secret,refresh_token]=await Promise.all(['client_id','client_secret','refresh_token'].map(k=>wmill.getVariable(`${ROOT}/zoho_${lane}_${k}`)));
 const res=await fetch('https://accounts.zoho.in/oauth/v2/token',{method:'POST',body:new URLSearchParams({client_id,client_secret,refresh_token,grant_type:'refresh_token'}),signal:AbortSignal.timeout(30000)});
 if(!res.ok)throw new Error(`OAuth refresh HTTP ${res.status}; held for backoff, no sends`);
 const c=await res.json();if(!c.access_token||c.api_domain!=='https://www.zohoapis.in')throw new Error('OAuth incomplete');
 c.expires_at=Date.now()+Math.min(Number(c.expires_in)||3600,3600)*1000-120000;
 await wmill.setVariable(path,JSON.stringify(c),true,'Encrypted reusable Zoho API token. Never print.');
 await sql`UPDATE mumbai_nurture_oauth_refresh_locks SET lease_until=now() WHERE lane=${lane}`.execute();
 return c;
}

async function auth(lane:string) { return cachedZohoAuth(lane); }
async function exact(base:string,token:string,module:string,email:string) {
  const response=await fetch(`${base}/crm/v8/${module}/search?email=${encodeURIComponent(email)}`,{
    headers:{Authorization:`Zoho-oauthtoken ${token}`},signal:AbortSignal.timeout(30000)});
  if(response.status===204) return [];
  if(!response.ok) throw new Error(`Zoho ${module} search HTTP ${response.status}`);
  return ((await response.json()).data||[]).filter((x:any)=>
    String(x.Email||'').trim().toLowerCase()===email);
}

/** One manually reviewed address. Defaults to read-only; never sends email. */
export async function main(recipient_id:number,dry_run:boolean=true,
  reviewed_email:string='',consent_confirmed:boolean=false,
  active_sales_clear:boolean=false,allow_crm_create:boolean=false,
  company_for_new_lead:string='',exploration_link:string='') {
  if(!Number.isSafeInteger(recipient_id)||recipient_id<1) throw new Error('Invalid recipient id');
  const sql=wmill.datatable('main');
  const row=await sql`SELECT id,email_normalized,person_name,sender,owner_user_id,
    zoho_lead_id,collective,state,stop_reason,next_step,last_verified_send_at,source_version,
    EXISTS (SELECT 1 FROM mumbai_nurture_source_links l
      WHERE l.recipient_id=mumbai_nurture_recipients.id AND l.batch_id IS NOT NULL)
      AS imported_legacy,
    (SELECT count(DISTINCT l.recipient_id)::integer FROM mumbai_nurture_source_links l
      WHERE l.batch_id IS NOT NULL) AS legacy_cohort_size
    FROM mumbai_nurture_recipients WHERE id=${recipient_id}`.fetchOne();
  if(!row) throw new Error('Recipient not found');
  const lane=owners[row.sender];
  const holds:string[]=[];
  if(!lane||row.owner_user_id!==lane.id) holds.push('OWNER_LANE_MISMATCH');
  if(row.collective!=='Mumbai') holds.push('COLLECTIVE_CHANGED');
  if(row.state==='SUPPRESSED') holds.push('ALREADY_SUPPRESSED');
  const legacy=row.imported_legacy===true && Number(row.legacy_cohort_size)===79 &&
    row.sender==='sai@beforest.co';
  if(row.imported_legacy&&!legacy) holds.push('LEGACY_COHORT_MISMATCH');
  const ordinaryHolds=legacy ? ['PENDING_REPLY_CHECK','HELD_EMAIL02_COPY_AND_REPLY_CHECK'] :
    ['PENDING_CRM_IDENTITY_AND_SUPPRESSION_CHECKS'];
  if(row.stop_reason&& !ordinaryHolds.includes(row.stop_reason))
    holds.push(`JOURNAL_${row.stop_reason}`);
  if(!row.person_name?.trim()&&!legacy) holds.push('MISSING_PERSON_NAME');
  const links=await sql`SELECT count(*)::integer n FROM mumbai_nurture_source_links
    WHERE recipient_id=${recipient_id} AND source_present=true`.fetchOne();
  if(Number(links.n)<1) holds.push('NO_CURRENT_MUMBAI_SOURCE');
  const stop=await sql`SELECT kind FROM mumbai_nurture_events WHERE recipient_id=${recipient_id}
    AND kind IN ('REPLY','OPTOUT','BOUNCE','SALES_HANDOFF','COLLECTIVE_CHANGE','ADDRESS_CHANGE','IDENTITY_HOLD')
    LIMIT 1`.fetchOne();
  if(stop) holds.push(`STOP_${stop.kind}`);
  if(!lane) return {dry_run,recipient_id,action:'HOLD',holds};
  // Harsha authorized the complete existing Sheet audience. Snapshot approval
  // replaces per-person review; it does not assert individual consent/Sales facts.
  const campaign=await sql`SELECT reviewed_by,reviewed_email,source_version,allow_crm_create
    FROM mumbai_nurture_admission_approvals WHERE recipient_id=${recipient_id}`.fetchOne();
  const basis='harsha:sheet-campaign:Sales Call List:Mumbai:2026-10-01';
  if(!row.zoho_lead_id && !legacy && campaign?.reviewed_by===basis) {
    if(campaign.reviewed_email!==row.email_normalized||campaign.source_version!==row.source_version||
      campaign.allow_crm_create||reviewed_email.trim().toLowerCase()!==row.email_normalized)
      holds.push('CAMPAIGN_SNAPSHOT_CHANGED');
    if(await wmill.getVariable(`${ROOT}/sheet_campaign_authorization`)!==basis||
      await wmill.getVariable(`${ROOT}/non_crm_sending_enabled`)!=='true') holds.push('CAMPAIGN_RELEASE_CLOSED');
    // Source, owner, identity and all recorded stops were checked above. This
    // outside-Zoho campaign neither adopts nor creates an existing CRM record.
    return {dry_run:true,recipient_id,action:holds.length?'HOLD':'WOULD_ADMIT',holds,
      admission_mode:'gmail',approval_basis:'HARSHA_SHEET_CAMPAIGN',crm_write:false,email_send:false};
  }
  const ownerAuth=row.zoho_lead_id?await auth(lane.lane):null;
  // Harsha approved Rakesh as the creation principal; ownership stays lane-specific.
  const crmAuth=lane.lane==='rakesh'&&ownerAuth?ownerAuth:await auth('rakesh');
  const [leads,contacts]=await Promise.all([
    exact(crmAuth.api_domain,crmAuth.access_token,'Leads',row.email_normalized),
    exact(crmAuth.api_domain,crmAuth.access_token,'Contacts',row.email_normalized),
  ]);
  // Harsha deferred all new CRM Leads. New prospects use the mail-only queue;
  // even a prior allow_crm_create approval cannot authorize a CRM POST now.
  if(!row.zoho_lead_id && !legacy) {
    if(leads.length||contacts.length) holds.push('EXISTING_CRM_PERSON_REQUIRES_MANUAL_REVIEW');
    if(!consent_confirmed) holds.push('CONSENT_REVIEW_REQUIRED');
    if(!active_sales_clear) holds.push('ACTIVE_SALES_REVIEW_REQUIRED');
    if(reviewed_email.trim().toLowerCase()!==row.email_normalized) holds.push('EXACT_EMAIL_REVIEW_REQUIRED');
    if(await wmill.getVariable(`${ROOT}/non_crm_sending_enabled`)!=='true') holds.push('MAIL_ONLY_SENDING_NOT_RELEASED');
    if(dry_run||holds.length) return {dry_run:true,recipient_id,action:holds.length?'HOLD':'WOULD_ADMIT',
      holds,proposed_action:'TRACK_AND_NURTURE_OUTSIDE_ZOHO',assigned_owner_id:lane.id,
      crm_write:false,email_send:false,admission_mode:'gmail',exact_leads:leads.length,exact_contacts:contacts.length};
    const updated=await sql`UPDATE mumbai_nurture_recipients r SET admission_mode='gmail',
      state='READY',stop_reason=NULL,next_due_at=CASE WHEN last_verified_send_at IS NULL THEN now()
        ELSE greatest(now(),last_verified_send_at+interval '48 hours') END,updated_at=now()
      WHERE r.id=${recipient_id} AND r.state='HELD' AND r.zoho_lead_id IS NULL
        AND r.email_normalized=${reviewed_email.trim().toLowerCase()} AND r.sender=${row.sender}
        AND r.owner_user_id=${lane.id} AND r.collective='Mumbai' AND r.source_version=${row.source_version}
        AND r.next_step BETWEEN 1 AND 6
        AND EXISTS (SELECT 1 FROM mumbai_nurture_admission_approvals a WHERE a.recipient_id=r.id
          AND a.reviewed_email=r.email_normalized AND a.source_version=r.source_version
          AND a.consent_confirmed AND a.active_sales_clear)
        AND EXISTS (SELECT 1 FROM mumbai_nurture_source_links l WHERE l.recipient_id=r.id AND l.source_present)
        AND NOT EXISTS (SELECT 1 FROM mumbai_nurture_events e WHERE e.recipient_id=r.id
          AND e.kind IN ('REPLY','OPTOUT','BOUNCE','SALES_HANDOFF','COLLECTIVE_CHANGE','ADDRESS_CHANGE','IDENTITY_HOLD'))
      RETURNING id,state,admission_mode,zoho_lead_id`.fetchOne();
    if(!updated||updated.state!=='READY'||updated.admission_mode!=='gmail'||updated.zoho_lead_id)
      throw new Error('Mail-only admission lost approval or eligibility race; no CRM write');
    return {dry_run:false,recipient_id,action:'ADMITTED_READY',admission_mode:'gmail',
      assigned_owner_id:lane.id,crm_write:false,email_send:false,read_back:true};
  }
  let leadsCreatable:boolean|null=null;
  if(!leads.length) {
    holds.push('CRM_CREATION_DEFERRED_BY_HARSHA');
    const moduleResponse=await fetch(`${crmAuth.api_domain}/crm/v8/settings/modules/Leads`,{
      headers:{Authorization:`Zoho-oauthtoken ${crmAuth.access_token}`},
      signal:AbortSignal.timeout(30000)});
    if(!moduleResponse.ok) throw new Error(`Rakesh Leads-create metadata HTTP ${moduleResponse.status}`);
    const leadModule=((await moduleResponse.json()).modules||[])
      .find((x:any)=>x.api_name==='Leads');
    leadsCreatable=leadModule?.creatable===true;
    if(!leadsCreatable) holds.push('RAKESH_CANNOT_CREATE_LEADS');
  }
  if(contacts.length) holds.push('EXISTING_CONTACT');
  if(leads.length>1) holds.push('MULTIPLE_EXACT_LEADS');
  if(legacy&&!row.zoho_lead_id) holds.push('LEGACY_LEAD_ID_MISSING');
  if(legacy&&leads.length!==1) holds.push('LEGACY_EXACT_LEAD_NOT_UNIQUE');
  if(leads.some((x:any)=>x.Email_Opt_Out)) holds.push('CRM_OPT_OUT');
  if(leads.some((x:any)=>String(x.Owner?.id||'')!==lane.id)) holds.push('EXISTING_LEAD_OTHER_OWNER');
  if(row.zoho_lead_id&&leads.length===1&&String(leads[0].id)!==String(row.zoho_lead_id))
    holds.push('JOURNAL_LEAD_MISMATCH');
  const collective=await wmill.getVariable(`${ROOT}/zoho_collective_name`);
  const status=await wmill.getVariable(`${ROOT}/zoho_new_lead_status_api_value`);
  const requiredStatus=legacy?'Not Contacted':status;
  if(leads.length===1 && (leads[0].Collective_Name!==collective||
    leads[0].Lead_Status!==requiredStatus)) holds.push('EXISTING_LEAD_SALES_OR_COLLECTIVE_CHANGED');
  let historyVerifiedCount:number|null=null;
  let openActivityCount:number|null=null;
  if(legacy&&row.zoho_lead_id) {
    const journal=await sql`SELECT step,crm_message_id FROM mumbai_nurture_sends
      WHERE recipient_id=${recipient_id} AND status='VERIFIED_SENT' ORDER BY step`.fetch();
    if(journal.length<2||journal.length>3||Number(row.next_step)!==journal.length+1||
        journal.some((x:any,i:number)=>Number(x.step)!==i+1||!x.crm_message_id))
      holds.push('LEGACY_SEND_JOURNAL_MISMATCH');
    const headers={Authorization:`Zoho-oauthtoken ${crmAuth.access_token}`};
    const [historyResponse,activityResponse]=await Promise.all([
      fetch(`${crmAuth.api_domain}/crm/v8/Leads/${row.zoho_lead_id}/Emails?type=sent_from_crm`,{
        headers,signal:AbortSignal.timeout(30000)}),
      fetch(`${crmAuth.api_domain}/crm/v8/Leads/${row.zoho_lead_id}/Activities_Chronological_View?fields=Subject&per_page=200`,{
        headers,signal:AbortSignal.timeout(30000)}),
    ]);
    if(!historyResponse.ok) throw new Error(`Legacy Zoho email history HTTP ${historyResponse.status}`);
    const history=await historyResponse.json();
    if(history.info?.more_records) throw new Error('Legacy Zoho email history paginated');
    const messages=history.Emails||[];
    historyVerifiedCount=messages.length;
    const byId=new Map(messages.map((x:any)=>[String(x.message_id),x]));
    if(messages.length!==journal.length||journal.some((x:any)=>{
      const live:any=byId.get(String(x.crm_message_id));
      return !live||String(live.to?.[0]?.email||'').toLowerCase()!==row.email_normalized;
    })) holds.push('LEGACY_LIVE_SEND_HISTORY_MISMATCH');
    if(activityResponse.status===204) openActivityCount=0;
    else {
      if(!activityResponse.ok) throw new Error(`Legacy open-activity HTTP ${activityResponse.status}`);
      const activity=await activityResponse.json();
      if(activity.info?.more_records) throw new Error('Legacy open activities paginated');
      openActivityCount=(activity.data||[]).length;
    }
    if(openActivityCount!==0) holds.push('OPEN_CRM_SALES_ACTIVITY');
  }
  if(!consent_confirmed) holds.push('CONSENT_REVIEW_REQUIRED');
  if(!active_sales_clear) holds.push('ACTIVE_SALES_REVIEW_REQUIRED');
  if(reviewed_email.trim().toLowerCase()!==row.email_normalized)
    holds.push('EXACT_EMAIL_REVIEW_REQUIRED');
  if(!leads.length) {
    const wantedLayout=await wmill.getVariable(`${ROOT}/zoho_lead_layout_id`);
    const access=await fetch(`${crmAuth.api_domain}/crm/v8/settings/layouts?module=Leads`,{headers:{Authorization:`Zoho-oauthtoken ${crmAuth.access_token}`},signal:AbortSignal.timeout(30000)});
    if(!access.ok) throw new Error(`Layout visibility preflight HTTP ${access.status}`);
    const allowed=((await access.json()).layouts||[]).find((x:any)=>String(x.id)===wantedLayout);
    if(allowed?.visible!==true||allowed?.status!=='active') holds.push('WAITING_LAYOUT_ACCESS');
  }
  if(!leads.length&&!exploration_link) {
    try { exploration_link=await wmill.getVariable(`${ROOT}/zoho_exploration_link_mumbai`); } catch {}
  }
  if(!leads.length&&!/^https:\/\//.test(exploration_link)) holds.push('EXPLORATION_LINK_REQUIRED');
  if(!leads.length && (!allow_crm_create||!company_for_new_lead.trim()))
    holds.push('NEW_LEAD_CREATE_AND_COMPANY_REVIEW_REQUIRED');
  const proposed=legacy?'REUSE_EXACT_LEGACY_LEAD_ONLY':
    leads.length===1?'REUSE_EXACT_LEAD':'CREATE_NEW_LEAD';
  if(dry_run||holds.length) return {dry_run:true,recipient_id,sender:row.sender,
    exact_leads:leads.length,exact_contacts:contacts.length,
    imported_legacy:legacy,verified_legacy_crm_messages:historyVerifiedCount,
    open_crm_activity_count:openActivityCount,
    existing_lead_id:leads.length===1?String(leads[0].id):null,
    crm_leads_creatable:leadsCreatable,
    crm_creation_principal:'rakesh',assigned_owner_id:lane.id,
    proposed_action:proposed,action:holds.length?'HOLD':'WOULD_ADMIT',holds,
    crm_write:false,email_send:false};
  // Durable lease before any CRM mutation. An uncertain outcome remains held
  // for manual reconciliation; another run cannot issue a second POST.
  const lease=await sql`UPDATE mumbai_nurture_recipients SET
    state='ADMISSION_ATTEMPTING',stop_reason='ADMISSION_RECONCILE_REQUIRED',
    next_due_at=NULL,updated_at=now()
    WHERE id=${recipient_id} AND state='HELD' AND email_normalized=${row.email_normalized}
      AND owner_user_id=${lane.id} AND collective='Mumbai'
    RETURNING id`.fetchOne();
  if(!lease) throw new Error('Admission lease lost; no CRM write attempted');
  let leadId=leads.length===1?String(leads[0].id):'';
  if(!leadId) {
    throw new Error('New Zoho Leads are deferred until Harsha reviews a reply');
    const layoutId=await wmill.getVariable(`${ROOT}/zoho_lead_layout_id`);
    const words=String(row.person_name).trim().split(/\s+/);
    const lastName=words.pop();
    const payload={data:[{Email:row.email_normalized,First_Name:words.join(' ')||undefined,
      Last_Name:lastName,Company:company_for_new_lead.trim(),Owner:{id:lane.id},
      Layout:{id:layoutId},Lead_Status:status,Collective_Name:collective,Exploration_Link:exploration_link}],
      trigger:[],skip_feature_execution:[{name:'cadences'}]};
    const created=await fetch(`${crmAuth.api_domain}/crm/v8/Leads`,{
      method:'POST',headers:{Authorization:`Zoho-oauthtoken ${crmAuth.access_token}`,
        'Content-Type':'application/json'},body:JSON.stringify(payload),
      signal:AbortSignal.timeout(30000)});
    const result=await created.json().catch(()=>({}));
    if(!created.ok||result?.data?.[0]?.code!=='SUCCESS'||!result.data[0].details?.id)
      throw new Error(`Lead create outcome requires reconciliation: HTTP ${created.status}, code ${result?.data?.[0]?.code||result.code||'UNKNOWN'}, field ${result?.data?.[0]?.details?.api_name||''}; no retry`);
    leadId=String(result.data[0].details.id);
  }
  const leadRead=await fetch(`${ownerAuth.api_domain}/crm/v8/Leads/${leadId}`,{
    headers:{Authorization:`Zoho-oauthtoken ${ownerAuth.access_token}`},signal:AbortSignal.timeout(30000)});
  if(!leadRead.ok||leadRead.status===204)
    throw new Error('Assigned owner cannot read the Lead; admission remains held for reconciliation');
  const lead=(await leadRead.json()).data?.[0];
  if(!lead||String(lead.Email||'').toLowerCase()!==row.email_normalized||
    String(lead.Owner?.id||'')!==lane.id||lead.Email_Opt_Out||
    lead.Collective_Name!==collective||lead.Lead_Status!==requiredStatus)
    throw new Error('Lead create/reuse identity read-back mismatch');
  const updated=await sql`UPDATE mumbai_nurture_recipients r SET zoho_lead_id=${leadId},
    state='READY',stop_reason=NULL,
    next_due_at=CASE WHEN r.last_verified_send_at IS NULL THEN now()
      ELSE greatest(now(),r.last_verified_send_at+interval '48 hours') END,
    updated_at=now()
    WHERE r.id=${recipient_id} AND r.state='ADMISSION_ATTEMPTING' AND r.collective='Mumbai'
      AND r.email_normalized=${row.email_normalized} AND r.sender=${row.sender}
      AND r.owner_user_id=${lane.id} AND r.next_step BETWEEN 1 AND 6
      AND NOT EXISTS (SELECT 1 FROM mumbai_nurture_events e WHERE e.recipient_id=r.id
        AND e.kind IN ('REPLY','OPTOUT','BOUNCE','SALES_HANDOFF','COLLECTIVE_CHANGE','ADDRESS_CHANGE','IDENTITY_HOLD'))
      AND EXISTS (SELECT 1 FROM mumbai_nurture_source_links l
        WHERE l.recipient_id=r.id AND l.source_present=true)
    RETURNING id,zoho_lead_id,state`.fetchOne();
  if(!updated||updated.state!=='READY'||String(updated.zoho_lead_id)!==leadId)
    throw new Error('Lead verified but journal admission failed; manual reconcile required');
  return {dry_run:false,recipient_id,lead_id:leadId,action:'ADMITTED_READY',
    crm_creation_principal:'rakesh',assigned_owner_id:lane.id,
    owner_record_read_back:true,email_send:false,read_back:true};
}
