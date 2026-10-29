import {main as maintain} from './maintain_mumbai_sender_queues';
import * as wmill from 'windmill-client';

const ROOT='f/old_leads_churn';

/** Bounded daily coordinator. New prospects remain outside Zoho; replies await Harsha. */
export async function main(dry_run:boolean=true) {
  let queues='false';try{queues=await wmill.getVariable(`${ROOT}/sender_queues_enabled`);}catch{}
  if(queues==='true') return maintain(dry_run);
  const sql=wmill.datatable('main');
  const delivery=await wmill.getVariable(`${ROOT}/delivery_enabled`);
  if(dry_run) {
    const [source,tracker,queue]=await Promise.all([
      wmill.runScriptByPath(`${ROOT}/sync_mumbai_candidates`,{dry_run:true}),
      wmill.runScriptByPath(`${ROOT}/mirror_mumbai_tracker`,{dry_run:true}),
      sql`SELECT state,count(*)::integer n FROM mumbai_nurture_recipients
        GROUP BY state ORDER BY state`.fetch(),
    ]);
    const pending=await sql`SELECT status,count(*)::integer n FROM mumbai_nurture_sends
      WHERE status IN ('RESERVED','ATTEMPTING','UNCERTAIN') GROUP BY status`.fetch();
    const approved=await sql`SELECT count(*)::integer n FROM mumbai_nurture_admission_approvals a
      JOIN mumbai_nurture_recipients r ON r.id=a.recipient_id
      WHERE r.state='HELD' AND r.source_version=a.source_version
        AND r.email_normalized=a.reviewed_email`.fetchOne();
    return {dry_run:true,action:'NO_SEND',delivery_enabled:delivery,
      source,tracker,queue,pending,approved_pending:Number(approved.n)};
  }
  if(delivery!=='true') throw new Error('Delivery switch closed');
  const gates=await Promise.all(['reply_visibility_verified','email_copy_approved',
    'owner_handoff_verified','offer_claims_verified']
    .map(x=>wmill.getVariable(`${ROOT}/${x}`)));
  if(gates.some(x=>x!=='true')) throw new Error('Release or handoff gate closed');
  const crmHandoff=await wmill.getVariable(`${ROOT}/crm_handoff_writes_enabled`)==='true';
  const source=await wmill.runScriptByPath(`${ROOT}/sync_mumbai_candidates`,{dry_run:false});
  const sheetCampaign=await wmill.getVariable(`${ROOT}/non_crm_sending_enabled`)==='true'
    ? await wmill.runScriptByPath(`${ROOT}/enroll_mumbai_sheet_campaign`,{dry_run:false}) : null;
  const bounce=[];
  const healthySenders:string[]=[];
  for(const sender of ['sai@beforest.co','community@beforest.co',
    'yogesh@beforest.co','harish@beforest.co']) {
    try {
      const result=await wmill.runScriptByPath(`${ROOT}/scan_mumbai_bounces`,
        {sender,record:true});
      bounce.push({sender,action:result.action,
        safe_to_continue:result.safe_to_continue===true});
      if(result.safe_to_continue===true) healthySenders.push(sender);
    } catch {
      bounce.push({sender,action:'HOLD_BOUNCE_SCAN_FAILED',safe_to_continue:false});
    }
  }
  let legacyReview:any=null;
  if(await wmill.getVariable(`${ROOT}/legacy_continuation_authorized`)==='true') {
    try {legacyReview=await wmill.runScriptByPath(`${ROOT}/prepare_existing_mumbai_launch`,{execute:true,limit:10});} catch {legacyReview={action:'LEGACY_REVIEW_HELD_NO_BYPASS'};}
  }
  const approvals=await sql`SELECT a.recipient_id,a.reviewed_email,a.consent_confirmed,
    a.active_sales_clear,a.allow_crm_create,a.company_for_new_lead
    FROM mumbai_nurture_admission_approvals a
    JOIN mumbai_nurture_recipients r ON r.id=a.recipient_id
      WHERE r.state='HELD' AND r.source_version=a.source_version
      AND r.email_normalized=a.reviewed_email
    ORDER BY a.reviewed_at,a.recipient_id LIMIT 20`.fetch();
  const admitted=[];
  for(const a of approvals) { try { admitted.push(await wmill.runScriptByPath(
    `${ROOT}/admit_mumbai_candidate`,{recipient_id:Number(a.recipient_id),dry_run:false,
      reviewed_email:a.reviewed_email,consent_confirmed:a.consent_confirmed,
      active_sales_clear:a.active_sales_clear,allow_crm_create:a.allow_crm_create,
      company_for_new_lead:a.company_for_new_lead})); } catch { admitted.push({recipient_id:Number(a.recipient_id),action:'ADMISSION_HELD_MANUAL_REVIEW'}); } }
  const pending=await sql`SELECT id,status FROM mumbai_nurture_sends
    WHERE status IN ('ATTEMPTING','UNCERTAIN') ORDER BY id LIMIT 51`.fetch();
  if(pending.length>50) throw new Error('Too many uncertain sends for bounded reconciliation');
  // Exactly one readback per attempt. This helper never calls a sender or
  // retries dispatch; only exact remote evidence may advance the local journal.
  const reconcileExact=async(sendId:number)=>{
    try {
      const result=await wmill.runScriptByPath(`${ROOT}/reconcile_mumbai_crm_send`,
        {send_id:sendId,dry_run:false});
      const journal=await sql`SELECT id,status,transport,crm_message_id,mail_message_id
        FROM mumbai_nurture_sends WHERE id=${sendId}`.fetchOne();
      const evidence=journal?.transport==='gmail_smtp'?journal.mail_message_id:journal?.crm_message_id;
      const verified=Number(result?.send_id)===sendId && result?.status==='VERIFIED_SENT' &&
        Number(journal?.id)===sendId && journal?.status==='VERIFIED_SENT' && !!evidence &&
        (!result.crm_message_id||result.crm_message_id===journal.crm_message_id) &&
        (!result.mail_message_id||result.mail_message_id===journal.mail_message_id);
      return {send_id:sendId,status:verified?'VERIFIED_SENT':'UNCERTAIN',
        action:verified?'EXACT_SEND_LOG_VERIFIED':'ATTEMPT_OUTCOME_UNCERTAIN_MANUAL_REVIEW',
        reconciliation_action:result?.action||null,transport:journal?.transport||null,
        crm_message_id:journal?.crm_message_id||null,mail_message_id:journal?.mail_message_id||null};
    } catch {
      return {send_id:sendId,status:'UNCERTAIN',action:'EXACT_SEND_RECONCILIATION_FAILED'};
    }
  };
  let dispatchHalt:string|null=null;
  const reconciled=[];
  for(const row of pending) {
    const result=await reconcileExact(Number(row.id));
    reconciled.push(result);
    if(result.status!=='VERIFIED_SENT') dispatchHalt='PRE_EXISTING_UNRESOLVED_ATTEMPT';
  }
  const due=await sql`SELECT r.id FROM mumbai_nurture_recipients r
    LEFT JOIN mumbai_nurture_mail_cursors c ON c.recipient_id=r.id
    WHERE r.state IN ('READY','COMPLETE','HELD') AND r.last_verified_send_at IS NOT NULL
    ORDER BY coalesce(c.updated_at,'1970-01-01'::timestamptz),r.id LIMIT 250`.fetch();
  const inbox=[];
  for(const row of due) {
    let result:any;
    try { result=await wmill.runScriptByPath(`${ROOT}/inspect_mumbai_reply_imap`,
      {recipient_id:Number(row.id),record:true}); } catch {
      result={action:'INBOUND_CHECK_FAILED',safe_to_send:false};
    }
    inbox.push({recipient_id:Number(row.id),action:result.action});
    if(result.action==='REPLY_RECORDED_SUPPRESSED' && crmHandoff) {
      try { await wmill.runScriptByPath(`${ROOT}/handoff_mumbai_reply`,
        {event_key:result.event_key,dry_run:false});
      await wmill.runScriptByPath(`${ROOT}/handoff_mumbai_reply_task`,
        {event_key:result.event_key,dry_run:false});
      } catch { inbox.push({recipient_id:Number(row.id),action:'REPLY_HANDOFF_PENDING_MANUAL_REVIEW'}); }
    } else if(result.action!=='REPLY_RECORDED_SUPPRESSED' && result.safe_to_send!==true) {
      await sql`UPDATE mumbai_nurture_recipients SET state='HELD',
        stop_reason='INBOUND_REVIEW',next_due_at=NULL,updated_at=now()
        WHERE id=${Number(row.id)} AND state='READY'`.execute();
    }
  }
  const handoffs=crmHandoff?await sql`SELECT e.event_key FROM mumbai_nurture_events e
    LEFT JOIN mumbai_nurture_handoffs h ON h.event_key=e.event_key
    LEFT JOIN mumbai_nurture_notes n ON n.event_key=e.event_key
    WHERE e.kind='REPLY' AND (h.status IS DISTINCT FROM 'VERIFIED'
      OR n.status IS DISTINCT FROM 'VERIFIED')
    ORDER BY e.occurred_at,e.event_key LIMIT 50`.fetch():[];
  for(const h of handoffs) {
    try { await wmill.runScriptByPath(`${ROOT}/handoff_mumbai_reply`,
      {event_key:h.event_key,dry_run:false});
    await wmill.runScriptByPath(`${ROOT}/handoff_mumbai_reply_task`,
      {event_key:h.event_key,dry_run:false});
    } catch { /* Reply stays suppressed; durable outbox retains unresolved handoff. */ }
  }
  const caps=(await Promise.all(['pilot_global_daily_cap','pilot_sender_daily_cap',
    'pilot_rakesh_api_daily_cap','pilot_new_admissions_daily_cap']
    .map(x=>wmill.getVariable(`${ROOT}/${x}`)))).map(Number);
  if(caps.some(x=>!Number.isSafeInteger(x)||x<0)) throw new Error('Invalid daily caps');
  const sends=[];
  for(let i=0;!dispatchHalt && i<caps[0];i++) {
    const claimed=await sql`SELECT mumbai_nurture_claim_step(now(),
      ${caps[0]}::integer,${caps[1]}::integer,${caps[2]}::integer,${caps[3]}::integer,false,
      string_to_array(${healthySenders.join(',')},',')) result`.fetchOne();
    if(!claimed.result.claimed) break;
    const sendId=Number(claimed.result.send_id);
    let dispatch:any;
    try {
      // Call Gmail directly: coordinator -> wrapper -> Gmail -> admission can
      // occupy all three Bun workers while the admission child waits forever.
      const senderPath=claimed.result.zoho_lead_id===null?'send_mumbai_gmail_step':'send_mumbai_nurture_step';
      dispatch=await wmill.runScriptByPath(`${ROOT}/${senderPath}`,
        {send_id:sendId,dry_run:false});
    } catch(error) {
      const cancelled=await sql`WITH c AS (
        UPDATE mumbai_nurture_sends SET status='CANCELLED'
        WHERE id=${sendId} AND status='RESERVED' AND attempt_count=0
        RETURNING recipient_id
      ) UPDATE mumbai_nurture_recipients SET state='HELD',
        stop_reason='SEND_PREFLIGHT_REVIEW',next_due_at=NULL,updated_at=now()
        WHERE id IN (SELECT recipient_id FROM c) AND state='READY'
        RETURNING id`.fetchOne();
      // Reserved capacity stays consumed; never retry or reclaim it automatically.
      if(cancelled) {
        sends.push({send_id:sendId,status:'CANCELLED',
          action:'PRE_NETWORK_HOLD_CAPACITY_CONSERVATIVELY_SPENT'});
        continue;
      }
      dispatch={status:'UNCERTAIN',dispatch_accepted:null};
    }
    const verified=await reconcileExact(sendId);
    sends.push({...verified,dispatch_status:dispatch?.status||null,
      dispatch_accepted:dispatch?.dispatch_accepted??null});
    if(verified.status!=='VERIFIED_SENT') {
      dispatchHalt='POST_DISPATCH_UNRESOLVED_ATTEMPT';
      break;
    }
  }
  const tracker=await wmill.runScriptByPath(`${ROOT}/mirror_mumbai_tracker`,{dry_run:false});
  return {dry_run:false,source,sheetCampaign,bounce,legacyReview,
    admitted_count:admitted.filter(x=>x.action==='ADMITTED_READY').length,
    reconciled_count:reconciled.length,inbox_scanned:inbox.length,
    handoffs_checked:handoffs.length,reply_review_mode:crmHandoff?'crm_handoff':'harsha_manual_review',
    batch_halted:dispatchHalt!==null,halt_reason:dispatchHalt,sends,tracker};
}
