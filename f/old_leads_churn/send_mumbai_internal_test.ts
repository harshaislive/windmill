import * as wmill from 'windmill-client';

const ROOT='f/old_leads_churn';
const FROM='sai@beforest.co';
const targets:Record<string,{module:string,id:string,key:string}>={
  'harsha@beforest.co':{module:'Contacts',id:'863791000000531640',
    key:'mumbai-internal-e01-20260930-harsha'},
  'seshu@beforest.co':{module:'Leads',id:'863791000009577032',
    key:'mumbai-internal-e01-20260930-seshu'},
};
async function auth() {
  const [client_id,client_secret,refresh_token]=await Promise.all([
    wmill.getVariable(`${ROOT}/zoho_rakesh_client_id`),
    wmill.getVariable(`${ROOT}/zoho_rakesh_client_secret`),
    wmill.getVariable(`${ROOT}/zoho_rakesh_refresh_token`)]);
  const response=await fetch('https://accounts.zoho.in/oauth/v2/token',{
    method:'POST',body:new URLSearchParams({client_id,client_secret,refresh_token,
      grant_type:'refresh_token'}),signal:AbortSignal.timeout(30000)});
  if(!response.ok) throw new Error(`Zoho OAuth HTTP ${response.status}`);
  const value=await response.json();
  if(!value.access_token||!value.api_domain) throw new Error('Zoho OAuth incomplete');
  return value;
}

/** Exactly two approved internal E01 tests. Independent of prospect delivery. */
export async function main(recipient_email:string,dry_run:boolean=true) {
  const email=recipient_email.trim().toLowerCase();
  const target=targets[email];
  if(!target) throw new Error('Recipient is not in the two-address internal allowlist');
  const sql=wmill.datatable('main');
  const prior=await sql`SELECT status,crm_message_id FROM mumbai_nurture_internal_tests
    WHERE qa_key=${target.key}`.fetchOne();
  if(prior) return {dry_run:true,recipient_email:email,action:'ALREADY_ATTEMPTED_NO_RETRY',
    status:prior.status,crm_message_id:prior.crm_message_id||null};
  const copy=JSON.parse(await wmill.getVariable(`${ROOT}/approved_email_01_json`));
  if(!copy.subject||!copy.html||copy.version!=='mumbai-v1')
    throw new Error('Original approved Email 01 copy not ready');
  const a=await auth();
  const headers={Authorization:`Zoho-oauthtoken ${a.access_token}`};
  const [recordResponse,fromResponse]=await Promise.all([
    fetch(`${a.api_domain}/crm/v8/${target.module}/${target.id}`,{
      headers,signal:AbortSignal.timeout(30000)}),
    fetch(`${a.api_domain}/crm/v8/settings/emails/actions/from_addresses`,{
      headers,signal:AbortSignal.timeout(30000)})]);
  if(!recordResponse.ok||!fromResponse.ok)
    throw new Error(`Internal CRM preflight HTTP ${recordResponse.status}/${fromResponse.status}`);
  const record=(await recordResponse.json()).data?.[0];
  const allowed=((await fromResponse.json()).from_addresses||[]).filter((x:any)=>
    String(x.email||'').toLowerCase()===FROM);
  if(!record||String(record.Email||'').toLowerCase()!==email||record.Email_Opt_Out||
    allowed.length!==1) throw new Error('Internal record/From/opt-out preflight mismatch');
  const payload={data:[{from:{email:FROM},reply_to:{email:FROM},
    to:[{email}],subject:copy.subject,content:copy.html,mail_format:'html'}]};
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(JSON.stringify(payload)))))
    .map(x=>x.toString(16).padStart(2,'0')).join('');
  const preview={recipient_email:email,sender:FROM,crm_module:target.module,
    crm_record_id:target.id,crm_owner_id:String(record.Owner?.id||''),
    subject:copy.subject,html_chars:copy.html.length,copy_version:copy.version,
    payload_sha256:hash,prospect_delivery_switch_untouched:true};
  if(dry_run) return {dry_run:true,action:'READY_FOR_APPROVED_INTERNAL_SEND',...preview};
  const lease=await sql`INSERT INTO mumbai_nurture_internal_tests
    (qa_key,recipient_email,crm_module,crm_record_id,sender,step,payload_sha256,payload,status)
    VALUES (${target.key},${email},${target.module},${target.id},${FROM},1,${hash},
      ${JSON.stringify(payload)}::jsonb,'ATTEMPTING')
    ON CONFLICT (qa_key) DO NOTHING RETURNING qa_key`.fetchOne();
  if(!lease) throw new Error('Internal send lease already exists; never retry');
  let response:Response;
  try {
    response=await fetch(`${a.api_domain}/crm/v8/${target.module}/${target.id}/actions/send_mail`,{
      method:'POST',headers:{...headers,'Content-Type':'application/json'},
      body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)});
  } catch {
    await sql`UPDATE mumbai_nurture_internal_tests SET status='UNCERTAIN'
      WHERE qa_key=${target.key} AND status='ATTEMPTING'`.execute();
    return {dry_run:false,action:'SEND_OUTCOME_UNCERTAIN_NO_RETRY',...preview};
  }
  const result=await response.json().catch(()=>({}));
  const accepted=response.ok&&result?.data?.length===1&&
    result.data[0].code==='SUCCESS'&&result.data[0].status==='success'&&
    !!result.data[0].details?.message_id;
  const returnedId=accepted?String(result.data[0].details.message_id):null;
  await sql`UPDATE mumbai_nurture_internal_tests SET status='UNCERTAIN',
    crm_message_id=${returnedId} WHERE qa_key=${target.key} AND status='ATTEMPTING'`.execute();
  if(!accepted) return {dry_run:false,action:'CRM_SEND_NOT_CONFIRMED_NO_RETRY',http_status:response.status,
    ...preview};
  const logs=await fetch(`${a.api_domain}/crm/v8/${target.module}/${target.id}/Emails?type=sent_from_crm`,{
    headers,signal:AbortSignal.timeout(30000)});
  if(!logs.ok) return {dry_run:false,action:'DISPATCH_ACCEPTED_LOG_UNCERTAIN_NO_RETRY',
    crm_message_id:returnedId,...preview};
  const body=await logs.json();
  const matches=(body.Emails||[]).filter((x:any)=>
    String(x.message_id)===returnedId&&
    String(x.from?.email||'').toLowerCase()===FROM&&
    (x.to||[]).length===1&&
    String(x.to[0].email||'').toLowerCase()===email&&
    x.subject===copy.subject);
  if(matches.length!==1||body.info?.more_records)
    return {dry_run:false,action:'DISPATCH_ACCEPTED_LOG_UNCERTAIN_NO_RETRY',
      crm_message_id:returnedId,matches:matches.length,...preview};
  await sql`UPDATE mumbai_nurture_internal_tests SET status='VERIFIED',
    verified_at=now() WHERE qa_key=${target.key} AND status='UNCERTAIN'
      AND crm_message_id=${returnedId}`.execute();
  const verify=await sql`SELECT status,crm_message_id FROM mumbai_nurture_internal_tests
    WHERE qa_key=${target.key}`.fetchOne();
  if(verify?.status!=='VERIFIED'||String(verify.crm_message_id)!==returnedId)
    throw new Error('Internal send journal read-back failed');
  return {dry_run:false,action:'EXACT_CRM_EMAIL_LOG_VERIFIED',crm_message_id:returnedId,
    ...preview};
}
