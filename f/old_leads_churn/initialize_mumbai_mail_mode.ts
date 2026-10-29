import * as wmill from 'windmill-client';

/** Additive mail evidence only. No recipient admission, CRM calls or mail sends. */
export async function main(dry_run:boolean=true) {
  if(dry_run) return {dry_run:true,recipient_columns:['admission_mode'],
    send_columns:['transport','mail_message_id'],email_sends:0};
  const sql=wmill.datatable('main');
  await sql`ALTER TABLE mumbai_nurture_recipients ADD COLUMN IF NOT EXISTS
    admission_mode text NOT NULL DEFAULT 'crm' CHECK(admission_mode IN ('crm','gmail'))`.execute();
  await sql`ALTER TABLE mumbai_nurture_sends ADD COLUMN IF NOT EXISTS
    transport text NOT NULL DEFAULT 'zoho_crm' CHECK(transport IN ('zoho_crm','gmail_smtp'))`.execute();
  await sql`ALTER TABLE mumbai_nurture_sends ADD COLUMN IF NOT EXISTS mail_message_id text UNIQUE`.execute();
  const check=await sql`SELECT table_name,column_name FROM information_schema.columns
    WHERE table_schema=current_schema() AND ((table_name='mumbai_nurture_recipients'
      AND column_name='admission_mode') OR (table_name='mumbai_nurture_sends'
      AND column_name IN ('transport','mail_message_id'))) ORDER BY table_name,column_name`.fetch();
  if(check.length!==3) throw new Error('Mail mode schema read-back failed');
  return {dry_run:false,read_back:true,columns:check,email_sends:0,crm_writes:0};
}
