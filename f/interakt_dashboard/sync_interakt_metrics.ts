import * as wmill from "windmill-client";

declare const process: { env: Record<string, string | undefined> };

type CampaignMetric = {
  campaign_id: string;
  campaign_name: string;
  category: string | null;
  status: string | null;
  set_live_date: string | null;
  attempted: number | null;
  sent: number | null;
  delivered: number | null;
  read: number | null;
  replies: number | null;
  delivered_rate: number | null;
  read_rate: number | null;
  reply_rate: number | null;
  geography: string;
  campaign_type: string;
  audience_type: string;
  campaign_objective: string;
  raw_payload: Record<string, any>;
};

const ROOT = "f/interakt_dashboard";
const COMMON_CAMPAIGN_PATHS = [
  "/v1/public/campaigns",
  "/v1/campaigns",
  "/campaigns",
  "/api/v1/campaigns",
  "/v1/public/campaign-reports",
  "/v1/campaign-reports",
  "/campaign-reports",
  "/campaign_reports",
  "/campaigns/report",
  "/reports/campaigns",
];

function dateInTimezone(date = new Date(), timezone = "Asia/Kolkata") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/[%₹,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function pct(value: unknown): number | null {
  const parsed = num(value);
  if (parsed === null) return null;
  return parsed > 1 ? parsed / 100 : parsed;
}

function countFromRate(total: number | null, rate: number | null): number | null {
  if (total === null || rate === null) return null;
  return Math.round(total * rate);
}

function rateFromCount(count: number | null, total: number | null): number | null {
  if (count === null || total === null || total <= 0) return null;
  return count / total;
}

function valueAt(row: Record<string, any>, keys: string[]) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== "") return row[key];
  }
  const lowerMap = new Map(Object.entries(row).map(([key, value]) => [key.toLowerCase().replace(/[\s_%.-]/g, ""), value]));
  for (const key of keys) {
    const normalized = key.toLowerCase().replace(/[\s_%.-]/g, "");
    const value = lowerMap.get(normalized);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function normalizeDate(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function inferGeography(name: string) {
  const text = name.toLowerCase();
  if (text.includes("mumbai") || text.includes("mum_")) return "Mumbai";
  if (text.includes("bhopal") || text.includes("bhp")) return "Bhopal";
  if (text.includes("hamm") || text.includes("ham_")) return "Hammiyala";
  if (text.includes("poo") || text.includes("poomaale")) return "Poomaale";
  return "Mixed";
}

function inferCampaignType(name: string) {
  const text = name.toLowerCase();
  if (text.includes("reminder")) return "Reminder";
  if (text.includes("churn")) return "Churn";
  if (text.includes("percent") || text.includes("10cent")) return "Offer";
  if (text.includes("pd_") || text.includes("product")) return "Product";
  return "Webinar";
}

function inferAudienceType(campaignType: string) {
  if (campaignType === "Churn") return "Retargeting";
  if (campaignType === "Reminder") return "Warm audience";
  if (campaignType === "Product") return "Existing customers";
  return "Cold audience";
}

function inferObjective(campaignType: string) {
  if (campaignType === "Churn") return "Reactivate";
  if (campaignType === "Reminder" || campaignType === "Offer") return "Convert";
  if (campaignType === "Product") return "Educate";
  return "Acquire";
}

function normalizeCampaign(row: Record<string, any>, index: number): CampaignMetric {
  const campaignName = String(valueAt(row, ["campaign_name", "Campaign Name", "name", "title"]) || `campaign_${index + 1}`);
  const campaignId = String(valueAt(row, ["campaign_id", "id", "uuid", "campaign_uuid"]) || campaignName);
  const sent = num(valueAt(row, ["sent", "Sent", "messages_sent"]));
  const deliveredRate = pct(valueAt(row, ["delivered_rate", "delivered_percentage", "Delivered %", "delivered_percent"]));
  const readRate = pct(valueAt(row, ["read_rate", "read_percentage", "Read %", "read_percent"]));
  const replyRate = pct(valueAt(row, ["reply_rate", "replied_rate", "replied_percentage", "Replied %", "replied_percent"]));
  const delivered = num(valueAt(row, ["delivered", "Delivered", "delivered_count"])) ?? countFromRate(sent, deliveredRate);
  const read = num(valueAt(row, ["read", "Read", "read_count"])) ?? countFromRate(sent, readRate);
  const replies = num(valueAt(row, ["replies", "reply_count", "replied", "Replied", "replied_count"])) ?? countFromRate(sent, replyRate);
  const campaignType = inferCampaignType(campaignName);

  return {
    campaign_id: campaignId,
    campaign_name: campaignName,
    category: valueAt(row, ["category", "Category"]) ? String(valueAt(row, ["category", "Category"])) : null,
    status: valueAt(row, ["status", "Status"]) ? String(valueAt(row, ["status", "Status"])) : null,
    set_live_date: normalizeDate(valueAt(row, ["set_live_date", "Set Live Date", "live_date", "created_at", "start_date"])),
    attempted: num(valueAt(row, ["attempted", "Attempted", "attempted_count"])),
    sent,
    delivered,
    read,
    replies,
    delivered_rate: deliveredRate ?? rateFromCount(delivered, sent),
    read_rate: readRate ?? rateFromCount(read, sent),
    reply_rate: replyRate ?? rateFromCount(replies, sent),
    geography: inferGeography(campaignName),
    campaign_type: campaignType,
    audience_type: inferAudienceType(campaignType),
    campaign_objective: inferObjective(campaignType),
    raw_payload: row,
  };
}

function extractRows(payload: any): Record<string, any>[] {
  if (Array.isArray(payload)) return payload;
  for (const key of ["campaigns", "data", "results", "items", "reports"]) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  if (Array.isArray(payload?.data?.campaigns)) return payload.data.campaigns;
  if (Array.isArray(payload?.data?.results)) return payload.data.results;
  return [];
}

async function requiredVariable(name: string): Promise<string> {
  const value = await wmill.getVariable(`${ROOT}/${name}`);
  if (!value || value.startsWith("PASTE_")) {
    throw new Error(`Missing Windmill variable ${ROOT}/${name}`);
  }
  return value;
}

async function optionalVariable(name: string): Promise<string> {
  try {
    const value = await wmill.getVariable(`${ROOT}/${name}`);
    return value && !value.startsWith("PASTE_") ? value : "";
  } catch {
    return "";
  }
}

function authHeaders(apiKey: string) {
  const authorization = /^(bearer|basic)\s+/i.test(apiKey) ? apiKey : `Bearer ${apiKey}`;
  return {
    Authorization: authorization,
    "X-API-Key": apiKey,
    "Api-Key": apiKey,
    Accept: "application/json",
  };
}

function buildUrl(baseUrl: string, path: string, startDate?: string, endDate?: string) {
  const base = baseUrl.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${base}${normalizedPath}`);
  if (startDate) {
    url.searchParams.set("start_date", startDate);
    url.searchParams.set("from", startDate);
  }
  if (endDate) {
    url.searchParams.set("end_date", endDate);
    url.searchParams.set("to", endDate);
  }
  return url.toString();
}

async function fetchCampaignPayload(baseUrl: string, apiKey: string, paths: string[], startDate?: string, endDate?: string) {
  const errors: string[] = [];
  for (const path of paths) {
    const url = buildUrl(baseUrl, path, startDate, endDate);
    const response = await fetch(url, { headers: authHeaders(apiKey) });
    const text = await response.text();
    if (response.ok) {
      const payload = text ? JSON.parse(text) : {};
      const rows = extractRows(payload);
      if (rows.length > 0) return { path, payload, rows };
      errors.push(`${path}: response had no campaign rows`);
      continue;
    }
    errors.push(`${path}: ${response.status} ${text.slice(0, 240)}`);
  }
  throw new Error(`Unable to fetch Interakt campaign metrics. Tried paths: ${errors.join(" | ")}`);
}

function apiCandidates(path: string) {
  const base = (process.env.BASE_INTERNAL_URL || process.env.BASE_URL || "").replace(/\/+$/, "");
  if (!base) throw new Error("BASE_INTERNAL_URL or BASE_URL is required for datatable access.");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (base.endsWith("/api")) return [`${base}${normalized}`];
  return [`${base}/api${normalized}`, `${base}${normalized}`];
}

async function apiPost(path: string, body: unknown) {
  const token = process.env.WM_TOKEN;
  if (!token) throw new Error("WM_TOKEN is required for datatable access.");
  let lastError = "";
  for (const candidate of apiCandidates(path)) {
    const response = await fetch(candidate, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.ok) return await response.json();
    lastError = `${response.status} ${await response.text().catch(() => "")}`;
    if (response.status !== 404) break;
  }
  throw new Error(`Windmill API request failed for ${path}: ${lastError}`);
}

function datatable(workspace: string) {
  return (strings: TemplateStringsArray, ...values: unknown[]) => {
    const args = Object.fromEntries(values.map((value, index) => [`arg${index + 1}`, value]));
    const comments = values.map((_, index) => `-- $${index + 1} arg${index + 1}`).join("\n");
    const placeholder = (value: unknown, nextChunk: string, index: number) => {
      if (nextChunk.trimStart().startsWith("::")) return `$${index + 1}`;
      if (typeof value === "number") return Number.isInteger(value) ? `$${index + 1}::BIGINT` : `$${index + 1}::DOUBLE PRECISION`;
      if (typeof value === "boolean") return `$${index + 1}::BOOLEAN`;
      if (value === null || value === undefined || typeof value === "string") return `$${index + 1}::TEXT`;
      return `$${index + 1}::JSONB`;
    };
    const content = strings.reduce((query, chunk, index) => {
      return query + chunk + (index < values.length ? placeholder(values[index], strings[index + 1], index) : "");
    }, comments ? `${comments}\n\n` : "");
    const run = () => apiPost(`/w/${workspace}/jobs/run_inline/preview`, {
      language: "postgresql",
      content,
      args: { ...args, database: "datatable://main" },
    });
    return { execute: run, fetch: run, async fetchOne() { const rows = await run(); return Array.isArray(rows) ? rows[0] : rows; } };
  };
}

async function ensureTables(sql: ReturnType<typeof datatable>) {
  await sql`
    CREATE TABLE IF NOT EXISTS interakt_campaign_metrics (
      campaign_id TEXT PRIMARY KEY,
      campaign_name TEXT NOT NULL,
      category TEXT,
      status TEXT,
      set_live_date TIMESTAMPTZ,
      attempted BIGINT,
      sent BIGINT,
      delivered BIGINT,
      read BIGINT,
      replies BIGINT,
      delivered_rate DOUBLE PRECISION,
      read_rate DOUBLE PRECISION,
      reply_rate DOUBLE PRECISION,
      geography TEXT,
      campaign_type TEXT,
      audience_type TEXT,
      campaign_objective TEXT,
      raw_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
      source_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute();
  await sql`
    CREATE TABLE IF NOT EXISTS interakt_sync_runs (
      run_id TEXT PRIMARY KEY,
      started_at TIMESTAMPTZ NOT NULL,
      completed_at TIMESTAMPTZ,
      status TEXT NOT NULL,
      campaigns_fetched BIGINT NOT NULL DEFAULT 0,
      campaigns_upserted BIGINT NOT NULL DEFAULT 0,
      error_message TEXT,
      request_path TEXT,
      raw_summary JSONB NOT NULL DEFAULT '{}'::JSONB
    )
  `.execute();
}

async function upsertCampaign(sql: ReturnType<typeof datatable>, row: CampaignMetric) {
  await sql`
    INSERT INTO interakt_campaign_metrics (
      campaign_id, campaign_name, category, status, set_live_date, attempted, sent, delivered, read, replies,
      delivered_rate, read_rate, reply_rate, geography, campaign_type, audience_type, campaign_objective, raw_payload, source_synced_at
    ) VALUES (
      ${row.campaign_id}, ${row.campaign_name}, ${row.category}, ${row.status}, ${row.set_live_date}::TIMESTAMPTZ, ${row.attempted}, ${row.sent}, ${row.delivered}, ${row.read}, ${row.replies},
      ${row.delivered_rate}, ${row.read_rate}, ${row.reply_rate}, ${row.geography}, ${row.campaign_type}, ${row.audience_type}, ${row.campaign_objective}, ${row.raw_payload}, NOW()
    )
    ON CONFLICT (campaign_id) DO UPDATE SET
      campaign_name = EXCLUDED.campaign_name,
      category = EXCLUDED.category,
      status = EXCLUDED.status,
      set_live_date = EXCLUDED.set_live_date,
      attempted = EXCLUDED.attempted,
      sent = EXCLUDED.sent,
      delivered = EXCLUDED.delivered,
      read = EXCLUDED.read,
      replies = EXCLUDED.replies,
      delivered_rate = EXCLUDED.delivered_rate,
      read_rate = EXCLUDED.read_rate,
      reply_rate = EXCLUDED.reply_rate,
      geography = EXCLUDED.geography,
      campaign_type = EXCLUDED.campaign_type,
      audience_type = EXCLUDED.audience_type,
      campaign_objective = EXCLUDED.campaign_objective,
      raw_payload = EXCLUDED.raw_payload,
      source_synced_at = NOW()
  `.execute();
}

export async function main(start_date = "", end_date = "", campaigns_path = "", timezone = "Asia/Kolkata") {
  const workspace = process.env.WM_WORKSPACE || "beforest-automations";
  const sql = datatable(workspace);
  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const apiKey = await requiredVariable("interakt_api_key");
  const baseUrl = await requiredVariable("interakt_base_url");
  const variableCampaignsPath = await optionalVariable("interakt_campaigns_path");
  const endDate = end_date || dateInTimezone(new Date(), timezone);
  const paths = campaigns_path ? [campaigns_path] : variableCampaignsPath ? [variableCampaignsPath] : COMMON_CAMPAIGN_PATHS;

  await ensureTables(sql);
  await sql`
    INSERT INTO interakt_sync_runs (run_id, started_at, status, raw_summary)
    VALUES (${runId}, ${startedAt}::TIMESTAMPTZ, ${"running"}, ${{ start_date, end_date: endDate, timezone }})
  `.execute();

  try {
    const fetched = await fetchCampaignPayload(baseUrl, apiKey, paths, start_date || undefined, endDate || undefined);
    const campaigns = fetched.rows.map(normalizeCampaign);
    for (const campaign of campaigns) await upsertCampaign(sql, campaign);
    await sql`
      UPDATE interakt_sync_runs
      SET completed_at = NOW(),
          status = ${"success"},
          campaigns_fetched = ${fetched.rows.length},
          campaigns_upserted = ${campaigns.length},
          request_path = ${fetched.path},
          raw_summary = ${{
            payload_keys: Object.keys(fetched.payload || {}),
            sample_campaign_id: campaigns[0]?.campaign_id,
          }}
      WHERE run_id = ${runId}
    `.execute();
    return { ok: true, run_id: runId, request_path: fetched.path, campaigns_fetched: fetched.rows.length, campaigns_upserted: campaigns.length };
  } catch (error: any) {
    await sql`
      UPDATE interakt_sync_runs
      SET completed_at = NOW(),
          status = ${"failed"},
          error_message = ${String(error?.message || error)}
      WHERE run_id = ${runId}
    `.execute();
    throw error;
  }
}
