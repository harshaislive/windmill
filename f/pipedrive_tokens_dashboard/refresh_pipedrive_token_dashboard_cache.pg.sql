-- $1 start_date
-- $2 end_date

CREATE TABLE IF NOT EXISTS pipedrive_api_usage_dashboard_cache (
  cache_key TEXT PRIMARY KEY,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload JSONB NOT NULL
);

WITH params AS (
  SELECT
    COALESCE(
      NULLIF($2::TEXT, '')::DATE,
      (now() AT TIME ZONE 'Asia/Kolkata')::DATE
    ) AS end_date
),
window_params AS (
  SELECT
    COALESCE(NULLIF($1::TEXT, '')::DATE, (end_date - INTERVAL '6 days')::DATE) AS start_date,
    end_date
  FROM params
),
base_events AS (
  SELECT
    e.*,
    CASE
      WHEN normalized_endpoint = 'GET /api/v2/deals/{id}' THEN 1
      WHEN normalized_endpoint = 'GET /api/v1/deals/{id}' THEN 2
      WHEN normalized_endpoint = 'GET /api/v2/deals' THEN 10
      WHEN normalized_endpoint = 'GET /api/v1/deals' THEN 20
      WHEN normalized_endpoint = 'GET /api/v2/deals/search' THEN 20
      WHEN normalized_endpoint = 'POST /api/v2/deals' THEN 5
      WHEN normalized_endpoint = 'PATCH /api/v2/deals/{id}' THEN 5
      WHEN normalized_endpoint = 'GET /api/v2/persons/{id}' THEN 1
      WHEN normalized_endpoint = 'GET /api/v2/persons/search' THEN 20
      WHEN normalized_endpoint = 'GET /api/v1/persons/search' THEN 40
      WHEN normalized_endpoint = 'GET /api/v1/persons/{id}/deals' THEN 20
      WHEN normalized_endpoint = 'POST /api/v2/persons' THEN 5
      WHEN normalized_endpoint = 'PATCH /api/v2/persons/{id}' THEN 5
      WHEN normalized_endpoint = 'GET /api/v1/deals/{id}/activities' THEN 20
      WHEN normalized_endpoint = 'GET /api/v1/activities' THEN 10
      WHEN normalized_endpoint = 'POST /api/v1/activities' THEN 5
      WHEN normalized_endpoint = 'POST /api/v2/activities' THEN 5
      WHEN normalized_endpoint = 'PUT /api/v1/activities/{id}' THEN 5
      WHEN normalized_endpoint = 'PUT /api/v2/activities/{id}' THEN 5
      WHEN normalized_endpoint = 'POST /api/v1/notes' THEN 10
      WHEN normalized_endpoint = 'GET /api/v2/products' THEN 10
      WHEN normalized_endpoint = 'POST /api/v2/products' THEN 5
      WHEN normalized_endpoint = 'PUT /api/v2/products/{id}' THEN 5
      WHEN normalized_endpoint = 'GET /api/v2/deals/{id}/products' THEN 10
      WHEN normalized_endpoint = 'POST /api/v2/deals/{id}/products' THEN 5
      WHEN normalized_endpoint = 'DELETE /api/v2/deals/{id}/products/{product_attachment_id}' THEN 3
      ELSE COALESCE(endpoint_token_cost, 0)
    END AS calculated_cost_per_call
  FROM pipedrive_api_usage_events e
  CROSS JOIN window_params p
  WHERE e.timestamp >= p.start_date
    AND e.timestamp < (p.end_date + INTERVAL '1 day')
),
summary AS (
  SELECT
    COUNT(*)::BIGINT AS calls,
    COALESCE(SUM(CASE WHEN success THEN 0 ELSE 1 END), 0)::BIGINT AS failed_calls,
    COALESCE(SUM(CASE WHEN status_code = 429 THEN 1 ELSE 0 END), 0)::BIGINT AS actual_429_calls,
    COALESCE(SUM(CASE WHEN status_code = 429 OR retry_after IS NOT NULL OR COALESCE(rate_limit_remaining, 999999) <= 10 THEN 1 ELSE 0 END), 0)::BIGINT AS rate_limit_warnings,
    COALESCE(SUM(calculated_cost_per_call), 0)::BIGINT AS tokens_spent,
    COALESCE(AVG(duration_ms), 0)::DOUBLE PRECISION AS avg_latency_ms,
    COALESCE(SUM(CASE WHEN success THEN 1 ELSE 0 END)::DOUBLE PRECISION / NULLIF(COUNT(*), 0), 0)::DOUBLE PRECISION AS success_rate
  FROM base_events
),
workflow_rows AS (
  SELECT
    workflow_path,
    COUNT(*)::BIGINT AS calls,
    COUNT(DISTINCT COALESCE(parent_job_id, windmill_job_id))::BIGINT AS runs,
    COALESCE(SUM(calculated_cost_per_call), 0)::BIGINT AS tokens_spent,
    COALESCE(SUM(CASE WHEN success THEN 0 ELSE 1 END), 0)::BIGINT AS failed_calls,
    COALESCE(AVG(duration_ms), 0)::DOUBLE PRECISION AS avg_latency_ms,
    COALESCE(SUM(calculated_cost_per_call)::DOUBLE PRECISION / NULLIF(COUNT(DISTINCT COALESCE(parent_job_id, windmill_job_id)), 0), 0)::DOUBLE PRECISION AS tokens_per_run,
    COALESCE(COUNT(*)::DOUBLE PRECISION / NULLIF(COUNT(DISTINCT COALESCE(parent_job_id, windmill_job_id)), 0), 0)::DOUBLE PRECISION AS calls_per_run,
    COALESCE(SUM(CASE WHEN success THEN 0 ELSE 1 END)::DOUBLE PRECISION / NULLIF(COUNT(*), 0), 0)::DOUBLE PRECISION AS failure_rate
  FROM base_events
  GROUP BY workflow_path
  ORDER BY tokens_spent DESC, calls DESC
  LIMIT 50
),
endpoint_rows AS (
  SELECT
    method,
    normalized_endpoint,
    COUNT(*)::BIGINT AS count,
    COALESCE(SUM(calculated_cost_per_call), 0)::BIGINT AS tokens_spent,
    COALESCE(AVG(calculated_cost_per_call), 0)::DOUBLE PRECISION AS cost_per_call,
    COALESCE(AVG(duration_ms), 0)::DOUBLE PRECISION AS avg_latency_ms,
    COALESCE(SUM(CASE WHEN success THEN 1 ELSE 0 END)::DOUBLE PRECISION / NULLIF(COUNT(*), 0), 0)::DOUBLE PRECISION AS success_rate,
    COALESCE(SUM(CASE WHEN status_code = 429 THEN 1 ELSE 0 END), 0)::BIGINT AS rate_limit_hits
  FROM base_events
  GROUP BY method, normalized_endpoint
  ORDER BY tokens_spent DESC, count DESC
  LIMIT 80
),
error_rows AS (
  SELECT timestamp, workflow_path, method, normalized_endpoint, status_code, error_message, calculated_cost_per_call AS tokens_spent
  FROM base_events
  WHERE success = false OR status_code >= 400 OR status_code = 429
  ORDER BY timestamp DESC
  LIMIT 50
),
rate_limit_rows AS (
  SELECT
    COALESCE(parent_job_id, windmill_job_id, 'unknown') AS run_id,
    workflow_path,
    method,
    normalized_endpoint,
    COUNT(*)::BIGINT AS signal_calls,
    COALESCE(SUM(CASE WHEN status_code = 429 THEN 1 ELSE 0 END), 0)::BIGINT AS actual_429_calls,
    COALESCE(SUM(CASE WHEN retry_after IS NOT NULL THEN 1 ELSE 0 END), 0)::BIGINT AS retry_after_calls,
    COALESCE(SUM(CASE WHEN COALESCE(rate_limit_remaining, 999999) <= 10 THEN 1 ELSE 0 END), 0)::BIGINT AS low_remaining_calls,
    MIN(timestamp) AS first_seen,
    MAX(timestamp) AS last_seen
  FROM base_events
  WHERE status_code = 429
    OR retry_after IS NOT NULL
    OR COALESCE(rate_limit_remaining, 999999) <= 10
  GROUP BY COALESCE(parent_job_id, windmill_job_id, 'unknown'), workflow_path, method, normalized_endpoint
  ORDER BY last_seen DESC, signal_calls DESC
  LIMIT 100
),
duplicate_rows AS (
  SELECT
    workflow_path,
    method,
    normalized_endpoint,
    request_fingerprint,
    COUNT(*)::BIGINT AS calls,
    COALESCE(SUM(calculated_cost_per_call), 0)::BIGINT AS tokens_spent,
    MIN(timestamp) AS first_seen,
    MAX(timestamp) AS last_seen
  FROM base_events
  WHERE request_fingerprint IS NOT NULL
    AND request_fingerprint <> ''
  GROUP BY workflow_path, method, normalized_endpoint, request_fingerprint
  HAVING COUNT(*) > 1
  ORDER BY tokens_spent DESC, calls DESC
  LIMIT 50
),
all_heavy_run_rows AS (
  SELECT
    COALESCE(parent_job_id, windmill_job_id, 'unknown') AS run_id,
    workflow_path,
    COUNT(*)::BIGINT AS calls,
    COALESCE(SUM(calculated_cost_per_call), 0)::BIGINT AS tokens_spent,
    COALESCE(SUM(CASE WHEN success THEN 0 ELSE 1 END), 0)::BIGINT AS failed_calls,
    MIN(timestamp) AS started_at,
    MAX(timestamp) AS last_seen
  FROM base_events
  GROUP BY COALESCE(parent_job_id, windmill_job_id, 'unknown'), workflow_path
),
heavy_run_rows AS (
  SELECT *
  FROM all_heavy_run_rows
  ORDER BY tokens_spent DESC, calls DESC
  LIMIT 40
),
ranked_heavy_run_rows AS (
  SELECT
    all_heavy_run_rows.*,
    ROW_NUMBER() OVER (
      PARTITION BY workflow_path
      ORDER BY tokens_spent DESC, calls DESC
    ) AS workflow_rank
  FROM all_heavy_run_rows
),
all_run_endpoint_rows AS (
  SELECT
    COALESCE(parent_job_id, windmill_job_id, 'unknown') AS run_id,
    workflow_path,
    method,
    normalized_endpoint,
    COUNT(*)::BIGINT AS calls,
    COALESCE(AVG(calculated_cost_per_call), 0)::DOUBLE PRECISION AS cost_per_call,
    COALESCE(SUM(calculated_cost_per_call), 0)::BIGINT AS tokens_spent,
    MIN(timestamp) AS first_seen,
    MAX(timestamp) AS last_seen,
    COUNT(DISTINCT request_fingerprint) FILTER (WHERE request_fingerprint IS NOT NULL AND request_fingerprint <> '')::BIGINT AS unique_fingerprints
  FROM base_events
  GROUP BY COALESCE(parent_job_id, windmill_job_id, 'unknown'), workflow_path, method, normalized_endpoint
),
run_endpoint_rows AS (
  SELECT *
  FROM all_run_endpoint_rows
  ORDER BY tokens_spent DESC, calls DESC
  LIMIT 200
),
top_run_endpoint_rows AS (
  SELECT *
  FROM (
    SELECT
      all_run_endpoint_rows.*,
      ROW_NUMBER() OVER (
        PARTITION BY run_id, workflow_path
        ORDER BY tokens_spent DESC, calls DESC, normalized_endpoint
      ) AS endpoint_rank
    FROM all_run_endpoint_rows
  ) ranked_run_endpoints
  WHERE endpoint_rank = 1
),
optimization_rows AS (
  SELECT
    'High token run' AS finding,
    ranked_heavy_run_rows.workflow_path,
    ranked_heavy_run_rows.run_id,
    top_run_endpoint_rows.normalized_endpoint,
    ranked_heavy_run_rows.calls,
    ranked_heavy_run_rows.tokens_spent,
    CASE
      WHEN ranked_heavy_run_rows.failed_calls > 0 THEN
        'This run spent ' || ranked_heavy_run_rows.tokens_spent || ' tokens while ' || ranked_heavy_run_rows.failed_calls || ' Pipedrive calls failed. Fix the failing branch or retry handling so the same calls are not repeated in one run.'
      WHEN COALESCE(top_run_endpoint_rows.normalized_endpoint, '') ILIKE '%/search%' THEN
        'Most tokens came from repeated ' || COALESCE(top_run_endpoint_rows.normalized_endpoint, 'search') || ' calls (' || COALESCE(top_run_endpoint_rows.calls, ranked_heavy_run_rows.calls) || ' calls). Narrow the search input or reuse the matched record instead of searching broadly for each item.'
      WHEN COALESCE(top_run_endpoint_rows.normalized_endpoint, '') ILIKE 'GET %/activities%' THEN
        'Most tokens came from activity reads on ' || COALESCE(top_run_endpoint_rows.normalized_endpoint, 'activities') || ' (' || COALESCE(top_run_endpoint_rows.calls, ranked_heavy_run_rows.calls) || ' calls). Check whether the workflow reloads full activity lists and switch to ID-based or date-windowed fetches where possible.'
      WHEN COALESCE(top_run_endpoint_rows.normalized_endpoint, '') ILIKE '%/activities%' THEN
        'Most tokens came from activity create/update calls on ' || COALESCE(top_run_endpoint_rows.normalized_endpoint, 'activities') || ' (' || COALESCE(top_run_endpoint_rows.calls, ranked_heavy_run_rows.calls) || ' calls). Check whether duplicate activities are being created or updated one-by-one when the same result could be reused.'
      WHEN COALESCE(top_run_endpoint_rows.normalized_endpoint, '') ILIKE '%/deals%' THEN
        'The heaviest endpoint is ' || COALESCE(top_run_endpoint_rows.normalized_endpoint, 'deals') || ' with ' || COALESCE(top_run_endpoint_rows.calls, ranked_heavy_run_rows.calls) || ' calls. Review deal lookups for per-record loops and cache deal details already loaded earlier in the run.'
      WHEN ranked_heavy_run_rows.calls >= 100 THEN
        'This run made ' || ranked_heavy_run_rows.calls || ' Pipedrive calls, led by ' || COALESCE(top_run_endpoint_rows.normalized_endpoint, 'an endpoint') || '. Look for per-row loops and batch or cache lookups before calling Pipedrive again.'
      WHEN COALESCE(top_run_endpoint_rows.cost_per_call, 0) >= 20 THEN
        'The top endpoint is ' || COALESCE(top_run_endpoint_rows.normalized_endpoint, 'unknown') || ' at about ' || ROUND(top_run_endpoint_rows.cost_per_call::NUMERIC, 1) || ' tokens per call. Reduce how often this expensive endpoint runs or replace it with a narrower lookup.'
      WHEN COALESCE(top_run_endpoint_rows.unique_fingerprints, 0) < COALESCE(top_run_endpoint_rows.calls, 0) THEN
        'This run repeats similar requests against ' || COALESCE(top_run_endpoint_rows.normalized_endpoint, 'an endpoint') || '. Cache the first response or dedupe the input list before calling Pipedrive.'
      ELSE
        'Largest token block is ' || COALESCE(top_run_endpoint_rows.normalized_endpoint, 'an endpoint') || ' with ' || COALESCE(top_run_endpoint_rows.calls, ranked_heavy_run_rows.calls) || ' calls. Review that step for duplicate reads or unnecessary repeated fetches.'
    END AS suggestion
  FROM ranked_heavy_run_rows
  LEFT JOIN top_run_endpoint_rows
    ON top_run_endpoint_rows.run_id = ranked_heavy_run_rows.run_id
    AND top_run_endpoint_rows.workflow_path = ranked_heavy_run_rows.workflow_path
  WHERE ranked_heavy_run_rows.tokens_spent > 0
    AND ranked_heavy_run_rows.workflow_rank = 1
  ORDER BY ranked_heavy_run_rows.tokens_spent DESC, ranked_heavy_run_rows.calls DESC
  LIMIT 10
),
daily_rows AS (
  SELECT
    (timestamp AT TIME ZONE 'Asia/Kolkata')::DATE::TEXT AS date,
    COALESCE(SUM(calculated_cost_per_call), 0)::BIGINT AS tokens,
    COUNT(*)::BIGINT AS calls,
    COALESCE(SUM(CASE WHEN success THEN 0 ELSE 1 END), 0)::BIGINT AS failed_calls
  FROM base_events
  GROUP BY (timestamp AT TIME ZONE 'Asia/Kolkata')::DATE
  ORDER BY date
),
top_workflow AS (
  SELECT jsonb_build_object(
    'workflow_path', workflow_path,
    'tokens_spent', tokens_spent,
    'calls', calls
  ) AS value
  FROM workflow_rows
  ORDER BY tokens_spent DESC, calls DESC
  LIMIT 1
),
payload AS (
  SELECT
    p.start_date,
    p.end_date,
    jsonb_build_object(
      'ok', true,
      'ready', true,
      'generated_at', now(),
      'window', jsonb_build_object(
        'start_date', p.start_date::TEXT,
        'end_date', p.end_date::TEXT,
        'timezone', 'Asia/Kolkata'
      ),
      'totals', jsonb_build_object(
        'calls', s.calls,
        'failed_calls', s.failed_calls,
        'actual_429_calls', s.actual_429_calls,
        'rate_limit_warnings', s.rate_limit_warnings,
        'tokens_spent', s.tokens_spent,
        'avg_latency_ms', s.avg_latency_ms,
        'success_rate', s.success_rate,
        'top_workflow', COALESCE((SELECT value FROM top_workflow), 'null'::JSONB)
      ),
      'daily_tokens', COALESCE((SELECT jsonb_agg(to_jsonb(daily_rows) ORDER BY date) FROM daily_rows), '[]'::JSONB),
      'workflows', COALESCE((SELECT jsonb_agg(to_jsonb(workflow_rows) ORDER BY tokens_spent DESC, calls DESC) FROM workflow_rows), '[]'::JSONB),
      'endpoints', COALESCE((SELECT jsonb_agg(to_jsonb(endpoint_rows) ORDER BY tokens_spent DESC, count DESC) FROM endpoint_rows), '[]'::JSONB),
      'recent_errors', COALESCE((SELECT jsonb_agg(to_jsonb(error_rows) ORDER BY timestamp DESC) FROM error_rows), '[]'::JSONB),
      'rate_limit_events', COALESCE((SELECT jsonb_agg(to_jsonb(rate_limit_rows) ORDER BY last_seen DESC, signal_calls DESC) FROM rate_limit_rows), '[]'::JSONB),
      'duplicate_fetches', COALESCE((SELECT jsonb_agg(to_jsonb(duplicate_rows) ORDER BY tokens_spent DESC, calls DESC) FROM duplicate_rows), '[]'::JSONB),
      'heavy_runs', COALESCE((SELECT jsonb_agg(to_jsonb(heavy_run_rows) ORDER BY tokens_spent DESC, calls DESC) FROM heavy_run_rows), '[]'::JSONB),
      'run_endpoints', COALESCE((SELECT jsonb_agg(to_jsonb(run_endpoint_rows) ORDER BY tokens_spent DESC, calls DESC) FROM run_endpoint_rows), '[]'::JSONB),
      'optimization_insights', COALESCE((SELECT jsonb_agg(to_jsonb(optimization_rows) ORDER BY tokens_spent DESC, calls DESC) FROM optimization_rows), '[]'::JSONB)
    ) AS value
  FROM window_params p
  CROSS JOIN summary s
),
upserted AS (
  INSERT INTO pipedrive_api_usage_dashboard_cache (cache_key, start_date, end_date, generated_at, payload)
  SELECT
    start_date::TEXT || ':' || end_date::TEXT,
    start_date,
    end_date,
    now(),
    value
  FROM payload
  ON CONFLICT (cache_key) DO UPDATE
    SET generated_at = EXCLUDED.generated_at,
        payload = EXCLUDED.payload
  RETURNING payload
)
SELECT payload FROM upserted;
