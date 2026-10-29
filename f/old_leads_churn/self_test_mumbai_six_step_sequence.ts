import * as wmill from 'windmill-client';

const ROOT = 'f/old_leads_churn';
const lanes = [
  {sender:'sai@beforest.co',owner:'863791000000520050'},
  {sender:'community@beforest.co',owner:'863791000000520050'},
  {sender:'yogesh@beforest.co',owner:'863791000008149001'},
  {sender:'harish@beforest.co',owner:'863791000009584001'},
];

/** Synthetic six-step journal test. Uses .invalid addresses and future dates; no CRM/mail calls. */
export async function main() {
  if (await wmill.getVariable(`${ROOT}/delivery_enabled`) !== 'false')
    throw new Error('Six-step test requires delivery disabled');
  const sql = wmill.datatable('main');
  const existing = await sql`SELECT count(*)::integer n FROM mumbai_nurture_daily_capacity
    WHERE local_day BETWEEN '2191-01-01'::date AND '2194-02-01'::date`.fetchOne();
  if (Number(existing.n) !== 0) throw new Error('Future test capacity range already in use');
  const tag = crypto.randomUUID().replace(/-/g,'').slice(0,12);
  const ids: number[] = [];
  const results = [];
  try {
    for (let i=0;i<lanes.length;i++) {
      const lane = lanes[i];
      const start = Date.UTC(2191+i,0,1,0,0,0);
      const email = `mumbai-six-${i}-${tag}@example.invalid`;
      const inserted = await sql`INSERT INTO mumbai_nurture_recipients
        (email_normalized,person_name,zoho_lead_id,sender,owner_name,owner_user_id,
          collective,state,next_step,next_due_at,source_version)
        VALUES (${email},'Synthetic six-step',${`TEST-SIX-${tag}-${i}`},${lane.sender},
          'Synthetic',${lane.owner},'Mumbai','READY',1,${new Date(start).toISOString()}::timestamptz,
          'mumbai-test') RETURNING id`.fetchOne();
      const id = Number(inserted.id); ids.push(id);
      let collectiveHold = false;
      for (let step=1;step<=6;step++) {
        const at = new Date(start+(step-1)*48*3600000).toISOString();
        if (step>1) {
          const before = await sql`SELECT mumbai_nurture_claim_step(
            ${new Date(Date.parse(at)-1000).toISOString()}::timestamptz,40,10,20,5,true) result`.fetchOne();
          if (before.result.reason !== 'NO_DUE_ELIGIBLE_RECIPIENT')
            throw new Error(`Lane ${lane.sender} step ${step} due early`);
          if (step===2) {
            await sql`UPDATE mumbai_nurture_recipients SET collective='Hammiyala'
              WHERE id=${id}`.execute();
            const changed = await sql`SELECT mumbai_nurture_claim_step(
              ${at}::timestamptz,40,10,20,5,true) result`.fetchOne();
            if (changed.result.reason !== 'NO_DUE_ELIGIBLE_RECIPIENT')
              throw new Error('Changed collective became claimable');
            await sql`UPDATE mumbai_nurture_recipients SET collective='Mumbai'
              WHERE id=${id}`.execute();
            collectiveHold = true;
          }
        }
        const claim = await sql`SELECT mumbai_nurture_claim_step(
          ${at}::timestamptz,40,10,20,5,false) result`.fetchOne();
        if (!claim.result.claimed || Number(claim.result.recipient_id)!==id ||
            Number(claim.result.step)!==step || claim.result.sender!==lane.sender)
          throw new Error(`Lane ${lane.sender} step ${step} claim mismatch`);
        const sendId = Number(claim.result.send_id);
        if (step===1) {
          await sql`UPDATE mumbai_nurture_recipients SET collective='Hammiyala'
            WHERE id=${id}`.execute();
          const preview = await wmill.runScriptByPath('f/old_leads_churn/send_mumbai_nurture_step',
            {send_id:sendId,dry_run:true});
          if (!preview.holds?.includes('COLLECTIVE_CHANGED'))
            throw new Error('Send dry run ignored changed collective');
          await sql`UPDATE mumbai_nurture_recipients SET collective='Mumbai'
            WHERE id=${id}`.execute();
        }
        await sql`UPDATE mumbai_nurture_sends SET status='VERIFIED_SENT',
          crm_message_id=${`SYNTHETIC-${tag}-${i}-${step}`},verified_at=${at}::timestamptz
          WHERE id=${sendId} AND status='RESERVED'`.execute();
        await sql`UPDATE mumbai_nurture_recipients SET
          last_verified_send_at=${at}::timestamptz,
          next_step=${step===6 ? null : step+1}::smallint,
          next_due_at=${step===6 ? null : new Date(Date.parse(at)+48*3600000).toISOString()}::timestamptz,
          state=${step===6 ? 'COMPLETE' : 'READY'} WHERE id=${id}`.execute();
      }
      const final = await sql`SELECT r.state,r.next_step,count(s.id)::integer sends,
        count(s.id) FILTER (WHERE s.step BETWEEN 1 AND 3)::integer email01,
        count(s.id) FILTER (WHERE s.step BETWEEN 4 AND 5)::integer email02,
        count(s.id) FILTER (WHERE s.step=6)::integer email03
        FROM mumbai_nurture_recipients r JOIN mumbai_nurture_sends s ON s.recipient_id=r.id
        WHERE r.id=${id} GROUP BY r.id`.fetchOne();
      if (final.state!=='COMPLETE' || final.next_step!==null ||
          Number(final.sends)!==6 || Number(final.email01)!==3 ||
          Number(final.email02)!==2 || Number(final.email03)!==1 || !collectiveHold)
        throw new Error(`Lane ${lane.sender} final sequence mismatch`);
      results.push({sender:lane.sender,owner_user_id:lane.owner,
        email01:3,email02:2,email03:1,minimum_gap_hours:48,
        changed_collective_held:true,complete:true});
    }
    return {passed:true,synthetic_only:true,results};
  } finally {
    for (const id of ids) {
      await sql`DELETE FROM mumbai_nurture_sends WHERE recipient_id=${id}`.execute();
      await sql`DELETE FROM mumbai_nurture_recipients WHERE id=${id}`.execute();
    }
    await sql`DELETE FROM mumbai_nurture_daily_capacity
      WHERE local_day BETWEEN '2191-01-01'::date AND '2194-02-01'::date`.execute();
  }
}
