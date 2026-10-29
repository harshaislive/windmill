CREATE SCHEMA IF NOT EXISTS sales_automation;

CREATE TABLE IF NOT EXISTS sales_automation.meta_capi_signal_dedupe (
  event_id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('embed', 'completed')),
  form_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  meta_http_status INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE sales_automation.meta_capi_signal_dedupe IS
  'Secret-free atomic idempotency and rate-limit state for qualified Typeform Meta CAPI events.';
