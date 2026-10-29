-- Isolated honey campaign tables in datatable://main (dashboard_metrics).
-- No existing tables, secrets, schedules or workflows are modified.
CREATE TABLE IF NOT EXISTS public.bewild_honey_submissions (
 id uuid PRIMARY KEY,
 campaign text NOT NULL CHECK (campaign = 'coffee_blossom_honey_202609'),
 request_id uuid NOT NULL UNIQUE,
 name text NOT NULL,
 phone text NOT NULL CHECK (phone ~ '^\+[1-9][0-9]{7,14}$'),
 whatsapp_consent boolean NOT NULL CHECK (whatsapp_consent),
 consent_version text NOT NULL,
 consent_text text NOT NULL,
 copy_variant text NOT NULL CHECK (copy_variant IN ('landscape_return','honey_unplanned')),
 source_page text NOT NULL,
 origin text NOT NULL,
 template_name text NOT NULL,
 status text NOT NULL CHECK (status IN ('claimed','sending','provider_accepted','provider_rejected','send_unknown','blocked_template','blocked_quota','blocked_configuration')),
 created_at timestamptz NOT NULL DEFAULT now(),
 consent_recorded_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 send_started_at timestamptz,
 provider_accepted_at timestamptz,
 template_checked_at timestamptz,
 interakt_message_id text,
 sanitized_error text,
 UNIQUE(campaign,phone)
);
CREATE TABLE IF NOT EXISTS public.bewild_honey_requests (
 request_id uuid PRIMARY KEY,
 submission_id uuid NOT NULL REFERENCES public.bewild_honey_submissions(id),
 fingerprint text NOT NULL,
 name text NOT NULL,
 phone text NOT NULL,
 whatsapp_consent boolean NOT NULL CHECK (whatsapp_consent),
 consent_version text NOT NULL,
 copy_variant text NOT NULL,
 source_page text NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.bewild_honey_challenges (
 id uuid PRIMARY KEY,
 challenge text NOT NULL,
 fingerprint text NOT NULL,
 issued_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now() + interval '5 minutes',
 used_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.bewild_honey_limits (
 bucket text PRIMARY KEY,
 hits integer NOT NULL,
 expires_at timestamptz NOT NULL
);
CREATE OR REPLACE FUNCTION public.bewild_honey_take_limit(p_bucket text,p_max integer,p_expiry timestamptz)
RETURNS boolean LANGUAGE plpgsql AS $fn$
DECLARE v_hits integer;
BEGIN
 INSERT INTO public.bewild_honey_limits(bucket,hits,expires_at) VALUES(p_bucket,1,p_expiry)
 ON CONFLICT(bucket) DO UPDATE SET hits=bewild_honey_limits.hits+1
 WHERE bewild_honey_limits.hits<p_max RETURNING hits INTO v_hits;
 RETURN v_hits IS NOT NULL;
END $fn$;
CREATE OR REPLACE FUNCTION public.bewild_honey_claim(p jsonb, p_fingerprint text, p_challenge uuid, p_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $fn$
DECLARE r public.bewild_honey_requests%ROWTYPE; s public.bewild_honey_submissions%ROWTYPE; used_id uuid; is_new boolean:=false;
BEGIN
 -- Stable lock order: request, then phone. Locks end at statement transaction end.
 PERFORM pg_advisory_xact_lock(hashtextextended('honey:request:'||(p->>'request_id'),0));
 SELECT * INTO r FROM public.bewild_honey_requests WHERE request_id=(p->>'request_id')::uuid;
 IF FOUND THEN
  IF r.fingerprint<>p_fingerprint THEN RETURN jsonb_build_object('outcome','conflict'); END IF;
  SELECT * INTO s FROM public.bewild_honey_submissions WHERE id=r.submission_id;
  RETURN jsonb_build_object('outcome','duplicate','id',s.id,'status',s.status);
 END IF;
 UPDATE public.bewild_honey_challenges SET used_at=now()
 WHERE id=p_challenge AND fingerprint=p_fingerprint AND used_at IS NULL
 AND issued_at<=now()-interval '2 seconds' AND expires_at>now() RETURNING id INTO used_id;
 IF used_id IS NULL THEN RETURN jsonb_build_object('outcome','invalid_challenge'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('honey:phone:'||(p->>'phone'),0));
 SELECT * INTO s FROM public.bewild_honey_submissions
 WHERE campaign='coffee_blossom_honey_202609' AND phone=p->>'phone';
 IF NOT FOUND THEN
  INSERT INTO public.bewild_honey_submissions(id,campaign,request_id,name,phone,whatsapp_consent,consent_version,consent_text,copy_variant,source_page,origin,template_name,status)
  VALUES(p_id,'coffee_blossom_honey_202609',(p->>'request_id')::uuid,p->>'name',p->>'phone',true,p->>'consent_version',p->>'consent_text',p->>'copy_variant',p->>'source_page',p->>'origin',p->>'template_name','claimed') RETURNING * INTO s;
  is_new:=true;
 END IF;
 INSERT INTO public.bewild_honey_requests(request_id,submission_id,fingerprint,name,phone,whatsapp_consent,consent_version,copy_variant,source_page)
 VALUES((p->>'request_id')::uuid,s.id,p_fingerprint,p->>'name',p->>'phone',true,p->>'consent_version',p->>'copy_variant',p->>'source_page');
 RETURN jsonb_build_object('outcome',CASE WHEN is_new THEN 'claimed' ELSE 'duplicate' END,'id',s.id,'status',s.status);
END $fn$;
