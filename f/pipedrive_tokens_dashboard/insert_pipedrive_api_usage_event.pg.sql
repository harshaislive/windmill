-- $1 workflow_path
-- $2 script_path
-- $3 windmill_job_id
-- $4 parent_job_id
-- $5 method
-- $6 raw_endpoint
-- $7 normalized_endpoint
-- $8 endpoint_token_cost
-- $9 tokens_spent
-- $10 status_code
-- $11 success
-- $12 duration_ms
-- $13 rate_limit_remaining
-- $14 rate_limit_reset
-- $15 retry_after
-- $16 error_message
-- $17 request_fingerprint

CREATE TABLE IF NOT EXISTS pipedrive_api_usage_events (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  workflow_path TEXT NOT NULL,
  script_path TEXT,
  windmill_job_id TEXT,
  parent_job_id TEXT,
  method TEXT NOT NULL,
  raw_endpoint TEXT NOT NULL,
  normalized_endpoint TEXT NOT NULL,
  endpoint_token_cost INTEGER NOT NULL DEFAULT 0,
  tokens_spent INTEGER NOT NULL DEFAULT 0,
  status_code INTEGER,
  success BOOLEAN NOT NULL DEFAULT false,
  duration_ms INTEGER,
  rate_limit_remaining INTEGER,
  rate_limit_reset TEXT,
  retry_after TEXT,
  error_message TEXT,
  request_fingerprint TEXT
);

CREATE INDEX IF NOT EXISTS idx_pipedrive_api_usage_events_timestamp
  ON pipedrive_api_usage_events (timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_pipedrive_api_usage_events_workflow
  ON pipedrive_api_usage_events (workflow_path, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_pipedrive_api_usage_events_endpoint
  ON pipedrive_api_usage_events (normalized_endpoint, method, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_pipedrive_api_usage_events_fingerprint
  ON pipedrive_api_usage_events (request_fingerprint, timestamp DESC);

INSERT INTO pipedrive_api_usage_events (
  workflow_path,
  script_path,
  windmill_job_id,
  parent_job_id,
  method,
  raw_endpoint,
  normalized_endpoint,
  endpoint_token_cost,
  tokens_spent,
  status_code,
  success,
  duration_ms,
  rate_limit_remaining,
  rate_limit_reset,
  retry_after,
  error_message,
  request_fingerprint
) VALUES (
  $1::TEXT,
  $2::TEXT,
  $3::TEXT,
  $4::TEXT,
  $5::TEXT,
  $6::TEXT,
  $7::TEXT,
  $8::INTEGER,
  $9::INTEGER,
  $10::INTEGER,
  $11::BOOLEAN,
  $12::INTEGER,
  $13::INTEGER,
  $14::TEXT,
  $15::TEXT,
  $16::TEXT,
  $17::TEXT
)
RETURNING id, timestamp, workflow_path, normalized_endpoint, tokens_spent;
