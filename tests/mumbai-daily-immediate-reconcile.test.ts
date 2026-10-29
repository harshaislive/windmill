import {beforeEach,expect,mock,test} from 'bun:test';
mock.module('../f/old_leads_churn/maintain_mumbai_sender_queues',()=>({main:async()=>{throw new Error('Legacy fallback unexpectedly entered queue maintenance');}}));

type SendRow={id:number,status:string,transport:string,crm_message_id:string|null,mail_message_id:string|null,attempted:boolean};
let rows:Map<number,SendRow>,trace:string[],claims:number,scenario:string,transport:string,claimQueue:number[],advanced:number,cancelled:number[];
mock.module('windmill-client',()=>({
  getVariable:async(path:string)=>{
    const key=path.split('/').pop();
    if(key==='sender_queues_enabled')return 'false';
    if(key==='crm_handoff_writes_enabled'||key==='non_crm_sending_enabled'||key==='legacy_continuation_authorized')return 'false';
    if(key==='pilot_global_daily_cap')return '40';
    if(key==='pilot_sender_daily_cap')return '10';
    if(key==='pilot_rakesh_api_daily_cap')return '20';
    if(key==='pilot_new_admissions_daily_cap')return '5';
    return 'true';
  },
  datatable:()=> (parts:TemplateStringsArray,...values:any[])=>{
    const query=parts.join('?');
    return {
      fetch:async()=>{
        if(query.includes('SELECT a.recipient_id'))return [];
        if(query.includes('SELECT id,status FROM mumbai_nurture_sends'))return [...rows.values()].filter(x=>x.attempted&&['ATTEMPTING','UNCERTAIN'].includes(x.status));
        if(query.includes('SELECT r.id FROM mumbai_nurture_recipients'))return [];
        throw new Error('Unexpected SQL fetch '+query);
      },
      fetchOne:async()=>{
        if(query.includes('SELECT mumbai_nurture_claim_step')){
          expect(values.slice(0,4)).toEqual([40,10,20,5]);
          expect(values[4]).toBe('sai@beforest.co,community@beforest.co,yogesh@beforest.co,harish@beforest.co');
          claims++;const id=claimQueue.shift();trace.push('claim:'+(id||'none'));
          if(!id)return {result:{claimed:false}};
          rows.set(id,{id,status:'RESERVED',transport,crm_message_id:null,mail_message_id:null,attempted:false});
          return {result:{claimed:true,send_id:id,zoho_lead_id:transport==='gmail_smtp'?null:'fixture-lead'}};
        }
        if(query.includes('SELECT id,status,transport,crm_message_id,mail_message_id')){
          const id=Number(values[0]);trace.push('journal:'+id);return {...rows.get(id)};
        }
        if(query.includes('WITH c AS')){
          const id=Number(values[0]),row=rows.get(id)!;
          if(!row.attempted&&row.status==='RESERVED'){row.status='CANCELLED';cancelled.push(id);return {id:900+id};}
          return null;
        }
        throw new Error('Unexpected SQL fetchOne '+query);
      }
    };
  },
  runScriptByPath:async(path:string,args:any)=>{
    const name=path.split('/').pop();
    if(name==='sync_mumbai_candidates')return {read_back:true};
    if(name==='scan_mumbai_bounces')return {action:'NO_BOUNCES',safe_to_continue:true};
    if(name==='mirror_mumbai_tracker'){trace.push('mirror');return {read_back:true};}
    if(name==='send_mumbai_nurture_step'||name==='send_mumbai_gmail_step'){
      expect(name).toBe(transport==='gmail_smtp'?'send_mumbai_gmail_step':'send_mumbai_nurture_step');
      const id=Number(args.send_id),row=rows.get(id)!;trace.push('dispatch:'+id);
      expect(args.dry_run).toBe(false);
      if(scenario==='preflight'&&id===701)throw new Error('Known before-network guard hold');
      row.status='UNCERTAIN';row.attempted=true;
      if(row.transport==='gmail_smtp')row.mail_message_id='<message-'+id+'@beforest.co>';else row.crm_message_id='message-'+id;
      if(scenario==='sender_timeout')throw new Error('SMTP/API timeout after attempt');
      return {send_id:id,status:'UNCERTAIN',dispatch_accepted:true};
    }
    if(name==='reconcile_mumbai_crm_send'){
      const id=Number(args.send_id),row=rows.get(id)!;trace.push('reconcile:'+id);
      expect(args.dry_run).toBe(false);
      if(scenario==='reconcile_error')throw new Error('Exact remote log unavailable');
      if(scenario==='delayed')return {send_id:id,status:'UNCERTAIN',action:'HOLD_UNCERTAIN_FOR_MANUAL_REVIEW'};
      if(scenario!=='journal_mismatch'&&row.status!=='VERIFIED_SENT'){row.status='VERIFIED_SENT';advanced++;}
      return {send_id:id,status:'VERIFIED_SENT',crm_message_id:row.crm_message_id,mail_message_id:row.mail_message_id};
    }
    throw new Error('Unexpected script or CRM handoff '+name);
  }
}));
const {main}=await import('../f/old_leads_churn/run_mumbai_nurture_daily.ts');
beforeEach(()=>{rows=new Map();trace=[];claims=0;scenario='immediate';transport='zoho_crm';claimQueue=[701,702];advanced=0;cancelled=[];});

