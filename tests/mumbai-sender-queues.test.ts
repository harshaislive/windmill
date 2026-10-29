import {test,expect,mock,beforeEach,setSystemTime,afterEach} from 'bun:test';
import {readFileSync} from 'node:fs';
let calls:string[]=[],pending:any[]=[],fresh=true,domain=true,enabled=true,claim=true;
mock.module('../f/old_leads_churn/scan_mumbai_bounces',()=>({main:async()=>({safe_to_continue:true})}));
mock.module('../f/old_leads_churn/inspect_mumbai_reply_imap',()=>({main:async()=>{calls.push('inbox');return {safe_to_send:true};}}));
mock.module('../f/old_leads_churn/send_mumbai_gmail_step',()=>({main:async()=>{calls.push('send');return {status:'VERIFIED_SENT'};}}));
mock.module('../f/old_leads_churn/send_mumbai_nurture_step',()=>({main:async()=>{throw new Error('No CRM dispatch expected');}}));
mock.module('../f/old_leads_churn/reconcile_mumbai_crm_send',()=>({main:async(id:number)=>{
  calls.push('reconcile:'+id);return {status:id===332?'UNCERTAIN':'VERIFIED_SENT'};
}}));
mock.module('windmill-client',()=>({getVariable:async(k:string)=>k.endsWith('start_date')?'2026-10-06':
  k.endsWith('crm_handoff_writes_enabled')?'false':k.endsWith('sender_domain_verified')?String(domain):
  k.endsWith('sender_queues_enabled')?String(enabled):'true',datatable:()=>
  (str:TemplateStringsArray,...args:any[])=>{
    const text=str.join('?');
    return {fetch:async()=>{
      if(text.includes('manual_quarantine'))return pending;
      if(text.includes('mail_cursors'))return [{id:1}];return [];
    },fetchOne:async()=>{
      if(text.includes('source_checked_at,last_result'))return fresh?{}:null;
      if(text.includes('claim_lane_step')){
        if(/::integer,false,\s*ARRAY/.test(text)){calls.push('claim');expect(args[5]).toBe(5);
          if(pending.some(x=>!x.manual_quarantine))expect(args.at(-1)).toBe('gmail_smtp');
          return {result:claim?{claimed:true,send_id:400,zoho_lead_id:null}:{claimed:false}};
        }
        return {result:{claimed:false,reason:'DRY_RUN_ELIGIBLE'}};
      }
      if(text.includes('count(*)'))return {n:0};
      if(text.includes('SELECT status,transport'))return {status:'VERIFIED_SENT',transport:'gmail_smtp',mail_message_id:'marker'};
      return {sender:'sai@beforest.co'};
    },execute:async()=>{}};
  }}));
const {main:run,pacing}=await import('../f/old_leads_churn/run_mumbai_sender_queue');
beforeEach(()=>{setSystemTime(new Date('2026-10-06T05:00:00Z'));calls=[];pending=[];fresh=true;domain=true;enabled=true;claim=true;});
afterEach(()=>setSystemTime());
test('six-day ramp uses IST date and bounded maximum',()=>{
 const start=Date.parse('2026-10-06T00:00:00+05:30');
 expect(pacing(start-1,'2026-10-06').new_sender_cap).toBe(0);
 expect(Array.from({length:7},(_,i)=>pacing(start+i*86400000,'2026-10-06').new_sender_cap)).toEqual([5,8,12,17,23,25,25]);
});
test('preview never takes lease, sends, scans or reconciles',async()=>{expect((await run('sai@beforest.co')).dry_run).toBe(true);expect(calls).toEqual([]);});
test('domain authentication hold still checks inbox but does not reserve or send',async()=>{
 domain=false;expect((await run('sai@beforest.co',false)).action).toBe('DOMAIN_AUTHENTICATION_HOLD');expect(calls).toEqual(['inbox']);
});
test('stale source prevents sending',async()=>{fresh=false;await expect(run('sai@beforest.co',false)).rejects.toThrow('Source refresh');expect(calls).toEqual([]);});
test('old quarantined CRM uncertainty is not retried and Gmail progresses',async()=>{
 pending=[{id:332,transport:'zoho_crm',manual_quarantine:true}];
 expect((await run('sai@beforest.co',false)).status).toBe('VERIFIED_SENT');
 expect(calls).toEqual(['inbox','reconcile:332','claim','send','reconcile:400']);
});
test('new uncertain Gmail attempt filters only its transport, never resends it',async()=>{
 pending=[{id:332,transport:'gmail_smtp',manual_quarantine:false}];claim=false;
 expect((await run('sai@beforest.co',false)).action).toBe('TRANSPORT_HELD_OTHER_WORK_CONTINUES');expect(calls).not.toContain('send');
});
test('allowlist and delivery switch prevent dispatch',async()=>{
 await expect(run('outsider@beforest.co',false)).rejects.toThrow('allowlist');enabled=false;
 expect((await run('sai@beforest.co',false)).action).toBe('QUEUES_PAUSED');expect(calls).toEqual([]);
});
test('atomic claim retains exclusion, cadence and shared budgets',()=>{
 const src=readFileSync('f/old_leads_churn/initialize_mumbai_sender_queues.ts','utf8');
 for(const guard of ['pg_advisory_xact_lock','FOR UPDATE OF r SKIP LOCKED','48 hours','new_from:',
   'p_blocked_transports','mumbai_nurture_30day_cohort','ON CONFLICT (recipient_id,sequence_version,step)',
   "'REPLY','OPTOUT','BOUNCE','SALES_HANDOFF','COLLECTIVE_CHANGE','ADDRESS_CHANGE','IDENTITY_HOLD'"])
   expect(src).toContain(guard);
});
test('lane dependency graph never occupies workers while waiting for queued children',()=>{
 for(const name of ['run_mumbai_sender_queue','maintain_mumbai_sender_queues','send_mumbai_gmail_step',
 'send_mumbai_nurture_step','reconcile_mumbai_crm_send','reconcile_mumbai_gmail_send','scan_mumbai_bounces',
 'inspect_mumbai_reply_imap','admit_mumbai_candidate','enroll_mumbai_sheet_campaign','prepare_existing_mumbai_launch',
 'sync_mumbai_candidates','record_mumbai_suppression','mirror_mumbai_tracker','record_mumbai_admission_approval'])
   expect(readFileSync(`f/old_leads_churn/${name}.ts`,'utf8')).not.toMatch(/wmill\.run(?:Script|Flow)/);
});
