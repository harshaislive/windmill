import * as wmill from "windmill-client";

const DASHBOARD_PASSCODE_PATH = "f/marketing/instagram/dashboard_passcode";
const SYNC_SCRIPT_PATH = "f/marketing/instagram/sync_ig_dashboard_snapshot";
const MAX_SINGLE_WINDOW_DAYS = 30;
const MAX_CALENDAR_MONTH_DAYS = 31;

async function requireDashboardPasscode(input: string): Promise<void> {
  const configured = (await wmill.getVariable(DASHBOARD_PASSCODE_PATH)).trim();
  if (!configured) throw new Error(`Dashboard passcode is not configured: ${DASHBOARD_PASSCODE_PATH}`);
  if (!input || input.trim() !== configured) throw new Error("Invalid dashboard passcode.");
}

async function ensureTables(sql: any) {
  await sql`
    CREATE TABLE IF NOT EXISTS instagram_sync_runs (
      sync_run_id TEXT PRIMARY KEY,
      snapshot_date DATE NOT NULL,
      window_start DATE NOT NULL,
      window_end DATE NOT NULL,
      status TEXT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL,
      completed_at TIMESTAMPTZ,
      error TEXT,
      counts JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `.execute();
  await sql`CREATE INDEX IF NOT EXISTS instagram_sync_runs_status_date_idx ON instagram_sync_runs (status, snapshot_date DESC, completed_at DESC)`.execute();

  await sql`
    CREATE TABLE IF NOT EXISTS instagram_dashboard_snapshots (
      snapshot_key TEXT PRIMARY KEY,
      sync_run_id TEXT NOT NULL,
      snapshot_date DATE NOT NULL,
      window_start DATE NOT NULL,
      window_end DATE NOT NULL,
      generated_at TIMESTAMPTZ NOT NULL,
      funnel_payload JSONB NOT NULL,
      comments_payload JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `.execute();
  await sql`CREATE INDEX IF NOT EXISTS instagram_dashboard_snapshots_date_idx ON instagram_dashboard_snapshots (snapshot_date DESC, generated_at DESC)`.execute();
}

function snapshotKeyFor(snapshotDate: string, startDate: string, endDate: string) {
  if (snapshotDate.startsWith("date:") || snapshotDate.startsWith("window:")) return snapshotDate;
  if (snapshotDate) return `date:${snapshotDate}`;
  if (startDate && endDate) return `window:${startDate}:${endDate}`;
  return "latest";
}

function daysInclusive(startDate: string, endDate: string) {
  if (!startDate || !endDate) return 0;
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.round((end - start) / 86_400_000) + 1;
}

function todayInKolkata() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function isFullCalendarMonth(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (start.getUTCDate() !== 1 || start.getUTCFullYear() !== end.getUTCFullYear() || start.getUTCMonth() !== end.getUTCMonth()) return false;
  const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  return end.getUTCDate() === lastDay;
}

function validateWindow(startDate: string, endDate: string) {
  if (!startDate && !endDate) return null;
  if (!startDate || !endDate) return "Choose both a start date and an end date.";
  const days = daysInclusive(startDate, endDate);
  if (!days) return "The end date must be on or after the start date.";
  const supportedCalendarMonth = days === MAX_CALENDAR_MONTH_DAYS && isFullCalendarMonth(startDate, endDate);
  if (days > MAX_SINGLE_WINDOW_DAYS && !supportedCalendarMonth) return `Choose 30 days or fewer, or select one complete calendar month. A 31-day month is fetched safely in two Meta requests.`;
  if (endDate >= todayInKolkata()) return "Choose an end date before today. Instagram Insights for today are incomplete.";
  return null;
}

async function fetchSnapshot(sql: any, snapshotKey: string) {
  return await sql`
    SELECT * FROM instagram_dashboard_snapshots
    WHERE snapshot_key = ${snapshotKey}
    LIMIT 1
  `.fetchOne();
}

async function availableSnapshots(sql: any) {
  return await sql`
    SELECT snapshot_key, snapshot_date, window_start, window_end, generated_at
    FROM instagram_dashboard_snapshots
    WHERE snapshot_key LIKE 'window:%'
    ORDER BY window_end DESC, generated_at DESC
    LIMIT 120
  `.fetch();
}

export async function main(
  snapshot_date = "",
  start_date = "",
  end_date = "",
  dashboard_passcode = "",
  fetch_if_missing = false,
) {
  await requireDashboardPasscode(dashboard_passcode);
  const sql = wmill.datatable();
  await ensureTables(sql);

  const validationMessage = snapshot_date ? null : validateWindow(start_date, end_date);
  const snapshots = await availableSnapshots(sql);
  if (validationMessage) {
    return {
      ready: false,
      state: "invalid_range",
      message: validationMessage,
      requestedWindow: { start_date, end_date },
      availableSnapshots: snapshots,
    };
  }

  const requestedKey = snapshotKeyFor(snapshot_date, start_date, end_date);
  let row = await fetchSnapshot(sql, requestedKey);
  let fetchedOnDemand = false;

  if (!row && fetch_if_missing && !snapshot_date && start_date && end_date) {
    await wmill.runScriptByPath(SYNC_SCRIPT_PATH, {
      lookback_days: daysInclusive(start_date, end_date),
      end_date,
      timezone: "Asia/Kolkata",
      dry_run: false,
    });
    row = await fetchSnapshot(sql, requestedKey);
    fetchedOnDemand = true;
  }

  if (!row) {
    return {
      ready: false,
      state: "not_available",
      message: start_date && end_date
        ? `No stored Instagram data is available for ${start_date} to ${end_date}. Select Load to fetch this range from Meta.`
        : "No Instagram dashboard snapshot is available yet.",
      canFetch: Boolean(start_date && end_date && !snapshot_date),
      requestedWindow: { start_date, end_date },
      availableSnapshots: snapshots,
    };
  }

  const funnel = row.funnel_payload || {};
  const warnings = [...(Array.isArray(funnel.warnings) ? funnel.warnings : [])];
  return {
    ready: true,
    state: warnings.length ? "partial" : "ready",
    source: fetchedOnDemand ? "Meta API via Windmill, cached on demand" : "Windmill datatables",
    fetchedOnDemand,
    exactWindow: true,
    snapshotDate: row.snapshot_date,
    syncRunId: row.sync_run_id,
    generatedAt: row.generated_at,
    windowStart: row.window_start,
    windowEnd: row.window_end,
    requestedWindow: { start_date: start_date || row.window_start, end_date: end_date || row.window_end },
    displayedWindow: { start_date: row.window_start, end_date: row.window_end },
    funnel: {
      ...funnel,
      generated_at: row.generated_at,
      warnings,
    },
    comments: row.comments_payload,
    availableSnapshots: await availableSnapshots(sql),
  };
}
