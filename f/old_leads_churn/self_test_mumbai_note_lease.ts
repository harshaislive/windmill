import * as wmill from 'windmill-client';

/** Synthetic DB lease test only. No CRM or email calls. */
export async function main() {
  if(await wmill.getVariable('f/old_leads_churn/delivery_enabled')!=='false')
    throw new Error('Delivery must remain disabled');
  const sql=wmill.datatable('main');
  const tag=crypto.randomUUID().replace(/-/g,'').slice(0,12);
  const eventKey=`note-test:${tag}`;
  let id:number|null=null;
  try {
    const row=await sql`INSERT INTO mumbai_nurture_recipients
      (email_normalized,person_name,sender,owner_name,owner_user_id,
       collective,state,next_step)
      VALUES (${`note-test-${tag}@example.invalid`},'Synthetic Note Test',
        'sai@beforest.co','Sai Rakesh','863791000000520050',
        'Mumbai','SUPPRESSED',1) RETURNING id`.fetchOne();
    id=Number(row.id);
    await sql`INSERT INTO mumbai_nurture_events
      (event_key,recipient_id,kind,source,evidence,occurred_at)
      VALUES (${eventKey},${id},'REPLY','synthetic','{}'::jsonb,now())`.execute();
    const [a,b]=await Promise.all([0,1].map(()=>sql`INSERT INTO mumbai_nurture_notes
      (event_key,recipient_id,status) VALUES (${eventKey},${id},'ATTEMPTING')
      ON CONFLICT (event_key) DO NOTHING RETURNING event_key`.fetchOne()));
    if(Number(Boolean(a))+Number(Boolean(b))!==1)
      throw new Error('Concurrent Note leases did not yield one winner');
    await sql`UPDATE mumbai_nurture_notes SET status='UNCERTAIN'
      WHERE event_key=${eventKey}`.execute();
    const retry=await sql`INSERT INTO mumbai_nurture_notes
      (event_key,recipient_id,status) VALUES (${eventKey},${id},'ATTEMPTING')
      ON CONFLICT (event_key) DO NOTHING RETURNING event_key`.fetchOne();
    if(retry) throw new Error('Uncertain Note lease was retried');
    return {passed:true,synthetic_only:true,one_lease_winner:true,
      uncertain_cannot_retry:true,crm_writes:false,email_sends:false};
  } finally {
    if(id!==null) {
      await sql`DELETE FROM mumbai_nurture_notes WHERE recipient_id=${id}`.execute();
      await sql`DELETE FROM mumbai_nurture_events WHERE recipient_id=${id}`.execute();
      await sql`DELETE FROM mumbai_nurture_recipients WHERE id=${id}`.execute();
    }
  }
}
