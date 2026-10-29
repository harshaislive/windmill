declare const process: { env: Record<string, string | undefined> };

type EventRow = {
  event_id: string;
  job_id: string;
  event_timestamp: string;
  event_date: string;
  event_type: string;
  message_status: string | null;
  message_id: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  template_name: string | null;
  category: string | null;
  customer_id: string | null;
  phone_number: string | null;
  callback_data: string | null;
  deal_id: number | null;
  raw_payload: Record<string, any>;
};

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

function addDays(date: string, days: number) {
  const current = new Date(`${date}T00:00:00+05:30`);
  current.setUTCDate(current.getUTCDate() + days);
  return dateInTimezone(current, "Asia/Kolkata");
}

function dateStartIso(date: string) {
  return new Date(`${date}T00:00:00+05:30`).toISOString();
}

function dateEndIso(date: string) {
  return new Date(`${addDays(date, 1)}T00:00:00+05:30`).toISOString();
}

function apiCandidates(path: string) {
  const base = (process.env.BASE_INTERNAL_URL || process.env.BASE_URL || "").replace(/\/+$/, "");
  if (!base) throw new Error("BASE_INTERNAL_URL or BASE_URL is required.");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (base.endsWith("/api")) return [`${base}${normalized}`];
  return [`${base}/api${normalized}`, `${base}${normalized}`];
}

async function apiGet(path: string, query: Record<string, string | number | boolean | undefined> = {}) {
  const token = process.env.WM_TOKEN;
  if (!token) throw new Error("WM_TOKEN is required.");
  const queryString = new URLSearchParams(
    Object.entries(query)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, String(value)]),
  ).toString();
  let lastError = "";
  for (const candidate of apiCandidates(path)) {
    const url = queryString ? `${candidate}?${queryString}` : candidate;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (response.ok) return await response.json();
    lastError = `${response.status} ${await response.text().catch(() => "")}`;
    if (response.status !== 404) break;
  }
  throw new Error(`Windmill API request failed for ${path}: ${lastError}`);
}

