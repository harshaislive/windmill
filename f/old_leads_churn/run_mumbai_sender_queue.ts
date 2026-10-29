import * as wmill from 'windmill-client';
import {main as scanBounces} from './scan_mumbai_bounces';
import {main as inspectReply} from './inspect_mumbai_reply_imap';
import {main as sendGmail} from './send_mumbai_gmail_step';
import {main as sendCrm} from './send_mumbai_nurture_step';
import {main as reconcile} from './reconcile_mumbai_crm_send';

const ROOT='f/old_leads_churn';
const SENDERS=['sai@beforest.co','community@beforest.co','harish@beforest.co','yogesh@beforest.co'];
export function pacing(now:number,startDate:string) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new Error('Invalid pacing start date');
  const day=Math.floor((now-Date.parse(startDate+'T00:00:00+05:30'))/86400000);
  if(!Number.isFinite(day)) throw new Error('Invalid pacing clock');
  const ramp=[5,8,12,17,23,25];
  return {day:day+1,new_sender_cap:day<0?0:ramp[Math.min(day,ramp.length-1)],
    global_cap:650,sender_cap:160,rakesh_cap:320,new_global_cap:100};
}

/** Independent one-message lane tick. Every helper executes inline; no queued children. */
export async function main(sender:string,dry_run:boolean=true) {
  if(!SENDERS.includes(sender)) throw new Error('Sender outside fixed Mumbai allowlist');
  const sql=wmill.datatable('main');
  const budget=pacing(Date.now(),await wmill.getVariable(`${ROOT}/sender_queues_start_date`));
  const enabled=await wmill.getVariable(`${ROOT}/sender_queues_enabled`)==='true';
  const fresh=await sql`SELECT source_checked_at,last_result FROM mumbai_nurture_lane_state
    WHERE sender='maintenance' AND source_checked_at>now()-interval '26 hours'`.fetchOne();
  const preview=await sql`SELECT mumbai_nurture_claim_lane_step(now(),
    ${budget.global_cap}::integer,${budget.sender_cap}::integer,${budget.rakesh_cap}::integer,
    ${budget.new_global_cap}::integer,true,ARRAY[${sender}]::text[],${budget.new_sender_cap}::integer,false) result`.fetchOne();
  if(dry_run) return {dry_run:true,sender,enabled,budget,source_fresh:!!fresh,
    claim:preview.result,email_sends:0,crm_writes:0};
  if(!enabled || await wmill.getVariable(`${ROOT}/delivery_enabled`)!=='true') return {sender,action:'QUEUES_PAUSED'};
  if(await wmill.getVariable(`${ROOT}/crm_handoff_writes_enabled`)!=='false') throw new Error('Manual CRM policy changed');
  if(!fresh) throw new Error('Source refresh older than 26 hours; lane held');
  // Before the plan start, only monitor replies/bounces; do not use tomorrow's new-start allowance.
  const leaseOwner=crypto.randomUUID();
  const lease=await sql`INSERT INTO mumbai_nurture_lane_state(sender,lease_owner,lease_until,last_started_at)
    VALUES(${sender},${leaseOwner},now()+interval '10 minutes',now())
    ON CONFLICT(sender) DO UPDATE SET lease_owner=excluded.lease_owner,lease_until=excluded.lease_until,last_started_at=now()
    WHERE coalesce(mumbai_nurture_lane_state.lease_until,'1970-01-01'::timestamptz)<now()
      AND coalesce(mumbai_nurture_lane_state.last_started_at,'1970-01-01'::timestamptz)<now()-interval '150 seconds'
    RETURNING sender`.fetchOne();
  if(!lease) return {sender,action:'LANE_ALREADY_RUNNING_OR_PACED'};
  let output:any={sender,action:'NO_DUE_SEND',budget,email_sends:0};
  try {
    const bounce=await scanBounces(sender,true);
    if(!bounce.safe_to_continue) throw new Error('Bounce scan needs review; this mailbox held');
    const replies=await sql`SELECT r.id FROM mumbai_nurture_recipients r
      LEFT JOIN mumbai_nurture_mail_cursors c ON c.recipient_id=r.id
      WHERE r.sender=${sender} AND r.last_verified_send_at IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM mumbai_nurture_events e WHERE e.recipient_id=r.id AND e.kind IN ('REPLY','OPTOUT','BOUNCE'))
      ORDER BY coalesce(c.updated_at,'1970-01-01'::timestamptz),r.id LIMIT 3`.fetch();
    for(const row of replies) {
      const result=await inspectReply(Number(row.id),true);
      if(result.safe_to_send!==true && result.action!=='REPLY_RECORDED_SUPPRESSED')
        await sql`UPDATE mumbai_nurture_recipients SET state='HELD',stop_reason='INBOUND_REVIEW',
          next_due_at=NULL,updated_at=now() WHERE id=${Number(row.id)} AND state='READY'`.execute();
    }
    const pending=await sql`SELECT s.id,s.transport,q.next_review_at,coalesce(q.manual_quarantine,false) manual_quarantine
      FROM mumbai_nurture_sends s LEFT JOIN mumbai_nurture_attempt_reviews q ON q.send_id=s.id
      WHERE s.sender=${sender} AND s.status IN ('ATTEMPTING','UNCERTAIN') ORDER BY s.id LIMIT 10`.fetch();
    const heldTransports=new Set<string>();
    for(const attempt of pending) {
      let verified=false;
      if(!attempt.next_review_at || Date.parse(attempt.next_review_at)<=Date.now()) {
        try {verified=(await reconcile(Number(attempt.id),false)).status==='VERIFIED_SENT';}catch{}
        await sql`INSERT INTO mumbai_nurture_attempt_reviews(send_id,next_review_at)
          VALUES(${Number(attempt.id)},now()+interval '2 hours') ON CONFLICT(send_id) DO UPDATE
          SET next_review_at=excluded.next_review_at`.execute();
      }
      if(!verified && !attempt.manual_quarantine) heldTransports.add(attempt.transport);
    }
    if(budget.day<1) return output={...output,action:'PLAN_STARTS_TOMORROW_MONITORING_ACTIVE',inbox_scanned:replies.length};
    if(await wmill.getVariable(`${ROOT}/sender_domain_verified`)!=='true')
      return output={...output,action:'DOMAIN_AUTHENTICATION_HOLD',inbox_scanned:replies.length,
        quarantined_send_ids:pending.filter((x:any)=>x.manual_quarantine).map((x:any)=>Number(x.id))};
    // Do not let an unresolved CRM attempt block this mailbox's Gmail prospects.
    // A Gmail ambiguity pauses Gmail in this mailbox; the other mailboxes stay independent.
    const used=await sql`SELECT count(*)::integer n FROM mumbai_nurture_sends WHERE sender=${sender}
      AND step=1 AND (reserved_at AT TIME ZONE 'Asia/Kolkata')::date=(now() AT TIME ZONE 'Asia/Kolkata')::date`.fetchOne();
    // Renew ownership before claiming. A failed/expired lease cannot send.
    const own=await sql`UPDATE mumbai_nurture_lane_state SET lease_until=now()+interval '10 minutes'
      WHERE sender=${sender} AND lease_owner=${leaseOwner} AND lease_until>now() RETURNING sender`.fetchOne();
    if(!own) throw new Error('Sender lease lost before claim');
    // The claim itself checks the transport holds atomically below using one allowed-sender list.
    // Filter blocked transport recipients by wrapping the claim function's explicit parameter.
    const claim=async(firstOnly:boolean)=>sql`SELECT mumbai_nurture_claim_lane_step(now(),
      ${budget.global_cap}::integer,${budget.sender_cap}::integer,${budget.rakesh_cap}::integer,
      ${budget.new_global_cap}::integer,false,ARRAY[${sender}]::text[],${budget.new_sender_cap}::integer,
      ${firstOnly},string_to_array(${[...heldTransports].join(',')},',')) result`.fetchOne();
    let claimed:any=null;
    if(Number(used.n)<budget.new_sender_cap) claimed=(await claim(true)).result;
    if(!claimed?.claimed) claimed=(await claim(false)).result;
    if(!claimed?.claimed) return output={...output,action:heldTransports.size?'TRANSPORT_HELD_OTHER_WORK_CONTINUES':'NO_DUE_SEND',
      held_transports:[...heldTransports],inbox_scanned:replies.length};
    const sendId=Number(claimed.send_id);
    let dispatch:any;
    try {
      dispatch=claimed.zoho_lead_id===null?await sendGmail(sendId,false):await sendCrm(sendId,false);
    } catch {
      const cancelled=await sql`WITH c AS (UPDATE mumbai_nurture_sends SET status='CANCELLED'
        WHERE id=${sendId} AND status='RESERVED' AND attempt_count=0 AND attempted_at IS NULL
        AND mail_message_id IS NULL AND crm_message_id IS NULL RETURNING recipient_id)
        UPDATE mumbai_nurture_recipients SET state='HELD',stop_reason='SEND_PREFLIGHT_REVIEW',
        next_due_at=NULL,updated_at=now() WHERE id IN(SELECT recipient_id FROM c) AND state='READY' RETURNING id`.fetchOne();
      if(cancelled) return output={...output,send_id:sendId,action:'PRE_NETWORK_HOLD_NO_RETRY',status:'CANCELLED'};
      dispatch={status:'UNCERTAIN'};
    }
    let verified:any;
    try {verified=await reconcile(sendId,false);}catch{verified={status:'UNCERTAIN'};}
    const journal=await sql`SELECT status,transport,mail_message_id,crm_message_id FROM mumbai_nurture_sends WHERE id=${sendId}`.fetchOne();
    const exact=verified.status==='VERIFIED_SENT' && journal?.status==='VERIFIED_SENT' &&
      !!(journal.transport==='gmail_smtp'?journal.mail_message_id:journal.crm_message_id);
    return output={...output,send_id:sendId,action:exact?'EXACT_SEND_VERIFIED':'UNCERTAIN_NO_RETRY',
      status:exact?'VERIFIED_SENT':'UNCERTAIN',transport:journal?.transport,
      dispatch_status:dispatch?.status,held_transports:[...heldTransports],inbox_scanned:replies.length};
  } finally {
    await sql`UPDATE mumbai_nurture_lane_state SET lease_owner=NULL,lease_until=now(),last_finished_at=now(),
      last_result=${JSON.stringify(output)}::jsonb WHERE sender=${sender} AND lease_owner=${leaseOwner}`.execute();
  }
}
