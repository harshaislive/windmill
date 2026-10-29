import {afterEach,beforeEach,expect,mock,test} from 'bun:test';
let row:any,approval=true,existing=false,gate=true,stop:any=null;
let calls:any[]=[];
const originalFetch=globalThis.fetch;
mock.module('windmill-client',()=>({
 getVariable:async(path:string)=>{
  const lane=path.match(/zoho_(rakesh|harish|yogesh)_token_cache/)?.[1];
  if(lane)return JSON.stringify({api_domain:'https://www.zohoapis.in',access_token:'test-'+lane,expires_at:Date.now()+3600000});
  if(path.endsWith('non_crm_sending_enabled'))return gate?'true':'false';
  throw new Error('Unexpected variable '+path);
 },
 datatable:()=> (parts:TemplateStringsArray,...values:any[])=>({fetchOne:async()=>{
  const sql=parts.join('?');
  if(sql.includes('SELECT id,email_normalized,person_name'))return {...row};
  if(sql.includes('SELECT count(*)::integer n FROM mumbai_nurture_source_links'))return {n:1};
  if(sql.includes('SELECT kind FROM mumbai_nurture_events'))return stop;
  if(sql.includes('SELECT reviewed_by,reviewed_email'))return null;
  if(sql.includes("SET admission_mode='gmail'")) {
   if(!approval||row.state!=='HELD')return null;
   row.state='READY';row.admission_mode='gmail';row.stop_reason=null;
   return {id:row.id,state:'READY',admission_mode:'gmail',zoho_lead_id:null};
  }
  throw new Error('Unexpected SQL '+sql);
 }})
}));
const {main}=await import('../f/old_leads_churn/admit_mumbai_candidate.ts');
beforeEach(()=>{
 row={id:900,email_normalized:'fixture@example.invalid',person_name:'QA',sender:'yogesh@beforest.co',
 owner_user_id:'863791000008149001',zoho_lead_id:null,collective:'Mumbai',state:'HELD',
 stop_reason:'PENDING_CRM_IDENTITY_AND_SUPPRESSION_CHECKS',next_step:1,source_version:'mumbai-v1',imported_legacy:false};
 approval=true;existing=false;gate=true;stop=null;calls=[];
 globalThis.fetch=(async(url:any,init:any={})=>{
  calls.push({url:String(url),method:init.method||'GET',auth:init.headers?.Authorization});
  if(String(url).includes('/search?')) return existing&&String(url).includes('/Leads/')?
   Response.json({data:[{id:'EXISTING',Email:row.email_normalized}]}):new Response(null,{status:204});
  throw new Error('Unexpected network request '+url);
 }) as typeof fetch;
});
afterEach(()=>{globalThis.fetch=originalFetch;});
for(const [sender,id] of [['harish@beforest.co','863791000009584001'],['yogesh@beforest.co','863791000008149001']]) {
 test(sender+' keeps ownership in mail-only queue even with stale CRM-create approval',async()=>{
  row.sender=sender;row.owner_user_id=id;
  const result=await main(900,false,row.email_normalized,true,true,true,'Old company','https://beforest.co/');
  expect(result.action).toBe('ADMITTED_READY');expect(result.assigned_owner_id).toBe(id);
  expect(result.admission_mode).toBe('gmail');expect(result.crm_write).toBe(false);
  expect(row.zoho_lead_id).toBeNull();expect(calls).toHaveLength(2);
  expect(calls.every(x=>x.method==='GET'&&x.auth==='Zoho-oauthtoken test-rakesh')).toBe(true);
 });
}
test('outside the approved Sheet campaign, per-person consent and active-Sales review are required',async()=>{
 const result=await main(900,false,row.email_normalized);
 expect(result.action).toBe('HOLD');expect(result.holds).toContain('CONSENT_REVIEW_REQUIRED');
 expect(result.holds).toContain('ACTIVE_SALES_REVIEW_REQUIRED');expect(row.state).toBe('HELD');
});
test('any exact CRM match requires manual review without reuse or creation',async()=>{
 existing=true;const result=await main(900,false,row.email_normalized,true,true,true);
 expect(result.action).toBe('HOLD');expect(result.holds).toContain('EXISTING_CRM_PERSON_REQUIRES_MANUAL_REVIEW');
 expect(row.state).toBe('HELD');expect(calls.every(x=>x.method==='GET')).toBe(true);
});
test('revoked saved approval blocks the final admission race',async()=>{
 approval=false;await expect(main(900,false,row.email_normalized,true,true)).rejects.toThrow('lost approval');
 expect(row.state).toBe('HELD');expect(calls.every(x=>x.method==='GET')).toBe(true);
});
test('reply event and closed mail gate both hold the prospect',async()=>{
 stop={kind:'REPLY'};gate=false;const result=await main(900,false,row.email_normalized,true,true);
 expect(result.holds).toContain('STOP_REPLY');expect(result.holds).toContain('MAIL_ONLY_SENDING_NOT_RELEASED');
 expect(row.state).toBe('HELD');
});
