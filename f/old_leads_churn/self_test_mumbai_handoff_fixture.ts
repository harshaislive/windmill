import * as wmill from 'windmill-client';

const EMAIL = 'nurture-handoff-test@example.invalid';
const EVENT = 'test-reply:mumbai-handoff-fixture';

/** Synthetic no-send fixture. Always clean up after the handoff dry run. */
export async function main(action: 'setup' | 'cleanup') {
  if (await wmill.getVariable('f/old_leads_churn/delivery_enabled') !== 'false')
    throw new Error('Fixture requires delivery disabled');
  const sql = wmill.datatable('main');
  if (action === 'cleanup') {
    await sql`DELETE FROM mumbai_nurture_handoffs WHERE event_key=${EVENT}`.execute();
    await sql`DELETE FROM mumbai_nurture_events WHERE event_key=${EVENT}`.execute();
    await sql`DELETE FROM mumbai_nurture_recipients WHERE email_normalized=${EMAIL}`.execute();
    const left = await sql`SELECT id FROM mumbai_nurture_recipients WHERE email_normalized=${EMAIL}`.fetchOne();
    if (left) throw new Error('Fixture cleanup failed');
    return {action,cleaned:true};
  }
  if (action !== 'setup') throw new Error('Invalid fixture action');
  const recipient = await sql`INSERT INTO mumbai_nurture_recipients
    (email_normalized,person_name,zoho_lead_id,sender,owner_name,owner_user_id,
      collective,state,stop_reason,source_version)
    VALUES (${EMAIL},'Synthetic test','999999999999999999','sai@beforest.co','Rakesh',
      '863791000000520050','Mumbai','SUPPRESSED','REPLY','test-fixture')
    ON CONFLICT (email_normalized) DO NOTHING RETURNING id`.fetchOne();
  if (!recipient) throw new Error('Fixture already exists; inspect before retry');
  await sql`INSERT INTO mumbai_nurture_events
    (event_key,recipient_id,kind,source,evidence,occurred_at)
    VALUES (${EVENT},${recipient.id},'REPLY','synthetic-test','{}'::jsonb,now())`.execute();
  return {action,event_key:EVENT,recipient_id:recipient.id};
}
