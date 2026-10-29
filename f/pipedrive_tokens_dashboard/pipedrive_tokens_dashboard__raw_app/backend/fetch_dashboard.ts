import * as wmill from "windmill-client";

type CacheRow = {
  payload?: unknown;
  generated_at?: string;
  start_date?: string;
  end_date?: string;
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

function emptyPayload(startDate: string, endDate: string, message: string) {
  return {
    ok: true,
    ready: false,
    message,
    generated_at: new Date().toISOString(),
    window: { start_date: startDate, end_date: endDate, timezone: "Asia/Kolkata" },
    totals: {
      calls: 0,
      failed_calls: 0,
      actual_429_calls: 0,
      rate_limit_warnings: 0,
      tokens_spent: 0,
      avg_latency_ms: 0,
      success_rate: 0,
      top_workflow: null,
    },
    daily_tokens: [],
    workflows: [],
    endpoints: [],
    recent_errors: [],
    rate_limit_events: [],
    duplicate_fetches: [],
    heavy_runs: [],
    run_endpoints: [],
    optimization_insights: [],
  };
}

function payloadFrom(row?: CacheRow | null) {
  const payload = row?.payload;
  if (typeof payload === "string") {
    try {
      return JSON.parse(payload);
    } catch {
      return null;
    }
  }
  return payload || null;
}

function isDashboardPayload(value: any) {
  return Boolean(
    value &&
      typeof value === "object" &&
      value.window &&
      value.totals &&
      Array.isArray(value.workflows) &&
      Array.isArray(value.endpoints),
  );
}

function withCacheNote(payload: any, fallbackRow: CacheRow | null, requestedStart: string, requestedEnd: string) {
  if (!fallbackRow) return payload;
  const rowStart = String(fallbackRow.start_date || "");
  const rowEnd = String(fallbackRow.end_date || "");
  if (rowStart === requestedStart && rowEnd === requestedEnd) return payload;
  return {
    ...payload,
    message: `Showing latest cached window ${rowStart} to ${rowEnd}. Scheduled refresh will update this cache without blocking workflow workers.`,
  };
}

export async function main(start_date?: string, end_date?: string) {
  const today = dateInTimezone(new Date(), "Asia/Kolkata");
  const endDate = end_date || today;
  const startDate = start_date || addDays(endDate, -6);

  try {
    const sql = wmill.datatable("main");
    const exactRow = await sql`
      SELECT payload, generated_at, start_date::TEXT AS start_date, end_date::TEXT AS end_date
      FROM pipedrive_api_usage_dashboard_cache
      WHERE cache_key = ${`${startDate}:${endDate}`}
      LIMIT 1
    `.fetchOne();

    const fallbackRow = exactRow || await sql`
      SELECT payload, generated_at, start_date::TEXT AS start_date, end_date::TEXT AS end_date
      FROM pipedrive_api_usage_dashboard_cache
      ORDER BY generated_at DESC
      LIMIT 1
    `.fetchOne();

    const payload = payloadFrom(fallbackRow as CacheRow | null);
    if (isDashboardPayload(payload)) return withCacheNote(payload, fallbackRow as CacheRow | null, startDate, endDate);

    return emptyPayload(startDate, endDate, "Dashboard cache is empty. The scheduled cache refresh should populate it shortly.");
  } catch (error: any) {
    return emptyPayload(
      startDate,
      endDate,
      error?.message || "Dashboard cache could not be read.",
    );
  }
}
