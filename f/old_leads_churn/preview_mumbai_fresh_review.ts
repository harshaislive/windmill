import * as wmill from 'windmill-client';

const ROOT='f/old_leads_churn';
const SHEET='1LojS6cGdt8JJl0NbOONwG7wf9OXjWL4qfezbYT8sL7w';
const CONNECTION='6463e553-eab2-4cb9-a46f-b1a5665c0031';

/** Up to twenty clear review rows, five per sender, from a bounded sixty-row pool. No approval, admission or send. */
export async function main() {
  const sql=wmill.datatable('main');
  const selected=await sql`WITH ranked AS (
    SELECT r.id,r.person_name,r.email_normalized,r.sender,r.owner_name,r.owner_user_id,r.source_version,
      row_number() OVER(PARTITION BY r.sender ORDER BY r.id) lane_rank
    FROM mumbai_nurture_recipients r WHERE r.state='HELD' AND r.collective='Mumbai'
      AND r.zoho_lead_id IS NULL AND r.zoho_contact_id IS NULL AND r.next_step=1
      AND r.stop_reason='PENDING_CRM_IDENTITY_AND_SUPPRESSION_CHECKS'
      AND coalesce(trim(r.person_name),'')<>'' AND r.email_normalized NOT LIKE '%@beforest.co'
      AND r.email_normalized NOT LIKE '%.invalid'
      AND EXISTS(SELECT 1 FROM mumbai_nurture_source_links l WHERE l.recipient_id=r.id AND l.source_present)
      AND NOT EXISTS(SELECT 1 FROM mumbai_nurture_sends s WHERE s.recipient_id=r.id)
      AND NOT EXISTS(SELECT 1 FROM mumbai_nurture_events e WHERE e.recipient_id=r.id)
      AND NOT EXISTS(SELECT 1 FROM mumbai_nurture_admission_approvals a WHERE a.recipient_id=r.id)
  ) SELECT * FROM ranked WHERE lane_rank<=15 ORDER BY sender,lane_rank`.fetch();
  const key=await wmill.getVariable(`${ROOT}/harsha_maton_api_key`);
  const response=await fetch(`https://api.maton.ai/google-sheets/v4/spreadsheets/${SHEET}/values/${encodeURIComponent("'Sales Call List'!A1:N4000")}`,{
    headers:{Authorization:`Bearer ${key}`,'Maton-Connection':CONNECTION},signal:AbortSignal.timeout(30000)});
  if(!response.ok) throw new Error(`Current source read HTTP ${response.status}`);
  const sheet=((await response.json()).values||[]) as string[][];
  if(sheet[0]?.[1]!=='Lead Name'||sheet[0]?.[3]!=='Collective'||sheet[0]?.[10]!=='Pipedrive'||sheet[0]?.[13]!=='Email')
    throw new Error('Source columns changed');
  let cache:any=null;
  try {cache=JSON.parse(await wmill.getVariable(`${ROOT}/zoho_rakesh_token_cache`));}catch{}
  const crmReady=cache?.api_domain==='https://www.zohoapis.in'&&cache?.access_token&&Number(cache.expires_at)>Date.now()+90000;
  const output=[],excluded=[];
  const laneCount:Record<string,number>={};
  for(const row of selected) {
    if((laneCount[row.sender]||0)>=5) continue;
    const reasons:string[]=[];
    const source=sheet.slice(1).map((cells,index)=>({cells,row:index+2})).filter(x=>x.cells[3]==='Mumbai'&&
      String(x.cells[13]||'').trim().toLowerCase()===row.email_normalized);
    if(!source.length) reasons.push('NOT_IN_CURRENT_SOURCE');
    const names=new Set(source.map(x=>String(x.cells[1]||'').trim().replace(/\s+/g,' ').toLowerCase()).filter(Boolean));
    if(names.size!==1||!names.has(String(row.person_name).trim().replace(/\s+/g,' ').toLowerCase()))
      reasons.push('CURRENT_SOURCE_NAME_AMBIGUOUS_OR_CHANGED');
    let leads:number|null=null,contacts:number|null=null;
    if(crmReady) {
      for(const module of ['Leads','Contacts']) {
        const found=await fetch(`${cache.api_domain}/crm/v8/${module}/search?email=${encodeURIComponent(row.email_normalized)}&per_page=200`,{
          headers:{Authorization:`Zoho-oauthtoken ${cache.access_token}`},signal:AbortSignal.timeout(30000)});
        if(found.status===204) {if(module==='Leads')leads=0;else contacts=0;continue;}
        if(!found.ok) {reasons.push(`CRM_${module.toUpperCase()}_READ_UNVERIFIED`);continue;}
        const result=await found.json();
        if(result.info?.more_records) reasons.push(`CRM_${module.toUpperCase()}_SEARCH_PAGINATED`);
        const count=(result.data||[]).filter((x:any)=>String(x.Email||'').trim().toLowerCase()===row.email_normalized).length;
        if(module==='Leads') leads=count;else contacts=count;
        if(count) reasons.push(`EXISTING_CRM_${module.toUpperCase()}`);
      }
    } else reasons.push('CRM_SCREEN_NOT_AVAILABLE_NO_TOKEN_REFRESH');
    const reviewed={recipient_id:Number(row.id),name:row.person_name,email:row.email_normalized,
      sender:row.sender,owner:row.owner_name,owner_user_id:row.owner_user_id,source_version:row.source_version,
      current_source_rows:source.map(x=>x.row),current_source_deal_links:source.map(x=>x.cells[10]||''),
      existing_exact_leads:leads,existing_exact_contacts:contacts,
      screen:reasons.length?'HOLD_FOR_REVIEW':'CURRENT_SOURCE_AND_CRM_CLEAR',screen_holds:reasons,
      consent_confirmed:null,active_sales_clear:null,harsha_decision:null,
      state:'HELD',crm_create_allowed:false,approved_for_send:false};
    if(reasons.length) excluded.push(reviewed);
    else {output.push(reviewed);laneCount[row.sender]=(laneCount[row.sender]||0)+1;}
  }
  return {as_of:new Date().toISOString(),read_only:true,selected:output.length,
    screened:output.length+excluded.length,excluded_from_proposal:excluded,lane_counts:laneCount,
    plan:'Up to twenty source/CRM-clear review rows, five per sender; initial release can admit at most five per day.',
    source_and_crm_clear:output.filter(x=>x.screen==='CURRENT_SOURCE_AND_CRM_CLEAR').length,
    rows:output,oauth_refreshes:0,approvals_written:0,admissions:0,email_sends:0,crm_writes:0,sheets_writes:0};
}
