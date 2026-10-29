import * as wmill from 'windmill-client';

/** Uses synthetic .invalid recipients in year 2099; cleans them before returning. Never calls CRM or Send Mail. */
export async function main() {
  if (await wmill.getVariable('f/old_leads_churn/delivery_enabled') !== 'false')
    throw new Error('Claim self-test requires delivery disabled');
  const sql = wmill.datatable('main');
  const tag = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const addressA = `mumbai-claim-a-${tag}@example.invalid`;
  const addressB = `mumbai-claim-b-${tag}@example.invalid`;
  const at = '2099-01-01T12:00:00.000Z';
  const earlier = '2098-12-31T12:00:00.000Z';
  const before48 = '2099-01-02T11:59:59.000Z';
  const at48 = '2099-01-02T12:00:00.000Z';
  const raceAt = '2099-01-03T12:00:00.000Z';
  const existingCapacity = await sql`SELECT count(*)::integer n FROM mumbai_nurture_daily_capacity
    WHERE local_day IN ('2099-01-01'::date,'2099-01-02'::date,'2099-01-03'::date)`.fetchOne();
  if (existingCapacity.n !== 0) throw new Error('Future test dates already have capacity state');
  let idA: number | null = null, idB: number | null = null, idC: number | null = null;
  try {
    const a = await sql`INSERT INTO mumbai_nurture_recipients
      (email_normalized,person_name,zoho_lead_id,sender,owner_name,owner_user_id,
       collective,state,next_step,next_due_at,source_version)
      VALUES (${addressA},'Synthetic claim A',${`TEST-${tag}-A`},'sai@beforest.co',
        'Sai Rakesh','863791000000520050','Mumbai','READY',1,${at}::timestamptz,'mumbai-test')
      RETURNING id`.fetchOne();
    idA = Number(a.id);
    const b = await sql`INSERT INTO mumbai_nurture_recipients
      (email_normalized,person_name,zoho_lead_id,sender,owner_name,owner_user_id,
       collective,state,next_step,next_due_at,source_version)
      VALUES (${addressB},'Synthetic claim B',${`TEST-${tag}-B`},'community@beforest.co',
        'Sai Rakesh','863791000000520050','Mumbai','READY',1,${at}::timestamptz,'mumbai-test')
      RETURNING id`.fetchOne();
    idB = Number(b.id);
    const [first, second] = await Promise.all([
      sql`SELECT mumbai_nurture_claim_step(${at}::timestamptz,2,1,1,2,false) result`.fetchOne(),
      sql`SELECT mumbai_nurture_claim_step(${at}::timestamptz,2,1,1,2,false) result`.fetchOne(),
    ]);
    const outcomes = [first.result, second.result];
    if (outcomes.filter((x) => x.claimed).length !== 1) throw new Error('Concurrent claims did not yield exactly one reservation');
    const claimed = outcomes.find((x) => x.claimed)!;
    const unclaimed = outcomes.find((x) => !x.claimed)!;
    if (unclaimed.reason !== 'NO_DUE_RECIPIENT_WITH_AVAILABLE_CAPACITY')
      throw new Error('Combined Rakesh API-user cap failed');
    const sends = await sql`SELECT recipient_id,status,step FROM mumbai_nurture_sends
      WHERE recipient_id IN (${idA},${idB})`.fetch();
    const capacity = await sql`SELECT scope,reserved_count FROM mumbai_nurture_daily_capacity
      WHERE local_day='2099-01-01'::date ORDER BY scope`.fetch();
    if (sends.length !== 1 || sends[0].status !== 'RESERVED' ||
        capacity.length !== 4 || capacity.some((x: any) => Number(x.reserved_count) !== 1))
      throw new Error('Reservation or atomic capacity mismatch');
    const c = await sql`INSERT INTO mumbai_nurture_recipients
      (email_normalized,person_name,zoho_lead_id,sender,owner_name,owner_user_id,
       collective,state,next_step,next_due_at,source_version)
      VALUES (${`mumbai-claim-c-${tag}@example.invalid`},'Synthetic claim C',${`TEST-${tag}-C`},
        'yogesh@beforest.co','Yogesh Suresh','863791000008149001',
        'Mumbai','READY',1,${at}::timestamptz,'mumbai-test') RETURNING id`.fetchOne();
    idC = Number(c.id);
    const blockedLanes = await sql`SELECT mumbai_nurture_claim_step(
      ${at}::timestamptz,2,1,1,2,true,ARRAY[]::text[]) result`.fetchOne();
    const cleanLane = await sql`SELECT mumbai_nurture_claim_step(
      ${at}::timestamptz,2,1,1,2,true,ARRAY['yogesh@beforest.co']::text[]) result`.fetchOne();
    if (blockedLanes.result.reason !== 'NO_DUE_RECIPIENT_WITH_AVAILABLE_CAPACITY' ||
        cleanLane.result.reason !== 'DRY_RUN_ELIGIBLE' ||
        cleanLane.result.sender !== 'yogesh@beforest.co')
      throw new Error('Bounce lane allowlist failed');
    const otherLane = await sql`SELECT mumbai_nurture_claim_step(${at}::timestamptz,2,1,1,2,false) result`.fetchOne();
    if (!otherLane.result.claimed || otherLane.result.sender !== 'yogesh@beforest.co')
      throw new Error('Full Rakesh cap starved Yogesh lane');
    const claimedId = Number(claimed.recipient_id);
    const otherId = claimedId === idA ? idB : idA;
    await sql`UPDATE mumbai_nurture_recipients SET state='HELD' WHERE id=${otherId}`.execute();
    await sql`UPDATE mumbai_nurture_sends SET status='UNCERTAIN',attempt_count=1
      WHERE recipient_id=${claimedId} AND step=1`.execute();
    const uncertain = await sql`SELECT mumbai_nurture_claim_step(${at}::timestamptz,10,10,10,10,true) result`.fetchOne();
    if (uncertain.result.claimed || uncertain.result.reason !== 'NO_DUE_RECIPIENT_WITH_AVAILABLE_CAPACITY')
      throw new Error('Uncertain step became retryable');
    await sql`UPDATE mumbai_nurture_sends SET status='VERIFIED_SENT',verified_at=${earlier}::timestamptz
      WHERE recipient_id=${claimedId} AND step=1`.execute();
    await sql`UPDATE mumbai_nurture_recipients SET next_step=2,
      last_verified_send_at=${earlier}::timestamptz,next_due_at=${at48}::timestamptz
      WHERE id=${claimedId}`.execute();
    const tooEarly = await sql`SELECT mumbai_nurture_claim_step(${before48}::timestamptz,10,10,10,10,true) result`.fetchOne();
    const due = await sql`SELECT mumbai_nurture_claim_step(${at48}::timestamptz,10,10,10,10,true) result`.fetchOne();
    if (tooEarly.result.reason !== 'NO_DUE_RECIPIENT_WITH_AVAILABLE_CAPACITY' || due.result.reason !== 'DRY_RUN_ELIGIBLE' ||
        Number(due.result.step) !== 2)
      throw new Error('48-hour minimum failed');
    const eventArgs = { recipient_id: claimedId, kind: 'OPTOUT',
      event_key: `selftest:optout:${tag}`, source: 'synthetic_self_test',
      evidence: { synthetic: true }, occurred_at: at48, dry_run: false };
    const suppression = await wmill.runScriptByPath('f/old_leads_churn/record_mumbai_suppression', eventArgs);
    const repeated = await wmill.runScriptByPath('f/old_leads_churn/record_mumbai_suppression', eventArgs);
    const afterStop = await sql`SELECT mumbai_nurture_claim_step(${at48}::timestamptz,10,10,10,10,true) result`.fetchOne();
    if (suppression.result_state !== 'SUPPRESSED' || Number(suppression.event_inserted) !== 1 ||
        Number(repeated.event_inserted) !== 0 || afterStop.result.reason !== 'NO_DUE_RECIPIENT_WITH_AVAILABLE_CAPACITY')
      throw new Error('Suppression or idempotent event replay failed');
    await sql`UPDATE mumbai_nurture_recipients SET state='READY',next_due_at=${raceAt}::timestamptz
      WHERE id=${otherId}`.execute();
    const replyArgs = { recipient_id: otherId, kind: 'REPLY',
      event_key: `selftest:reply:${tag}`, source: 'synthetic_self_test',
      evidence: { synthetic: true }, occurred_at: raceAt, dry_run: false };
    const [, reply] = await Promise.all([
      sql`SELECT mumbai_nurture_claim_step(${raceAt}::timestamptz,10,10,10,10,false) result`.fetchOne(),
      wmill.runScriptByPath('f/old_leads_churn/record_mumbai_suppression', replyArgs),
    ]);
    const raceRecipient = await sql`SELECT state FROM mumbai_nurture_recipients WHERE id=${otherId}`.fetchOne();
    const raceSends = await sql`SELECT status FROM mumbai_nurture_sends WHERE recipient_id=${otherId}`.fetch();
    if (reply.result_state !== 'SUPPRESSED' || !reply.crm_note_required ||
        raceRecipient.state !== 'SUPPRESSED' || raceSends.some((x: any) => x.status === 'VERIFIED_SENT'))
      throw new Error('Reply race did not suppress before any verified send');
    return { passed: true, synthetic_only: true, concurrency_winner_count: 1,
      loser_reason: unclaimed.reason, other_lane_claimed_after_rakesh_cap: true,
      bounce_blocked_lane_excluded_clean_lane_eligible:true,
      reserved_scopes: capacity.map((x: any) => x.scope),
      crash_before_api_remains_reserved: true, uncertain_not_retried: true,
      before_48h_blocked: true, at_48h_due: true,
      optout_suppressed: true, repeat_event_noop: true, reply_race_suppressed: true,
      reply_note_handoff_required: true };
  } finally {
    if (idC !== null) {
      await sql`DELETE FROM mumbai_nurture_events WHERE recipient_id=${idC}`.execute();
      await sql`DELETE FROM mumbai_nurture_sends WHERE recipient_id=${idC}`.execute();
      await sql`DELETE FROM mumbai_nurture_recipients WHERE id=${idC}`.execute();
    }
    if (idA !== null && idB !== null) {
      await sql`DELETE FROM mumbai_nurture_events WHERE recipient_id IN (${idA},${idB})`.execute();
      await sql`DELETE FROM mumbai_nurture_sends WHERE recipient_id IN (${idA},${idB})`.execute();
      await sql`DELETE FROM mumbai_nurture_recipients WHERE id IN (${idA},${idB})`.execute();
      await sql`DELETE FROM mumbai_nurture_daily_capacity
        WHERE local_day IN ('2099-01-01'::date,'2099-01-02'::date,'2099-01-03'::date)`.execute();
    } else if (idA !== null) {
      await sql`DELETE FROM mumbai_nurture_recipients WHERE id=${idA}`.execute();
    }
  }
}
