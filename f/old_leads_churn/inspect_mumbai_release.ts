import * as wmill from 'windmill-client';
const ROOT='f/old_leads_churn';
/** Final read-only release evidence. No emails, CRM writes or queue mutations. */
export async function main() {
 const keys=['delivery_enabled','reply_visibility_verified','email_copy_approved','owner_handoff_verified','offer_claims_verified','crm_handoff_writes_enabled','non_crm_sending_enabled','pilot_global_daily_cap','pilot_sender_daily_cap','pilot_rakesh_api_daily_cap','pilot_new_admissions_daily_cap'];
 const values=await Promise.all(keys.map(k=>wmill.getVariable(`${ROOT}/${k}`)));
 const sql=wmill.datatable('main');
 const queue=await sql`SELECT state,count(*)::integer n FROM mumbai_nurture_recipients GROUP BY state ORDER BY state`.fetch();
 const sends=await sql`SELECT status,count(*)::integer n FROM mumbai_nurture_sends GROUP BY status ORDER BY status`.fetch();
 const pendingAttempts=await sql`SELECT s.id,s.recipient_id,s.status,s.attempt_count,s.transport,
   s.mail_message_id,s.attempted_at,s.recipient_email,s.sender,r.state,r.stop_reason
   FROM mumbai_nurture_sends s JOIN mumbai_nurture_recipients r ON r.id=s.recipient_id
   WHERE s.status IN('RESERVED','ATTEMPTING','UNCERTAIN') ORDER BY s.id LIMIT 20`.fetch();
 const campaign=await sql`SELECT count(*)::integer n FROM mumbai_nurture_admission_approvals a
   JOIN mumbai_nurture_recipients r ON r.id=a.recipient_id
   WHERE a.reviewed_by='harsha:sheet-campaign:Sales Call List:Mumbai:2026-10-01'
     AND a.reviewed_email=r.email_normalized AND a.source_version=r.source_version`.fetchOne();
 const internal=await sql`SELECT status,count(*)::integer n FROM mumbai_nurture_internal_tests GROUP BY status`.fetch();
 const replies=await sql`SELECT count(*)::integer n FROM mumbai_nurture_internal_replies`.fetchOne();
 const approvals=await sql`SELECT count(*)::integer n FROM mumbai_nurture_admission_approvals`.fetchOne();
 const mailOnly=await sql`SELECT admission_mode,state,count(*)::integer n FROM mumbai_nurture_recipients
   WHERE zoho_lead_id IS NULL GROUP BY admission_mode,state ORDER BY admission_mode,state`.fetch();
 const mailApprovals=await sql`SELECT count(*)::integer n FROM mumbai_nurture_admission_approvals a
   JOIN mumbai_nurture_recipients r ON r.id=a.recipient_id WHERE r.zoho_lead_id IS NULL
     AND r.state='HELD' AND a.reviewed_email=r.email_normalized AND a.source_version=r.source_version
     AND a.consent_confirmed AND a.active_sales_clear`.fetchOne();
 const replyReview=await sql`SELECT count(*)::integer n FROM mumbai_nurture_events e
   JOIN mumbai_nurture_recipients r ON r.id=e.recipient_id WHERE e.kind='REPLY'
     AND NOT EXISTS(SELECT 1 FROM mumbai_nurture_internal_tests t WHERE t.recipient_email=r.email_normalized)`.fetchOne();
 const functionProof=await sql`SELECT pg_get_functiondef(oid) LIKE '%admission_mode%' AS mail_mode_guard,
   pg_get_functiondef(oid) LIKE '%gmail_smtp%' AS mail_transport,
   pg_get_functiondef(oid) LIKE '%48 hours%' AS gap_guard
   FROM pg_proc WHERE proname='mumbai_nurture_claim_step' AND pronargs=7`.fetchOne();
 const firstLegacy=await sql`SELECT r.id,r.next_step,r.state,r.stop_reason FROM mumbai_nurture_recipients r WHERE r.zoho_lead_id IS NOT NULL AND EXISTS (SELECT 1 FROM mumbai_nurture_source_links l WHERE l.recipient_id=r.id AND l.batch_id IS NOT NULL) ORDER BY r.id LIMIT 5`.fetch();
 return {read_only:true,variables:Object.fromEntries(keys.map((k,i)=>[k,values[i]])),queue,sends,internal_tests:internal,verified_internal_reply_records:replies.n,admission_approvals:approvals.n,legacy_preview_ids:firstLegacy,
   crm_creation_mode:'DEFERRED_UNTIL_HARSHA_REPLY_REVIEW',mail_only_queue:mailOnly,
   reviewed_mail_candidates:Number(mailApprovals.n),genuine_replies_awaiting_review:Number(replyReview.n),
   sheet_campaign_authorized_recipients:Number(campaign.n),pending_attempts:pendingAttempts,
   claim_function:functionProof,email_sends:0,crm_writes:0};
}
