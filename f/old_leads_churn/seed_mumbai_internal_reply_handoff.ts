import * as wmill from 'windmill-client';

const KEY='qa:seshu:e01:reply';
const QA='mumbai-internal-e01-20260930-seshu';
const SHADOW='mumbai-internal-qa-seshu-20260930@example.invalid';

/** Builds an isolated suppressed Lead fixture from the actual IMAP reply. */
export async function main(dry_run:boolean=true) {
  const sql=wmill.datatable('main');
  const proof=await sql`SELECT t.recipient_email,t.crm_module,t.crm_record_id,
    t.status send_status,i.imap_uid,i.uid_validity,i.rfc_message_id,i.received_at
    FROM mumbai_nurture_internal_tests t
    JOIN mumbai_nurture_internal_replies i ON i.qa_key=t.qa_key
    WHERE t.qa_key=${QA}`.fetchOne();
  if(!proof||proof.recipient_email!=='seshu@beforest.co'||
    proof.crm_module!=='Leads'||proof.crm_record_id!=='863791000009577032'||
    proof.send_status!=='VERIFIED') throw new Error('Verified Seshu send/reply proof required');
  const existing=await sql`SELECT id,source_version,zoho_lead_id,owner_user_id,state
    FROM mumbai_nurture_recipients WHERE email_normalized=${SHADOW}`.fetchOne();
  if(existing&&existing.source_version!=='mumbai-internal-qa')
    return {dry_run:true,action:'BUSINESS_RECIPIENT_EXISTS_REVIEW_BEFORE_SUPPRESSION',
      recipient_id:Number(existing.id),source_version:existing.source_version,
      lead_id:existing.zoho_lead_id||null,owner_id:existing.owner_user_id,
      state:existing.state};
  if(dry_run) return {dry_run:true,event_key:KEY,
    recipient_email:proof.recipient_email,lead_id:proof.crm_record_id,
    owner_id:'863791000000505021',reply_uid:Number(proof.imap_uid),
    existing_qa_row:!!existing,action:'WOULD_RECORD_VERIFIED_REPLY_STOP'};
  let recipientId=existing?Number(existing.id):null;
  if(recipientId===null) {
    const row=await sql`INSERT INTO mumbai_nurture_recipients
      (email_normalized,person_name,sender,owner_name,owner_user_id,
       collective,state,stop_reason,next_step,source_version)
      VALUES (${SHADOW},'Seshu Internal QA',
        'sai@beforest.co','Existing Seshu Lead owner','863791000000505021',
        'Mumbai','HELD','INTERNAL_QA',1,'mumbai-internal-qa')
      ON CONFLICT (email_normalized) DO NOTHING RETURNING id`.fetchOne();
    if(!row) throw new Error('QA recipient insertion race; manual review');
    recipientId=Number(row.id);
  }
  const evidence={qa_key:QA,uid_validity:proof.uid_validity,
    imap_uid:Number(proof.imap_uid),rfc_message_id:proof.rfc_message_id,
    reply_email:'seshu@beforest.co',crm_lead_id:'863791000009577032',
    crm_owner_id:'863791000000505021'};
  const result=await wmill.runScriptByPath('f/old_leads_churn/record_mumbai_suppression',{
    recipient_id:recipientId,kind:'REPLY',event_key:KEY,source:'imap_internal_test',
    evidence,occurred_at:new Date(proof.received_at).toISOString(),dry_run:false});
  if(result.result_state!=='SUPPRESSED') throw new Error('QA reply suppression failed');
  const check=await sql`SELECT r.state,e.kind,e.source FROM mumbai_nurture_recipients r
    JOIN mumbai_nurture_events e ON e.recipient_id=r.id
    WHERE r.id=${recipientId} AND e.event_key=${KEY}`.fetchOne();
  if(check?.state!=='SUPPRESSED'||check.kind!=='REPLY'||
    check.source!=='imap_internal_test') throw new Error('QA reply stop read-back failed');
  return {dry_run:false,event_key:KEY,recipient_id:recipientId,
    state:'SUPPRESSED',owner_id:'863791000000505021',read_back:true};
}
