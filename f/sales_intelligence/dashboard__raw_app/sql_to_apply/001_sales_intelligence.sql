CREATE TABLE IF NOT EXISTS sales_intelligence_groups (
 group_key text PRIMARY KEY, pipeline_id integer NOT NULL,
 name text NOT NULL, owner_name text NOT NULL, status text NOT NULL,
 band text NOT NULL DEFAULT 'unscored', body jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sales_intelligence_cohort ON sales_intelligence_groups(pipeline_id,status,band);
CREATE TABLE IF NOT EXISTS sales_intelligence_health (
 id text PRIMARY KEY, body jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
