import {beforeEach,expect,mock,test} from 'bun:test';
const basis='harsha:sheet-campaign:Sales Call List:Mumbai:2026-10-01';
let authorization=basis,qa='REPLY_VERIFIED',writes=0,row:any,approval:any,stop:any,recovery:any;
mock.module('../f/old_leads_churn/sync_mumbai_candidates',()=>({main:async(dry_run:boolean)=>({unique_emails:1605,dry_run})}));
mock.module('windmill-client',()=>({
  getVariable:async(p:string)=>p.endsWith('sheet_campaign_authorization')?authorization:p.endsWith('crm_handoff_writes_enabled')?'false':'true',
  runScriptByPath:async(p:string,args:any)=>{expect(p.endsWith('sync_mumbai_candidates')).toBe(true);return {unique_emails:1605,dry_run:args.dry_run};},
  datatable:()=> (parts:TemplateStringsArray,...values:any[])=>{
    const q=parts.join('?');return {
      fetch:async()=>{if(q.startsWith('WITH candidates')){writes++;return [{id:80,sender:'harish@beforest.co'}];}return [{id:80,email_normalized:row.email_normalized,sender:row.sender}];},
      fetchOne:async()=>{
        if(q.includes('SELECT status FROM mumbai_nurture_gmail_qa'))return {status:qa};
        if(q.includes('SELECT count(*)::integer n FROM mumbai_nurture_recipients'))return {n:1};
        if(q.includes('SELECT id,email_normalized,person_name'))return row;
        if(q.includes('SELECT count(*)::integer n FROM mumbai_nurture_source_links'))return {n:1};
        if(q.includes('SELECT kind FROM mumbai_nurture_events'))return stop;
        if(q.includes('SELECT reviewed_by,reviewed_email'))return approval;
        if(q.startsWith('WITH target'))return recovery;
        if(q.includes('SELECT status,attempt_count'))return {status:'RESERVED',attempt_count:0,attempted_at:null,mail_message_id:null};
        throw new Error('Unexpected SQL '+q);
      }
    };
  }
}));
const {main:enroll}=await import('../f/old_leads_churn/enroll_mumbai_sheet_campaign.ts');
const {main:admit}=await import('../f/old_leads_churn/admit_mumbai_candidate.ts');
beforeEach(()=>{
 authorization=basis;qa='REPLY_VERIFIED';writes=0;stop=null;recovery=null;
 row={id:80,email_normalized:'fixture@example.invalid',person_name:'Fixture',sender:'harish@beforest.co',
   owner_user_id:'863791000009584001',collective:'Mumbai',state:'READY',stop_reason:null,
   source_version:'mumbai-v1',zoho_lead_id:null,imported_legacy:false,legacy_cohort_size:79};
 approval={reviewed_by:basis,reviewed_email:row.email_normalized,source_version:'mumbai-v1',allow_crm_create:false};
});
test('default campaign preview makes no approval or queue write',async()=>{
 const r=await enroll();expect(r.dry_run).toBe(true);expect(r.eligible).toBe(1);expect(writes).toBe(0);
});
test('missing scope authorization or incomplete reply QA cannot enroll anyone',async()=>{
 authorization='';await expect(enroll(false)).rejects.toThrow('not released');expect(writes).toBe(0);
 authorization=basis;qa='SENT_VERIFIED';await expect(enroll(false)).rejects.toThrow('reply QA');expect(writes).toBe(0);
});
test('released enrollment records a verified campaign snapshot with no email or CRM call',async()=>{
 const r=await enroll(false);expect(r.enrolled).toBe(1);expect(r.read_back).toBe(true);
 expect(r.email_sends).toBe(0);expect(r.crm_writes).toBe(0);expect(r.consent_flags_inferred).toBe(false);
});
test('a scoped Sheet snapshot preflight does not depend on Zoho credentials or per-person review',async()=>{
 const r=await admit(80,true,row.email_normalized,false,false);expect(r.action).toBe('WOULD_ADMIT');
 expect(r.admission_mode).toBe('gmail');expect(writes).toBe(0);
});
test('reply stop, owner change, address change and revoked authorization all stop preflight',async()=>{
 stop={kind:'REPLY'};expect((await admit(80,true,row.email_normalized)).action).toBe('HOLD');
 stop=null;row.owner_user_id='wrong';expect((await admit(80,true,row.email_normalized)).action).toBe('HOLD');
 row.owner_user_id='863791000009584001';approval.reviewed_email='wrong@example.invalid';expect((await admit(80,true,row.email_normalized)).action).toBe('HOLD');
 approval.reviewed_email=row.email_normalized;authorization='';expect((await admit(80,true,row.email_normalized)).action).toBe('HOLD');expect(writes).toBe(0);
});
test('operator recovery fails closed when the database cannot prove an unattempted cancellation',async()=>{
 await expect(enroll(false,277)).rejects.toThrow('No proved unattempted');
 await expect(enroll(false,-1)).rejects.toThrow('Invalid recovery ID');
 recovery={id:80,send_id:277,state:'READY'};
 const r=await enroll(false,277);expect(r.action).toBe('PROVED_PRE_NETWORK_RESERVATION_RESTORED');
 expect(r.email_sends).toBe(0);expect(r.read_back).toBe(true);
});
