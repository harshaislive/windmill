import * as wmill from 'windmill-client';
import {main as enroll} from './enroll_mumbai_sheet_campaign';
import {main as legacyReview} from './prepare_existing_mumbai_launch';
import {main as mirror} from './mirror_mumbai_tracker';

/** Daily source/admission upkeep. No email sends or automatic CRM handoffs. */
export async function main(dry_run:boolean=true) {
  const sql=wmill.datatable('main');
  if(dry_run) return {dry_run:true,action:'MAINTENANCE_PREVIEW',email_sends:0,crm_writes:0};
  const owner=crypto.randomUUID();
  const lease=await sql`INSERT INTO mumbai_nurture_lane_state(sender,lease_owner,lease_until,last_started_at)
    VALUES('maintenance',${owner},now()+interval '30 minutes',now())
    ON CONFLICT(sender) DO UPDATE SET lease_owner=excluded.lease_owner,lease_until=excluded.lease_until,last_started_at=now()
    WHERE coalesce(mumbai_nurture_lane_state.lease_until,'1970-01-01'::timestamptz)<now() RETURNING sender`.fetchOne();
  if(!lease) return {action:'MAINTENANCE_ALREADY_RUNNING',email_sends:0};
  try {
    if(await wmill.getVariable('f/old_leads_churn/crm_handoff_writes_enabled')!=='false')
      throw new Error('Manual Zoho review policy changed');
    const source=await enroll(false);
    await sql`UPDATE mumbai_nurture_lane_state SET source_checked_at=now()
      WHERE sender='maintenance' AND lease_owner=${owner}`.execute();
    let legacy:any=null;
    if(await wmill.getVariable('f/old_leads_churn/legacy_continuation_authorized')==='true')
      legacy=await legacyReview(true,10);
    const tracker=await mirror(false);
    const result={action:'SOURCE_AND_TRACKER_REFRESHED',source,legacy,tracker,email_sends:0,crm_writes:0};
    await sql`UPDATE mumbai_nurture_lane_state SET last_result=${JSON.stringify({action:result.action})}::jsonb,
      last_finished_at=now() WHERE sender='maintenance' AND lease_owner=${owner}`.execute();
    return result;
  } finally {
    await sql`UPDATE mumbai_nurture_lane_state SET lease_until=now(),lease_owner=NULL
      WHERE sender='maintenance' AND lease_owner=${owner}`.execute();
  }
}
