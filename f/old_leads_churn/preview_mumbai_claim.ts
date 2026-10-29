import * as wmill from 'windmill-client';

/** Capacity-aware queue preview. Never reserves or sends. */
export async function main(at: string = '') {
  if (await wmill.getVariable('f/old_leads_churn/delivery_enabled') !== 'false')
    throw new Error('Queue preview requires delivery disabled');
  const when = at ? new Date(at) : new Date();
  if (Number.isNaN(when.getTime())) throw new Error('Invalid preview time');
  const [global, sender, rakesh, admission] = await Promise.all([
    wmill.getVariable('f/old_leads_churn/pilot_global_daily_cap'),
    wmill.getVariable('f/old_leads_churn/pilot_sender_daily_cap'),
    wmill.getVariable('f/old_leads_churn/pilot_rakesh_api_daily_cap'),
    wmill.getVariable('f/old_leads_churn/pilot_new_admissions_daily_cap'),
  ]);
  const sql = wmill.datatable('main');
  const row = await sql`SELECT mumbai_nurture_claim_step(
    ${when.toISOString()}::timestamptz, ${Number(global)}::integer, ${Number(sender)}::integer,
    ${Number(rakesh)}::integer, ${Number(admission)}::integer, true) AS preview`.fetchOne();
  return { delivery_enabled: false, at: when.toISOString(), ...row.preview };
}
