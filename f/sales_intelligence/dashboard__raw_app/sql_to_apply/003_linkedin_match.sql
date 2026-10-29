ALTER TABLE sales_readiness_deals ADD COLUMN IF NOT EXISTS linkedin_match jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS sales_readiness_deals_person_id ON sales_readiness_deals(person_id);
