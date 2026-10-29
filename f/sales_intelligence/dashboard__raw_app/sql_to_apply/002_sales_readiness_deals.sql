CREATE TABLE IF NOT EXISTS sales_readiness_deals (
  deal_id bigint PRIMARY KEY,
  person_id bigint,
  name text NOT NULL,
  title text NOT NULL,
  pipeline_id integer NOT NULL,
  pipeline text NOT NULL,
  owner_id bigint,
  owner_name text,
  status text NOT NULL,
  readiness text NOT NULL,
  reason text,
  email text,
  phone text,
  linkedin_url text,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  initial_assessment jsonb NOT NULL DEFAULT '{}'::jsonb,
  verification jsonb NOT NULL DEFAULT '{}'::jsonb,
  reassessment jsonb NOT NULL DEFAULT '{}'::jsonb,
  verify_status text NOT NULL DEFAULT 'not_checked',
  verify_started_at timestamptz,
  verify_updated_at timestamptz,
  source_updated_at text,
  snapshot_at date NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sales_readiness_deals_filters ON sales_readiness_deals(pipeline_id,status,readiness,owner_name,deal_id);
CREATE INDEX IF NOT EXISTS sales_readiness_deals_verify_status ON sales_readiness_deals(verify_status,deal_id);
