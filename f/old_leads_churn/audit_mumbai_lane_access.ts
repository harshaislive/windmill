import * as wmill from 'windmill-client';

const ROOT='f/old_leads_churn';
const lanes=[
  {sender:'sai@beforest.co',credential:'rakesh',owner:'863791000000520050'},
  {sender:'community@beforest.co',credential:'rakesh',owner:'863791000000520050'},
  {sender:'yogesh@beforest.co',credential:'yogesh',owner:'863791000008149001'},
  {sender:'harish@beforest.co',credential:'harish',owner:'863791000009584001'},
];

async function tokenFor(credential:string) {
  const [client_id,client_secret,refresh_token]=await Promise.all([
    wmill.getVariable(`${ROOT}/zoho_${credential}_client_id`),
    wmill.getVariable(`${ROOT}/zoho_${credential}_client_secret`),
    wmill.getVariable(`${ROOT}/zoho_${credential}_refresh_token`),
  ]);
  const response=await fetch('https://accounts.zoho.in/oauth/v2/token',{
    method:'POST',body:new URLSearchParams({client_id,client_secret,refresh_token,
      grant_type:'refresh_token'}),signal:AbortSignal.timeout(30000)});
  const body=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(`OAuth HTTP ${response.status} ${String(body.error||'UNKNOWN')}`);
  if(!body.api_domain||!body.access_token) throw new Error('OAuth incomplete');
  return body;
}

/** Read-only Rakesh creation metadata plus each assigned owner's identity and From address. */
export async function main() {
  let creatable=false;
  let metadataError:string|null=null;
  try {
    const admin=await tokenFor('rakesh');
    const response=await fetch(`${admin.api_domain}/crm/v8/settings/modules/Leads`,{
      headers:{Authorization:`Zoho-oauthtoken ${admin.access_token}`},
      signal:AbortSignal.timeout(30000)});
    const body=await response.json().catch(()=>({}));
    if(!response.ok) metadataError=`HTTP_${response.status}_${String(body.code||'UNKNOWN')}`;
    else creatable=(body.modules||[]).find((x:any)=>x.api_name==='Leads')?.creatable===true;
  } catch(error) {metadataError=String(error instanceof Error?error.message:error).slice(0,160);}
  const results:any[]=[];
  for(const lane of lanes) {
    try {
      const token=await tokenFor(lane.credential);
      const headers={Authorization:`Zoho-oauthtoken ${token.access_token}`};
      const [userResponse,fromResponse]=await Promise.all([
        fetch(`${token.api_domain}/crm/v8/users?type=CurrentUser`,{
          headers,signal:AbortSignal.timeout(30000)}),
        fetch(`${token.api_domain}/crm/v8/settings/emails/actions/from_addresses`,{
          headers,signal:AbortSignal.timeout(30000)}),
      ]);
      const [userBody,fromBody]=await Promise.all([
        userResponse.json().catch(()=>({})),fromResponse.json().catch(()=>({})),
      ]);
      const users=userResponse.ok?(userBody.users||[]):[];
      const from=fromResponse.ok?(fromBody.from_addresses||[]):[];
      const allowed=from.filter((x:any)=>String(x.email||'').toLowerCase()===lane.sender);
      const actualOwner=users.length===1?String(users[0].id||''):'';
      results.push({sender:lane.sender,owner_id_seen:actualOwner,
        owner_matches:actualOwner===lane.owner,leads_creatable:creatable,
        leads_metadata_principal:'rakesh',leads_metadata_error:metadataError,
        from_address_unique:allowed.length===1,
        community_org_email:lane.sender!=='community@beforest.co'||allowed[0]?.type==='org_email',
        current_user_error:userResponse.ok?null:`HTTP_${userResponse.status}_${String(userBody.code||'UNKNOWN')}`,
        from_address_error:fromResponse.ok?null:`HTTP_${fromResponse.status}_${String(fromBody.code||'UNKNOWN')}`});
    } catch(error) {
      results.push({sender:lane.sender,owner_matches:false,leads_creatable:creatable,
        leads_metadata_principal:'rakesh',leads_metadata_error:metadataError,
        from_address_unique:false,community_org_email:false,
        error:String(error instanceof Error?error.message:error).slice(0,160)});
    }
  }
  return {dry_run:true,crm_write:false,email_send:false,crm_creation_principal:'rakesh',
    lanes:results,all_metadata_preflights_pass:results.every(x=>x.owner_matches&&
      x.leads_creatable&&x.from_address_unique&&x.community_org_email),
    limitation:'A real newly assigned Lead must pass an owner-token GET before admission becomes READY.'};
}