test('an immediate exact log and journal readback verify each dispatch before the next claim',async()=>{
  const result=await main(false);
  expect(trace).toEqual(['claim:701','dispatch:701','reconcile:701','journal:701',
    'claim:702','dispatch:702','reconcile:702','journal:702','claim:none','mirror']);
  expect(result.sends.map(x=>x.status)).toEqual(['VERIFIED_SENT','VERIFIED_SENT']);
  expect(result.batch_halted).toBe(false);expect(advanced).toBe(2);
  expect(result.reply_review_mode).toBe('harsha_manual_review');
});
test('a delayed exact log stops the batch, and the next run only reconciles without retrying the sender',async()=>{
  scenario='delayed';const first=await main(false);
  expect(first.batch_halted).toBe(true);expect(first.halt_reason).toBe('POST_DISPATCH_UNRESOLVED_ATTEMPT');
  expect(first.sends[0].status).toBe('UNCERTAIN');expect(claims).toBe(1);expect(advanced).toBe(0);
  expect(trace.filter(x=>x.startsWith('dispatch:'))).toEqual(['dispatch:701']);
  const next=await main(false);
  expect(next.halt_reason).toBe('PRE_EXISTING_UNRESOLVED_ATTEMPT');expect(next.sends).toEqual([]);
  expect(claims).toBe(1);expect(trace.filter(x=>x.startsWith('dispatch:'))).toEqual(['dispatch:701']);
  expect(cancelled).toEqual([]);expect(rows.get(701)?.status).toBe('UNCERTAIN');
});
test('a sender timeout is read back once and can be adopted from the exact log without resending',async()=>{
  scenario='sender_timeout';claimQueue=[701];const result=await main(false);
  expect(result.sends[0].status).toBe('VERIFIED_SENT');expect(result.batch_halted).toBe(false);
  expect(trace.filter(x=>x.startsWith('dispatch:'))).toEqual(['dispatch:701']);
  expect(trace.filter(x=>x.startsWith('reconcile:'))).toEqual(['reconcile:701']);expect(cancelled).toEqual([]);
});
test('a reconciliation error stops after one attempt and still mirrors the held outcome',async()=>{
  scenario='reconcile_error';const result=await main(false);
  expect(result.batch_halted).toBe(true);expect(result.sends[0].action).toBe('EXACT_SEND_RECONCILIATION_FAILED');
  expect(claims).toBe(1);expect(trace.filter(x=>x.startsWith('dispatch:'))).toEqual(['dispatch:701']);
  expect(trace.at(-1)).toBe('mirror');expect(advanced).toBe(0);
});
test('a claimed verified result cannot bypass an uncertain local journal',async()=>{
  scenario='journal_mismatch';const result=await main(false);
  expect(result.batch_halted).toBe(true);expect(result.sends[0].status).toBe('UNCERTAIN');expect(claims).toBe(1);
});
test('a known before-network cancellation preserves capacity and permits the next independent eligible send',async()=>{
  scenario='preflight';const result=await main(false);
  expect(cancelled).toEqual([701]);expect(result.sends[0].status).toBe('CANCELLED');
  expect(result.sends[1].status).toBe('VERIFIED_SENT');expect(result.batch_halted).toBe(false);
  expect(trace.includes('reconcile:701')).toBe(false);expect(advanced).toBe(1);
});
test('the wrapper also verifies exact Gmail journal evidence without changing the closed fresh-send switch',async()=>{
  transport='gmail_smtp';claimQueue=[701];const result=await main(false);
  expect(result.sends[0].transport).toBe('gmail_smtp');expect(result.sends[0].status).toBe('VERIFIED_SENT');
  expect(result.sends[0].mail_message_id).toBe('<message-701@beforest.co>');expect(result.batch_halted).toBe(false);
});
