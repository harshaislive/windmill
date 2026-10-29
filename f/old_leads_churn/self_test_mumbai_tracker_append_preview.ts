import * as wmill from 'windmill-client';

/** Tests new cohort detection without writing to the Sheet or sending. */
export async function main() {
  if(await wmill.getVariable('f/old_leads_churn/delivery_enabled')!=='false')
    throw new Error('Run only while delivery is disabled');
  const sql=wmill.datatable('main');
  const tag=crypto.randomUUID().replace(/-/g,'').slice(0,12);
  const email=`mumbai-tracker-preview-${tag}@example.com`;
  const leadId=`TEST-TRACKER-${tag}`;
  const dealId=`TEST-TRACKER-DEAL-${tag}`;
  let id:number|null=null;
  try {
    const row=await sql`INSERT INTO mumbai_nurture_recipients
      (email_normalized,person_name,zoho_lead_id,sender,owner_name,owner_user_id,
       collective,state,next_step,source_version)
      VALUES (${email},'Synthetic Tracker Preview',${leadId},'yogesh@beforest.co',
        'Yogesh Suresh','863791000008149001','Mumbai','HELD',1,'mumbai-v1')
      RETURNING id`.fetchOne();
    id=Number(row.id);
    await sql`INSERT INTO mumbai_nurture_source_links
      (deal_id,recipient_id,spreadsheet_id,sheet_name,source_present)
      VALUES (${dealId},${id},'synthetic','synthetic',true)`.execute();
    const preview=await wmill.runScriptByPath('f/old_leads_churn/mirror_mumbai_tracker',
      {dry_run:true});
    if(preview.new_rows!==1 || preview.tracker_rows!==79 || preview.changed_rows!==0)
      throw new Error('New tracker cohort preview mismatch');
    return {passed:true,synthetic_only:true,external_sheet_writes:false,
      new_rows_detected:preview.new_rows,original_rows:preview.tracker_rows};
  } finally {
    if(id!==null) {
      await sql`DELETE FROM mumbai_nurture_source_links WHERE recipient_id=${id}`.execute();
      await sql`DELETE FROM mumbai_nurture_recipients WHERE id=${id}`.execute();
    }
  }
}
