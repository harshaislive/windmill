import * as wmill from 'windmill-client';

/** Records a human-reviewed, exact-address admission approval. Default preview. */
export async function main(recipient_id:number,reviewed_email:string,
  reviewed_by:string,consent_confirmed:boolean,active_sales_clear:boolean,
  allow_crm_create:boolean=false,company_for_new_lead:string='',dry_run:boolean=true) {
  if(!Number.isSafeInteger(recipient_id)||recipient_id<1) throw new Error('Invalid recipient id');
  if(!reviewed_by.trim()||!consent_confirmed||!active_sales_clear)
    throw new Error('Human reviewer, consent and active Sales clearance required');
  const sql=wmill.datatable('main');
  const row=await sql`SELECT id,email_normalized,source_version,state
    FROM mumbai_nurture_recipients WHERE id=${recipient_id}`.fetchOne();
  if(!row||row.state!=='HELD'||row.email_normalized!==reviewed_email.trim().toLowerCase())
    throw new Error('Exact held recipient/email mismatch');
  if(allow_crm_create&&!company_for_new_lead.trim())
    throw new Error('New Lead company value must be explicitly reviewed');
  if(dry_run) return {dry_run:true,recipient_id,reviewed_email:row.email_normalized,
    source_version:row.source_version,action:'WOULD_RECORD_ADMISSION_APPROVAL'};
  const inserted=await sql`INSERT INTO mumbai_nurture_admission_approvals
    (recipient_id,reviewed_email,source_version,consent_confirmed,active_sales_clear,
     allow_crm_create,company_for_new_lead,reviewed_by)
    VALUES (${recipient_id},${row.email_normalized},${row.source_version},true,true,
      ${allow_crm_create},${company_for_new_lead.trim()},${reviewed_by.trim()})
    ON CONFLICT (recipient_id) DO NOTHING RETURNING recipient_id`.fetchOne();
  if(!inserted) throw new Error('Approval already exists; review existing record');
  const check=await sql`SELECT reviewed_email,source_version,consent_confirmed,
    active_sales_clear,allow_crm_create,company_for_new_lead,reviewed_by
    FROM mumbai_nurture_admission_approvals WHERE recipient_id=${recipient_id}`.fetchOne();
  if(!check||check.reviewed_email!==row.email_normalized||
    check.source_version!==row.source_version||!check.consent_confirmed||
    !check.active_sales_clear||check.allow_crm_create!==allow_crm_create)
    throw new Error('Admission approval read-back mismatch');
  return {dry_run:false,recipient_id,action:'APPROVAL_RECORDED',read_back:true};
}
