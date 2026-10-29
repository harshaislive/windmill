import * as wmill from 'windmill-client';

/** Installs a transaction-safe claim function; no claim or send is executed. */
export async function main(dry_run: boolean = true) {
  if (dry_run) return { dry_run: true, function: 'mumbai_nurture_claim_lane_step' };
  const sql = wmill.datatable('main');
  await sql`CREATE TABLE IF NOT EXISTS mumbai_nurture_lane_state(
    sender text PRIMARY KEY,lease_owner text,lease_until timestamptz,
    source_checked_at timestamptz,last_started_at timestamptz,last_finished_at timestamptz,
    last_result jsonb NOT NULL DEFAULT '{}'::jsonb)`.execute();
  await sql`CREATE TABLE IF NOT EXISTS mumbai_nurture_30day_cohort(
    recipient_id bigint PRIMARY KEY REFERENCES mumbai_nurture_recipients(id),
    email text NOT NULL,source_version text NOT NULL,enrolled_at timestamptz NOT NULL DEFAULT now())`.execute();
  await sql`CREATE TABLE IF NOT EXISTS mumbai_nurture_attempt_reviews(
    send_id bigint PRIMARY KEY REFERENCES mumbai_nurture_sends(id),
    manual_quarantine boolean NOT NULL DEFAULT false,next_review_at timestamptz NOT NULL DEFAULT now())`.execute();
  await sql`INSERT INTO mumbai_nurture_attempt_reviews(send_id,manual_quarantine)
    SELECT id,true FROM mumbai_nurture_sends WHERE status IN ('ATTEMPTING','UNCERTAIN')
    ON CONFLICT(send_id) DO NOTHING`.execute();
  // Freeze current eligible audience; future Sheet additions remain in the ordinary queue.
  await sql`INSERT INTO mumbai_nurture_30day_cohort(recipient_id,email,source_version)
    SELECT r.id,r.email_normalized,r.source_version FROM mumbai_nurture_recipients r
    WHERE r.state='READY' AND r.collective='Mumbai'
      AND NOT EXISTS(SELECT 1 FROM mumbai_nurture_30day_cohort)
      AND r.email_normalized NOT LIKE 'harsha+wmqa-%'
      AND NOT EXISTS(SELECT 1 FROM mumbai_nurture_internal_tests t WHERE t.recipient_email=r.email_normalized)
      AND EXISTS(SELECT 1 FROM mumbai_nurture_source_links l WHERE l.recipient_id=r.id AND l.source_present)
    ON CONFLICT(recipient_id) DO NOTHING`.execute();
  // CREATE OR REPLACE is atomic and preserves in-flight reservations. No claim
  // is executed here; mail-only rows need a current saved human approval.
  await sql`CREATE OR REPLACE FUNCTION mumbai_nurture_claim_lane_step(
    p_now timestamptz, p_global_cap integer, p_sender_cap integer,
    p_rakesh_cap integer, p_new_cap integer, p_dry_run boolean DEFAULT true,
    p_allowed_senders text[] DEFAULT ARRAY['sai@beforest.co',
      'community@beforest.co','yogesh@beforest.co','harish@beforest.co']::text[],
    p_new_sender_cap integer DEFAULT 25, p_first_only boolean DEFAULT false,
    p_blocked_transports text[] DEFAULT ARRAY[]::text[]
  ) RETURNS jsonb LANGUAGE plpgsql AS $fn$
  DECLARE
    v_day date;
    v_rec record;
    v_api_scope text;
    v_scopes text[];
    v_caps integer[];
    v_i integer;
    v_used integer;
    v_capacity_full boolean;
    v_send_id bigint;
  BEGIN
    IF p_global_cap < 1 OR p_sender_cap < 1 OR p_rakesh_cap < 1 OR p_new_cap < 0 OR p_new_sender_cap < 0
      THEN RAISE EXCEPTION 'Invalid capacity configuration'; END IF;
    v_day := (p_now AT TIME ZONE 'Asia/Kolkata')::date;
    IF NOT p_dry_run THEN
      PERFORM pg_advisory_xact_lock(hashtext('mumbai_nurture:' || v_day::text));
    END IF;
    FOR v_rec IN SELECT r.* FROM mumbai_nurture_recipients r
      WHERE r.state='READY' AND r.collective='Mumbai'
        AND NOT (CASE WHEN r.zoho_lead_id IS NULL THEN 'gmail_smtp' ELSE 'zoho_crm' END=ANY(p_blocked_transports))
        AND (NOT p_first_only OR r.next_step=1)
        AND EXISTS(SELECT 1 FROM mumbai_nurture_30day_cohort c WHERE c.recipient_id=r.id
          AND c.email=r.email_normalized AND c.source_version=r.source_version)
        AND (r.zoho_lead_id IS NOT NULL OR (r.admission_mode='gmail' AND
          EXISTS(SELECT 1 FROM mumbai_nurture_admission_approvals a WHERE a.recipient_id=r.id
            AND a.reviewed_email=r.email_normalized AND a.source_version=r.source_version
            AND ((a.consent_confirmed AND a.active_sales_clear) OR
              (a.reviewed_by='harsha:sheet-campaign:Sales Call List:Mumbai:2026-10-01' AND NOT a.allow_crm_create)))))
        AND r.sender=ANY(p_allowed_senders)
        AND r.next_step BETWEEN 1 AND 6 AND r.next_due_at <= p_now
        AND (r.last_verified_send_at IS NULL OR r.last_verified_send_at <= p_now - interval '48 hours')
        AND NOT EXISTS (SELECT 1 FROM mumbai_nurture_events e WHERE e.recipient_id=r.id
          AND e.kind IN ('REPLY','OPTOUT','BOUNCE','SALES_HANDOFF','COLLECTIVE_CHANGE','ADDRESS_CHANGE','IDENTITY_HOLD'))
        AND EXISTS(SELECT 1 FROM mumbai_nurture_source_links l WHERE l.recipient_id=r.id AND l.source_present)
        AND NOT EXISTS (SELECT 1 FROM mumbai_nurture_sends s WHERE s.recipient_id=r.id
          AND s.sequence_version=r.source_version AND s.step=r.next_step)
      ORDER BY CASE WHEN r.next_step > 1 THEN 0 ELSE 1 END, r.next_due_at, r.id
      FOR UPDATE OF r SKIP LOCKED LOOP
    v_api_scope := CASE WHEN v_rec.sender IN ('sai@beforest.co','community@beforest.co')
      THEN 'api:rakesh' WHEN v_rec.sender='yogesh@beforest.co'
      THEN 'api:yogesh' ELSE 'api:harish' END;
    v_scopes := ARRAY['global','from:' || v_rec.sender,v_api_scope];
    v_caps := ARRAY[p_global_cap,p_sender_cap,
      CASE WHEN v_api_scope='api:rakesh' THEN p_rakesh_cap ELSE p_sender_cap END];
    IF v_rec.next_step=1 THEN
      v_scopes := array_append(v_scopes,'new_admission');
      v_caps := array_append(v_caps,p_new_cap);
      v_scopes := array_append(v_scopes,'new_from:' || v_rec.sender);
      v_caps := array_append(v_caps,p_new_sender_cap);
    END IF;
    v_capacity_full := false;
    FOR v_i IN 1..array_length(v_scopes,1) LOOP
      SELECT reserved_count INTO v_used FROM mumbai_nurture_daily_capacity
        WHERE local_day=v_day AND scope=v_scopes[v_i];
      IF v_scopes[v_i]='new_from:' || v_rec.sender THEN
        SELECT greatest(coalesce(v_used,0),count(*)::integer) INTO v_used FROM mumbai_nurture_sends s
          WHERE s.sender=v_rec.sender AND s.step=1
            AND (s.reserved_at AT TIME ZONE 'Asia/Kolkata')::date=v_day;
      END IF;
      IF COALESCE(v_used,0) >= v_caps[v_i] THEN
        v_capacity_full := true;
        EXIT;
      END IF;
    END LOOP;
    IF v_capacity_full THEN
      CONTINUE;
    END IF;
    IF p_dry_run THEN RETURN jsonb_build_object('claimed',false,'reason','DRY_RUN_ELIGIBLE',
      'recipient_id',v_rec.id,'step',v_rec.next_step,'sender',v_rec.sender); END IF;
    INSERT INTO mumbai_nurture_sends
      (recipient_id,sequence_version,step,status,recipient_email,sender,reserved_at,transport)
      VALUES (v_rec.id,v_rec.source_version,v_rec.next_step,'RESERVED',
        v_rec.email_normalized,v_rec.sender,p_now,
        CASE WHEN v_rec.zoho_lead_id IS NULL THEN 'gmail_smtp' ELSE 'zoho_crm' END)
      ON CONFLICT (recipient_id,sequence_version,step) DO NOTHING RETURNING id INTO v_send_id;
    IF v_send_id IS NULL THEN
      CONTINUE;
    END IF;
    FOR v_i IN 1..array_length(v_scopes,1) LOOP
      INSERT INTO mumbai_nurture_daily_capacity(local_day,scope,reserved_count)
        VALUES(v_day,v_scopes[v_i],1)
      ON CONFLICT (local_day,scope) DO UPDATE SET
        reserved_count=mumbai_nurture_daily_capacity.reserved_count+1,updated_at=now();
    END LOOP;
    RETURN jsonb_build_object('claimed',true,'send_id',v_send_id,
      'recipient_id',v_rec.id,'step',v_rec.next_step,'sender',v_rec.sender,
      'zoho_lead_id',v_rec.zoho_lead_id);
    END LOOP;
    RETURN jsonb_build_object('claimed',false,'reason','NO_DUE_RECIPIENT_WITH_AVAILABLE_CAPACITY');
  END
  $fn$`.execute();
  const installed = await sql`SELECT proname FROM pg_proc WHERE proname='mumbai_nurture_claim_lane_step'`.fetchOne();
  if (!installed) throw new Error('Claim function read-back failed');
  return { dry_run: false, installed: installed.proname };
}
