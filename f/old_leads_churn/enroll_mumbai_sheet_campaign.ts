import {main as syncSource} from './sync_mumbai_candidates';
import * as wmill from 'windmill-client';

const ROOT='f/old_leads_churn';
const BASIS='harsha:sheet-campaign:Sales Call List:Mumbai:2026-10-01';
const SHEET='1LojS6cGdt8JJl0NbOONwG7wf9OXjWL4qfezbYT8sL7w';

/** Enroll the user-authorized Mumbai Sheet audience. No email or Zoho calls. */
export async function main(dry_run:boolean=true,resume_unattempted_send_id:number=0) {
  if(!Number.isSafeInteger(resume_unattempted_send_id)||resume_unattempted_send_id<0) throw new Error('Invalid recovery ID');
  const sql=wmill.datatable('main');
  const source=await syncSource(dry_run);
  const candidates=await sql`SELECT r.id,r.email_normalized,r.sender FROM mumbai_nurture_recipients r
    WHERE r.collective='Mumbai' AND r.zoho_lead_id IS NULL AND r.state='HELD'
      AND r.next_step=1 AND r.last_verified_send_at IS NULL AND length(trim(coalesce(r.person_name,'')))>0
      AND r.stop_reason='PENDING_CRM_IDENTITY_AND_SUPPRESSION_CHECKS'
      AND EXISTS(SELECT 1 FROM mumbai_nurture_source_links l WHERE l.recipient_id=r.id
        AND l.spreadsheet_id=${SHEET} AND l.sheet_name='Sales Call List' AND l.source_present AND l.batch_id IS NULL)
      AND NOT EXISTS(SELECT 1 FROM mumbai_nurture_events e WHERE e.recipient_id=r.id)
      AND NOT EXISTS(SELECT 1 FROM mumbai_nurture_sends s WHERE s.recipient_id=r.id)
    ORDER BY r.id`.fetch();
  if(dry_run) return {dry_run:true,source,campaign_basis:BASIS,eligible:candidates.length,
    email_sends:0,crm_writes:0,queue_writes:0};
  if(await wmill.getVariable(`${ROOT}/sheet_campaign_authorization`)!==BASIS||
    await wmill.getVariable(`${ROOT}/non_crm_sending_enabled`)!=='true'||
    await wmill.getVariable(`${ROOT}/crm_handoff_writes_enabled`)!=='false')
    throw new Error('Full Sheet campaign is not released for manual CRM review');
  const qa=await sql`SELECT status FROM mumbai_nurture_gmail_qa
    WHERE qa_key='mumbai-gmail-community-harsha-20260930-01'`.fetchOne();
  if(qa?.status!=='REPLY_VERIFIED') throw new Error('Gmail send and reply QA must be verified');
  if(resume_unattempted_send_id) {
    // Operator-only repair of a proved pre-network cancellation. Reuse its
    // original reservation and capacity; never revive an attempted/uncertain send.
    const repaired=await sql`WITH target AS (
      SELECT s.id,s.recipient_id FROM mumbai_nurture_sends s JOIN mumbai_nurture_recipients r ON r.id=s.recipient_id
      JOIN mumbai_nurture_admission_approvals a ON a.recipient_id=r.id
      WHERE s.id=${resume_unattempted_send_id} AND s.status='CANCELLED' AND s.attempt_count=0
        AND s.attempted_at IS NULL AND s.mail_message_id IS NULL AND s.transport='gmail_smtp'
        AND (s.reserved_at AT TIME ZONE 'Asia/Kolkata')::date=(now() AT TIME ZONE 'Asia/Kolkata')::date
        AND r.state='HELD' AND r.stop_reason='SEND_PREFLIGHT_REVIEW' AND r.admission_mode='gmail'
        AND r.zoho_lead_id IS NULL AND r.collective='Mumbai' AND r.next_step=s.step
        AND r.email_normalized=s.recipient_email AND r.sender=s.sender AND r.source_version=s.sequence_version
        AND a.reviewed_by=${BASIS} AND a.reviewed_email=r.email_normalized AND a.source_version=r.source_version AND NOT a.allow_crm_create
        AND EXISTS(SELECT 1 FROM mumbai_nurture_source_links l WHERE l.recipient_id=r.id AND l.source_present)
        AND NOT EXISTS(SELECT 1 FROM mumbai_nurture_events e WHERE e.recipient_id=r.id)
      FOR UPDATE OF s,r
    ), repaired AS (
      UPDATE mumbai_nurture_sends SET status='RESERVED' WHERE id IN(SELECT id FROM target) RETURNING id,recipient_id
    ) UPDATE mumbai_nurture_recipients r SET state='READY',stop_reason=NULL,next_due_at=now(),updated_at=now()
      FROM repaired s WHERE r.id=s.recipient_id RETURNING r.id,s.id send_id,r.state`.fetchOne();
    if(!repaired||Number(repaired.send_id)!==resume_unattempted_send_id) throw new Error('No proved unattempted cancellation to recover');
    const proof=await sql`SELECT status,attempt_count,attempted_at,mail_message_id FROM mumbai_nurture_sends WHERE id=${resume_unattempted_send_id}`.fetchOne();
    if(proof?.status!=='RESERVED'||Number(proof.attempt_count)!==0||proof.attempted_at||proof.mail_message_id) throw new Error('Recovery readback failed');
    return {dry_run:false,action:'PROVED_PRE_NETWORK_RESERVATION_RESTORED',...repaired,read_back:true,email_sends:0,crm_writes:0};
  }
  const enrolled=await sql`WITH candidates AS (
    SELECT r.* FROM mumbai_nurture_recipients r
    WHERE r.collective='Mumbai' AND r.zoho_lead_id IS NULL AND r.state='HELD'
      AND r.next_step=1 AND r.last_verified_send_at IS NULL AND length(trim(coalesce(r.person_name,'')))>0
      AND r.stop_reason='PENDING_CRM_IDENTITY_AND_SUPPRESSION_CHECKS'
      AND EXISTS(SELECT 1 FROM mumbai_nurture_source_links l WHERE l.recipient_id=r.id
        AND l.spreadsheet_id=${SHEET} AND l.sheet_name='Sales Call List' AND l.source_present AND l.batch_id IS NULL)
      AND NOT EXISTS(SELECT 1 FROM mumbai_nurture_events e WHERE e.recipient_id=r.id)
      AND NOT EXISTS(SELECT 1 FROM mumbai_nurture_sends s WHERE s.recipient_id=r.id)
      AND r.owner_user_id=CASE WHEN r.sender IN('sai@beforest.co','community@beforest.co') THEN '863791000000520050'
        WHEN r.sender='harish@beforest.co' THEN '863791000009584001'
        WHEN r.sender='yogesh@beforest.co' THEN '863791000008149001' END
    FOR UPDATE OF r
  ), approvals AS (
    INSERT INTO mumbai_nurture_admission_approvals
      (recipient_id,reviewed_email,source_version,consent_confirmed,active_sales_clear,allow_crm_create,reviewed_by)
    SELECT id,email_normalized,source_version,false,false,false,${BASIS} FROM candidates
    ON CONFLICT(recipient_id) DO UPDATE SET reviewed_email=excluded.reviewed_email,
      source_version=excluded.source_version,reviewed_at=now()
      WHERE mumbai_nurture_admission_approvals.reviewed_by=${BASIS}
    RETURNING recipient_id,reviewed_email,source_version
  ) UPDATE mumbai_nurture_recipients r SET admission_mode='gmail',state='READY',stop_reason=NULL,
      next_due_at=now(),updated_at=now()
    FROM approvals a,candidates c WHERE r.id=a.recipient_id AND r.id=c.id
      AND r.email_normalized=a.reviewed_email AND r.source_version=a.source_version
    RETURNING r.id,r.sender,r.email_normalized`.fetch();
  const proof=await sql`SELECT count(*)::integer n FROM mumbai_nurture_recipients r
    JOIN mumbai_nurture_admission_approvals a ON a.recipient_id=r.id
    WHERE a.reviewed_by=${BASIS} AND a.reviewed_email=r.email_normalized AND a.source_version=r.source_version
      AND r.admission_mode='gmail' AND r.zoho_lead_id IS NULL AND NOT a.allow_crm_create`.fetchOne();
  if(Number(proof.n)<enrolled.length) throw new Error('Campaign enrollment readback failed');
  return {dry_run:false,source,campaign_basis:BASIS,enrolled:enrolled.length,
    authorized_mail_recipients:Number(proof.n),read_back:true,email_sends:0,crm_writes:0,
    per_person_manual_review_required:false,consent_flags_inferred:false,
    enrolled_ids:enrolled.map((r:any)=>Number(r.id))};
}
