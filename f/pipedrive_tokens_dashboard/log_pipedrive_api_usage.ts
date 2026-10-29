import * as wmill from "windmill-client";

const INSERT_USAGE_EVENT_PATH = "f/pipedrive_tokens_dashboard/insert_pipedrive_api_usage_event";

type UsageEvent = {
  workflow_path: string;
  script_path?: string;
  windmill_job_id?: string;
  parent_job_id?: string;
  method: string;
  raw_endpoint: string;
  status_code?: number;
  success: boolean;
  duration_ms?: number;
  rate_limit_remaining?: number;
  rate_limit_reset?: string;
  retry_after?: string;
  error_message?: string;
  request_fingerprint?: string;
};

const ENDPOINT_COSTS: Array<[RegExp, number]> = [
  [/^GET \/api\/v2\/deals\/\{id\}$/, 1],
  [/^GET \/api\/v1\/deals\/\{id\}$/, 2],
  [/^GET \/api\/v2\/deals$/, 10],
  [/^GET \/api\/v1\/deals$/, 20],
  [/^GET \/api\/v2\/deals\/search$/, 20],
  [/^POST \/api\/v2\/deals$/, 5],
  [/^PATCH \/api\/v2\/deals\/\{id\}$/, 5],
  [/^GET \/api\/v2\/persons\/\{id\}$/, 1],
  [/^GET \/api\/v2\/persons\/search$/, 20],
  [/^GET \/api\/v1\/persons\/search$/, 40],
  [/^GET \/api\/v1\/persons\/\{id\}\/deals$/, 20],
  [/^POST \/api\/v2\/persons$/, 5],
  [/^PATCH \/api\/v2\/persons\/\{id\}$/, 5],
  [/^GET \/api\/v1\/deals\/\{id\}\/activities$/, 20],
  [/^GET \/api\/v1\/activities$/, 10],
  [/^POST \/api\/v1\/activities$/, 5],
  [/^POST \/api\/v2\/activities$/, 5],
  [/^PUT \/api\/v1\/activities\/\{id\}$/, 5],
  [/^PUT \/api\/v2\/activities\/\{id\}$/, 5],
  [/^POST \/api\/v1\/notes$/, 10],
  [/^GET \/api\/v2\/products$/, 10],
  [/^POST \/api\/v2\/products$/, 5],
  [/^PUT \/api\/v2\/products\/\{id\}$/, 5],
  [/^GET \/api\/v2\/deals\/\{id\}\/products$/, 10],
  [/^POST \/api\/v2\/deals\/\{id\}\/products$/, 5],
  [/^DELETE \/api\/v2\/deals\/\{id\}\/products\/\{product_attachment_id\}$/, 3],
];

function asString(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function normalizeEndpoint(method: string, rawEndpoint: string): string {
  const clean = rawEndpoint
    .replace(/^https:\/\/[^/]+\.pipedrive\.com/i, "")
    .replace(/\?.*$/, "")
    .replace(/\/+$/, "");

  return `${method.toUpperCase()} ${clean}`
    .replace(/\/api\/v([12])\/deals\/\d+\/products\/\d+$/, "/api/v$1/deals/{id}/products/{product_attachment_id}")
    .replace(/\/api\/v([12])\/deals\/\d+\/products$/, "/api/v$1/deals/{id}/products")
    .replace(/\/api\/v([12])\/deals\/\d+\/activities$/, "/api/v$1/deals/{id}/activities")
    .replace(/\/api\/v([12])\/persons\/\d+\/deals$/, "/api/v$1/persons/{id}/deals")
    .replace(/\/api\/v([12])\/activities\/\d+$/, "/api/v$1/activities/{id}")
    .replace(/\/api\/v([12])\/products\/\d+$/, "/api/v$1/products/{id}")
    .replace(/\/api\/v([12])\/persons\/\d+$/, "/api/v$1/persons/{id}")
    .replace(/\/api\/v([12])\/deals\/\d+$/, "/api/v$1/deals/{id}");
}

function endpointCost(normalizedEndpoint: string): number {
  return ENDPOINT_COSTS.find(([pattern]) => pattern.test(normalizedEndpoint))?.[1] ?? 0;
}

export async function main(event: UsageEvent) {
  const method = asString(event.method).toUpperCase();
  const rawEndpoint = asString(event.raw_endpoint);
  const normalizedEndpoint = normalizeEndpoint(method, rawEndpoint);
  const cost = endpointCost(normalizedEndpoint);
  const windmillJobId = event.windmill_job_id || process.env.WM_JOB_ID || "";
  const parentJobId = event.parent_job_id || process.env.WM_ROOT_JOB_ID || "";
  const requestFingerprint = event.request_fingerprint || "";

  const inserted = await wmill.runScriptByPath(INSERT_USAGE_EVENT_PATH, {
    workflow_path: event.workflow_path,
    script_path: event.script_path || event.workflow_path,
    windmill_job_id: windmillJobId,
    parent_job_id: parentJobId,
    method,
    raw_endpoint: rawEndpoint,
    normalized_endpoint: normalizedEndpoint,
    endpoint_token_cost: cost,
    tokens_spent: cost,
    status_code: event.status_code ?? null,
    success: Boolean(event.success),
    duration_ms: event.duration_ms ?? null,
    rate_limit_remaining: event.rate_limit_remaining ?? null,
    rate_limit_reset: event.rate_limit_reset || "",
    retry_after: event.retry_after || "",
    error_message: asString(event.error_message).slice(0, 800),
    request_fingerprint: requestFingerprint,
    database: "datatable://main",
  });

  return {
    ok: true,
    normalized_endpoint: normalizedEndpoint,
    tokens_spent: cost,
    inserted,
  };
}