async function apiPost(path: string, body: unknown) {
  const token = process.env.WM_TOKEN;
  if (!token) throw new Error("WM_TOKEN is required.");
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
    CREATE TABLE IF NOT EXISTS interakt_webhook_events (
      event_id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      event_timestamp TIMESTAMPTZ NOT NULL,
      event_date DATE NOT NULL,
      event_type TEXT NOT NULL,
      message_status TEXT,
      message_id TEXT,
      campaign_id TEXT,
      campaign_name TEXT,
      template_name TEXT,
      category TEXT,
      customer_id TEXT,
      phone_number TEXT,
      callback_data TEXT,
      deal_id BIGINT,
      raw_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
      source_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute();
  await sql`
    CREATE TABLE IF NOT EXISTS interakt_webhook_sync_runs (
      run_id TEXT PRIMARY KEY,
      started_at TIMESTAMPTZ NOT NULL,
      completed_at TIMESTAMPTZ,
      status TEXT NOT NULL,
      jobs_scanned BIGINT NOT NULL DEFAULT 0,
      events_upserted BIGINT NOT NULL DEFAULT 0,
      error_message TEXT,
      raw_summary JSONB NOT NULL DEFAULT '{}'::JSONB
    )
  `.execute();
}

function parseJson(value: unknown) {
  if (!value || typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function rawPayload(detail: any) {
  return detail?.args?.body || parseJson(detail?.args?.raw_string) || detail?.args || {};
}

function templateName(message: any) {
  const parsed = parseJson(message?.raw_template);
  return parsed?.name || parsed?.display_name || null;
}

function templateCategory(message: any) {
  const parsed = parseJson(message?.raw_template);
  return parsed?.category || null;
}

function callbackData(message: any) {
  return message?.meta_data?.source_data?.callback_data || null;
}

function dealIdFromCallback(value: string | null) {
  const match = String(value || "").match(/pipedrive_deal:(\d+)/i) || String(value || "").match(/deal[_\s-]?id[:=]\s*(\d+)/i);
  return match?.[1] ? Number(match[1]) : null;
}

function normalizeEventType(type: string, status: string | null) {
  const text = `${type} ${status || ""}`.toLowerCase();
  if (text.includes("seen") || text.includes("read")) return "read";
  if (text.includes("delivered")) return "delivered";
  if (text.includes("failed")) return "failed";
  if (text.includes("sent")) return "sent";
  if (text.includes("received") || text.includes("user")) return "reply";
  return type || "unknown";
}

function eventTimestamp(payload: any, message: any, fallback: string) {
  return (
    message?.seen_at_utc ||
    message?.delivered_at_utc ||
    message?.received_at_utc ||
    payload?.timestamp ||
    fallback
  );
}

function eventDate(timestamp: string) {
  return dateInTimezone(new Date(timestamp), "Asia/Kolkata");
}

function normalizeEvent(detail: any): EventRow | null {
  const payload = rawPayload(detail);
  const message = payload?.data?.message || {};
  const customer = payload?.data?.customer || message?.customer || {};
  const status = message?.message_status ? String(message.message_status) : null;
  const type = normalizeEventType(String(payload?.type || ""), status);
  const timestamp = eventTimestamp(payload, message, detail?.created_at || new Date().toISOString());
  const messageId = message?.id ? String(message.id) : null;
  const eventId = `${messageId || detail.id}:${type}:${timestamp}`;
  const cb = callbackData(message);

  if (!messageId && !payload?.type) return null;

  return {
    event_id: eventId,
    job_id: String(detail.id),
    event_timestamp: new Date(timestamp).toISOString(),
    event_date: eventDate(timestamp),
    event_type: type,
    message_status: status,
    message_id: messageId,
    campaign_id: message?.campaign_id ? String(message.campaign_id) : null,
    campaign_name: message?.campaign_name ? String(message.campaign_name) : null,
    template_name: templateName(message),
    category: templateCategory(message),
    customer_id: customer?.id ? String(customer.id) : null,
    phone_number: customer?.channel_phone_number || customer?.phone_number || null,
    callback_data: cb,
    deal_id: dealIdFromCallback(cb),
    raw_payload: payload,
  };
}

async function listInboundJobs(workspace: string, startedAfter: string, startedBefore: string) {
  const jobs: any[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const pageRows = await apiGet(`/w/${workspace}/jobs/completed/list`, {
      script_path_exact: "f/sales/interakt_whatsapp_inbound",
      started_after: startedAfter,
      started_before: startedBefore,
      order_desc: true,
      page,
      per_page: 200,
      has_null_parent: true,
    });
    const rows = Array.isArray(pageRows) ? pageRows : pageRows?.jobs || [];
    jobs.push(...rows);
    if (!Array.isArray(rows) || rows.length < 200) break;
  }
  return jobs;
}

async function upsertEvent(sql: ReturnType<typeof datatable>, row: EventRow) {
  await sql`
    INSERT INTO interakt_webhook_events (
      event_id, job_id, event_timestamp, event_date, event_type, message_status, message_id, campaign_id,
      campaign_name, template_name, category, customer_id, phone_number, callback_data, deal_id, raw_payload, source_synced_at
    ) VALUES (
      ${row.event_id}, ${row.job_id}, ${row.event_timestamp}::TIMESTAMPTZ, (${row.event_timestamp}::TIMESTAMPTZ AT TIME ZONE 'Asia/Kolkata')::DATE, ${row.event_type}, ${row.message_status}, ${row.message_id}, ${row.campaign_id},
      ${row.campaign_name}, ${row.template_name}, ${row.category}, ${row.customer_id}, ${row.phone_number}, ${row.callback_data}, ${row.deal_id}::BIGINT, ${row.raw_payload}, NOW()
    )
    ON CONFLICT (event_id) DO UPDATE SET
      job_id = EXCLUDED.job_id,
      event_timestamp = EXCLUDED.event_timestamp,
      event_date = EXCLUDED.event_date,
      event_type = EXCLUDED.event_type,
      message_status = EXCLUDED.message_status,
      message_id = EXCLUDED.message_id,
      campaign_id = EXCLUDED.campaign_id,
      campaign_name = EXCLUDED.campaign_name,
      template_name = EXCLUDED.template_name,
      category = EXCLUDED.category,
      customer_id = EXCLUDED.customer_id,
      phone_number = EXCLUDED.phone_number,
      callback_data = EXCLUDED.callback_data,
      deal_id = EXCLUDED.deal_id,
      raw_payload = EXCLUDED.raw_payload,
      source_synced_at = NOW()
  `.execute();
}

export async function main(lookback_days = 30, end_date = "", timezone = "Asia/Kolkata") {
  const workspace = process.env.WM_WORKSPACE || "beforest-automations";
  const sql = datatable(workspace);
  const endDate = end_date || dateInTimezone(new Date(), timezone);
  const startDate = addDays(endDate, -(Math.max(1, Number(lookback_days)) - 1));
  const runId = crypto.randomUUID();
  await ensureTables(sql);
  await sql`
    INSERT INTO interakt_webhook_sync_runs (run_id, started_at, status, raw_summary)
    VALUES (${runId}, ${new Date().toISOString()}::TIMESTAMPTZ, ${"running"}, ${{ start_date: startDate, end_date: endDate, lookback_days }})
  `.execute();

  try {
    const jobs = await listInboundJobs(workspace, dateStartIso(startDate), dateEndIso(endDate));
    let upserted = 0;
    for (const job of jobs) {
      const detail = await apiGet(`/w/${workspace}/jobs_u/completed/get/${job.id}`).catch(() => null);
      const event = detail ? normalizeEvent(detail) : null;
      if (!event) continue;
      await upsertEvent(sql, event);
      upserted += 1;
    }
    await sql`
      UPDATE interakt_webhook_sync_runs
      SET completed_at = NOW(),
          status = ${"success"},
          jobs_scanned = ${jobs.length},
          events_upserted = ${upserted},
          raw_summary = ${{ start_date: startDate, end_date: endDate }}
      WHERE run_id = ${runId}
    `.execute();
    return { ok: true, run_id: runId, start_date: startDate, end_date: endDate, jobs_scanned: jobs.length, events_upserted: upserted };
  } catch (error: any) {
    await sql`
      UPDATE interakt_webhook_sync_runs
      SET completed_at = NOW(),
          status = ${"failed"},
          error_message = ${String(error?.message || error)}
      WHERE run_id = ${runId}
    `.execute();
    throw error;
  }
}
