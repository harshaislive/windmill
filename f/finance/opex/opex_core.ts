type Row = Record<string, any>;
type Action = "collectives" | "snapshots" | "dashboard" | "refresh" | "status" | "transactions";

declare const process: { env: Record<string, string | undefined> };

const ROOT = "f/finance/opex";
export const FISCAL_YEAR = {
  label: "FY 2026–27",
  from: "2026-04-01",
  to: "2027-03-31",
};

export type FiscalYear = {
  label: string;
  from: string;
  to: string;
  budgetSuffix: string;
};

function fiscalYearForStart(startYear: number): FiscalYear {
  const endYear = startYear + 1;
  const shortStart = String(startYear).slice(-2);
  const shortEnd = String(endYear).slice(-2);
  return {
    label: `FY ${startYear}–${shortEnd}`,
    from: `${startYear}-04-01`,
    to: `${endYear}-03-31`,
    budgetSuffix: `${shortStart}-${shortEnd}`,
  };
}

export function currentFiscalYear(): FiscalYear {
  const today = todayInKolkata();
  const year = Number(today.slice(0, 4));
  return fiscalYearForStart(today.slice(5) >= "04-01" ? year : year - 1);
}

export function supportedFiscalYears(): FiscalYear[] {
  const currentStart = Number(currentFiscalYear().from.slice(0, 4));
  return [0, 1].map((offset) => fiscalYearForStart(currentStart + offset));
}

export function resolveFiscalYear(requested = ""): FiscalYear {
  if (!requested) return currentFiscalYear();
  const match = requested.trim().match(/^FY\s+(\d{4})[–-](\d{2}|\d{4})$/i);
  if (!match) throw new Error("Choose a valid financial year.");
  const fiscalYear = fiscalYearForStart(Number(match[1]));
  const requestedEnd = match[2].length === 2 ? match[2] : match[2].slice(-2);
  if (requestedEnd !== fiscalYear.budgetSuffix.slice(-2)) {
    throw new Error("Choose a valid April-to-March financial year.");
  }
  return fiscalYear;
}

function isFiscalYearToDateRange(range: { fiscalYear: FiscalYear; from: string; to: string }) {
  const today = todayInKolkata();
  const cappedTo = range.fiscalYear.to < today ? range.fiscalYear.to : today;
  return range.from === range.fiscalYear.from && range.to === cappedTo;
}

export function reportRange(requestedFrom = "", requestedTo = "", requestedFiscalYear = "") {
  const fiscalYear = resolveFiscalYear(requestedFiscalYear);
  const today = todayInKolkata();
  const from = requestedFrom || fiscalYear.from;
  const to = requestedTo || (today < fiscalYear.to ? today : fiscalYear.to);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    throw new Error("Choose valid report dates.");
  }
  if (from < fiscalYear.from || from > fiscalYear.to || to < fiscalYear.from || to > fiscalYear.to) {
    throw new Error(`The date range must stay within ${fiscalYear.label} (${fiscalYear.from} to ${fiscalYear.to}).`);
  }
  if (from > to) throw new Error("The report start date must be on or before the end date.");
  if (to > today) throw new Error("The report end date cannot be later than today.");
  return { fiscalYear, from, to };
}
export const COMBINED_COLLECTIVES: Record<string, string[]> = {
  Bodakonda: ["Bodakonda", "Hospitality-Bodakonda"],
  "Poomaale 1.0": ["Poomaale 1.0", "Hospitality-Blyton"],
};
export const ABSORBED_LABELS = new Set(
  Object.values(COMBINED_COLLECTIVES)
    .flat()
    .filter((label) => !COMBINED_COLLECTIVES[label]),
);

export type Config = {
  accountsDomain: string;
  apiDomain: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  organizationId: string;
  readOnlyScopes: string;
};

let nextZohoRequestAt = 0;
let zohoRequestQueue = Promise.resolve();

async function scheduleZohoRequest(): Promise<void> {
  const previous = zohoRequestQueue;
  let release = () => {};
  zohoRequestQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  const delay = Math.max(0, nextZohoRequestAt - Date.now());
  if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
  nextZohoRequestAt = Date.now() + 2_500;
  release();
}

function windmillApiBase(): string {
  const base = (process.env.BASE_INTERNAL_URL || process.env.BASE_URL || "").replace(/\/+$/, "");
  if (!base) throw new Error("BASE_INTERNAL_URL or BASE_URL is required to read Windmill variables.");
  return base.endsWith("/api") ? base : `${base}/api`;
}

function windmillWorkspace(): string {
  return process.env.WM_WORKSPACE || process.env.WORKSPACE || process.env.WM_WORKSPACE_ID || "beforest-automations";
}

async function getWindmillVariable(path: string): Promise<string> {
  const token = process.env.WM_TOKEN;
  if (!token) throw new Error("WM_TOKEN is required to read Windmill variables.");
  const encodedPath = encodeURIComponent(path);
  const base = windmillApiBase();
  const workspace = windmillWorkspace();
  const candidates = [
    `${base}/w/${workspace}/variables/get_value/${encodedPath}`,
    `${base}/w/${workspace}/variables/get/${encodedPath}?decrypt_secret=true`,
  ];

  let lastError = "";
  for (const url of candidates) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) {
      const body = await response.text();
      const parsed = JSON.parse(body);
      if (url.includes("/get_value/")) {
        return typeof parsed === "string" ? parsed : String(parsed?.value ?? "");
      }
      return String(parsed?.value ?? "");
    }
    lastError = `${response.status} ${await response.text().catch(() => "")}`;
    if (response.status !== 404) break;
  }
  throw new Error(`Unable to read Windmill variable ${path}: ${lastError}`);
}

export async function queueOpexSnapshotSync(
  collectives: string[],
  from: string,
  to: string,
  fiscalYear: string,
  triggerMode: "scheduled" | "manual" = "manual",
  resumeAttempt = 0,
  scheduledInSeconds = 0,
): Promise<string> {
  const token = process.env.WM_TOKEN;
  if (!token) throw new Error("WM_TOKEN is required to start the OPEX snapshot sync.");
  const path = "f/finance/opex/sync_opex_snapshots";
  const query = scheduledInSeconds > 0 ? `?scheduled_in_secs=${scheduledInSeconds}` : "";
  const response = await fetch(
    `${windmillApiBase()}/w/${windmillWorkspace()}/jobs/run/p/${path}${query}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        collectives,
        from,
        to,
        fiscal_year: fiscalYear,
        trigger_mode: triggerMode,
        resume_attempt: resumeAttempt,
      }),
    },
  );
  const jobId = (await response.text()).trim();
  if (!response.ok) {
    throw new Error(`Unable to start the OPEX snapshot sync (${response.status}).`);
  }
  if (!jobId) throw new Error("Windmill did not return an OPEX snapshot sync job ID.");
  return jobId;
}

async function variable(name: string): Promise<string> {
  const value = (await getWindmillVariable(`${ROOT}/${name}`)).trim();
  if (!value) throw new Error(`Required Windmill variable is empty: ${ROOT}/${name}`);
  return value;
}

export async function config(): Promise<Config> {
  const [
    accountsDomain,
    apiDomain,
    clientId,
    clientSecret,
    refreshToken,
    organizationId,
    readOnlyScopes,
  ] = await Promise.all([
    variable("zoho_accounts_domain"),
    variable("zoho_api_domain"),
    variable("zoho_client_id"),
    variable("zoho_client_secret"),
    variable("zoho_refresh_token"),
    variable("zoho_organization_id"),
    variable("zoho_read_only_scopes"),
  ]);
  if (/(?:CREATE|UPDATE|DELETE|WRITE|ALL)(?:[,\s]|$)/i.test(readOnlyScopes)) {
    throw new Error("The configured Zoho scope declaration is not read-only.");
  }
  return {
    accountsDomain: accountsDomain.replace(/\/+$/, ""),
    apiDomain: apiDomain.replace(/\/+$/, ""),
    clientId,
    clientSecret,
    refreshToken,
    organizationId,
    readOnlyScopes,
  };
}

async function windmillApiPost(path: string, body: unknown) {
  const token = process.env.WM_TOKEN;
  if (!token) throw new Error("WM_TOKEN is required to access Windmill datatables.");
  const response = await fetch(`${windmillApiBase()}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Windmill datatable request failed (${response.status}).`);
  }
  return response.json();
}

function datatable() {
  return (strings: TemplateStringsArray, ...values: unknown[]) => {
    const args = Object.fromEntries(values.map((value, index) => [`arg${index + 1}`, value]));
    const comments = values.map((_, index) => `-- $${index + 1} arg${index + 1}`).join("\n");
    const placeholder = (value: unknown, nextChunk: string, index: number) => {
      if (nextChunk.trimStart().startsWith("::")) return `$${index + 1}`;
      if (typeof value === "number") {
        return Number.isInteger(value) ? `$${index + 1}::BIGINT` : `$${index + 1}::DOUBLE PRECISION`;
      }
      if (typeof value === "boolean") return `$${index + 1}::BOOLEAN`;
      if (value === null || value === undefined || typeof value === "string") return `$${index + 1}::TEXT`;
      return `$${index + 1}::JSONB`;
    };
    const content = strings.reduce(
      (query, chunk, index) =>
        query + chunk + (index < values.length ? placeholder(values[index], strings[index + 1], index) : ""),
      comments ? `${comments}\n\n` : "",
    );
    const run = () =>
      windmillApiPost(`/w/${windmillWorkspace()}/jobs/run_inline/preview`, {
        language: "postgresql",
        content,
        args: { ...args, database: "datatable://main" },
      });
    return {
      execute: run,
      fetch: run,
      async fetchOne() {
        const rows = await run();
        return Array.isArray(rows) ? rows[0] : rows;
      },
    };
  };
}

export async function ensureSnapshotTables() {
  const sql = datatable();
  await sql`
    CREATE TABLE IF NOT EXISTS opex_dashboard_snapshots (
      collective TEXT NOT NULL,
      fiscal_year TEXT NOT NULL,
      report_to DATE NOT NULL,
      refreshed_at TIMESTAMPTZ NOT NULL,
      synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sync_run_id TEXT NOT NULL,
      payload JSONB NOT NULL,
      PRIMARY KEY (collective, refreshed_at)
    );
    CREATE INDEX IF NOT EXISTS opex_dashboard_snapshots_latest_idx
      ON opex_dashboard_snapshots (collective, synced_at DESC);
    ALTER TABLE opex_dashboard_snapshots ADD COLUMN IF NOT EXISTS report_from DATE;
    UPDATE opex_dashboard_snapshots
      SET
        report_from = NULLIF(payload->>'from', '')::DATE,
        report_to = NULLIF(payload->>'to', '')::DATE
      WHERE
        NULLIF(payload->>'from', '') IS NOT NULL
        AND NULLIF(payload->>'to', '') IS NOT NULL
        AND (
          report_from IS NULL
          OR report_to IS NULL
          OR report_from = DATE '1970-01-01'
          OR report_to = DATE '1970-01-01'
        );
    CREATE INDEX IF NOT EXISTS opex_dashboard_snapshots_range_idx
      ON opex_dashboard_snapshots (collective, fiscal_year, report_from, report_to, synced_at DESC);
    CREATE TABLE IF NOT EXISTS opex_sync_runs (
      run_id TEXT PRIMARY KEY,
      started_at TIMESTAMPTZ NOT NULL,
      completed_at TIMESTAMPTZ,
      status TEXT NOT NULL,
      collectives_total INTEGER NOT NULL DEFAULT 0,
      collectives_succeeded INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      trigger_mode TEXT NOT NULL
    );
    ALTER TABLE opex_sync_runs ADD COLUMN IF NOT EXISTS collective TEXT;
    ALTER TABLE opex_sync_runs ADD COLUMN IF NOT EXISTS stage TEXT;
    ALTER TABLE opex_sync_runs ADD COLUMN IF NOT EXISTS items_total INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE opex_sync_runs ADD COLUMN IF NOT EXISTS items_completed INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE opex_sync_runs ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;
    ALTER TABLE opex_sync_runs ADD COLUMN IF NOT EXISTS resume_attempt INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE opex_sync_runs ADD COLUMN IF NOT EXISTS fiscal_year TEXT;
    ALTER TABLE opex_sync_runs ADD COLUMN IF NOT EXISTS report_from DATE;
    ALTER TABLE opex_sync_runs ADD COLUMN IF NOT EXISTS report_to DATE;
    CREATE INDEX IF NOT EXISTS opex_sync_runs_collective_idx
      ON opex_sync_runs (collective, started_at DESC);
    CREATE TABLE IF NOT EXISTS opex_sync_items (
      run_id TEXT NOT NULL,
      collective TEXT NOT NULL,
      account_id TEXT NOT NULL,
      account_name TEXT NOT NULL,
      status TEXT NOT NULL,
      error_message TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (run_id, collective, account_id)
    );
    CREATE INDEX IF NOT EXISTS opex_sync_items_progress_idx
      ON opex_sync_items (run_id, collective, status);
    CREATE TABLE IF NOT EXISTS opex_budget_cache (
      collective TEXT NOT NULL,
      fiscal_year TEXT NOT NULL,
      report_to DATE NOT NULL,
      budget_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      account_name TEXT NOT NULL,
      status TEXT NOT NULL,
      months JSONB,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (collective, fiscal_year, report_to, budget_id, account_id)
    );
    CREATE INDEX IF NOT EXISTS opex_budget_cache_lookup_idx
      ON opex_budget_cache (collective, fiscal_year, report_to, budget_id, status);
    CREATE TABLE IF NOT EXISTS opex_collectives_cache (
      collective TEXT PRIMARY KEY,
      cost_center_id TEXT NOT NULL,
      members JSONB NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS opex_collectives_cache_active_idx
      ON opex_collectives_cache (active, collective);
  `.execute();
}

export async function saveDashboardSnapshot(payload: Row, syncRunId: string) {
  await ensureSnapshotTables();
  const sql = datatable();
  await sql`
    INSERT INTO opex_dashboard_snapshots (
      collective, fiscal_year, report_from, report_to, refreshed_at, synced_at, sync_run_id, payload
    ) VALUES (
      ${String(payload.collective)},
      ${String(payload.fiscalYear)},
      (${payload}::JSONB->>'from')::DATE,
      (${payload}::JSONB->>'to')::DATE,
      ${String(payload.refreshedAt)}::TIMESTAMPTZ,
      NOW(),
      ${syncRunId},
      ${payload}::JSONB
    )
    ON CONFLICT (collective, refreshed_at) DO UPDATE SET
      fiscal_year = EXCLUDED.fiscal_year,
      report_from = EXCLUDED.report_from,
      report_to = EXCLUDED.report_to,
      synced_at = EXCLUDED.synced_at,
      sync_run_id = EXCLUDED.sync_run_id,
      payload = EXCLUDED.payload;
  `.execute();
}

function snapshotPayload(row: Row | undefined | null) {
  if (!row) return null;
  const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
  const syncedAt = String(row.synced_at || payload.refreshedAt || "");
  const ageMinutes = syncedAt ? Math.max(0, Math.floor((Date.now() - new Date(syncedAt).getTime()) / 60_000)) : null;
  return {
    ...payload,
    snapshot: {
      syncedAt,
      ageMinutes,
      isStale: ageMinutes == null || ageMinutes > 180,
      syncRunId: String(row.sync_run_id || ""),
    },
    source: {
      ...(payload.source || {}),
      mode: "Windmill PostgreSQL snapshot from read-only Zoho Books sync",
    },
  };
}

export async function readDashboardSnapshot(
  collective: string,
  fiscalYear = "",
  syncRunId = "",
  from = "",
  to = "",
) {
  await ensureSnapshotTables();
  const sql = datatable();
  const row = await sql`
    SELECT payload, synced_at, sync_run_id
    FROM opex_dashboard_snapshots
    WHERE collective = ${collective}
      AND (${fiscalYear} = '' OR fiscal_year = ${fiscalYear})
      AND (${syncRunId} = '' OR sync_run_id = ${syncRunId})
      AND (${from} = '' OR report_from = NULLIF(${from}, '')::DATE)
      AND (${to} = '' OR report_to = NULLIF(${to}, '')::DATE)
    ORDER BY synced_at DESC
    LIMIT 1
  `.fetchOne();
  return snapshotPayload(row);
}

export async function listSnapshotHistory(collective: string, fiscalYear: string) {
  await ensureSnapshotTables();
  const sql = datatable();
  const rows = (await sql`
    SELECT DISTINCT ON (sync_run_id)
      sync_run_id, fiscal_year, report_from, report_to, refreshed_at, synced_at, payload
    FROM opex_dashboard_snapshots
    WHERE collective = ${collective}
      AND (${fiscalYear} = '' OR fiscal_year = ${fiscalYear})
    ORDER BY sync_run_id, synced_at DESC
  `.fetch()) as Row[];
  return rows
    .map((row) => {
      const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
      return {
        runId: String(row.sync_run_id || ""),
        fiscalYear: String(row.fiscal_year || payload?.fiscalYear || ""),
        // Windmill's datatable preview can serialize PostgreSQL DATE values as
        // epoch timestamps. The JSON payload is the canonical report range.
        from: String(payload?.from || row.report_from || "").slice(0, 10),
        to: String(payload?.to || row.report_to || "").slice(0, 10),
        refreshedAt: String(row.refreshed_at || payload?.refreshedAt || ""),
        syncedAt: String(row.synced_at || ""),
        budgetStatus: String(payload?.quality?.budgetStatus || "not_available"),
      };
    })
    .sort((a, b) => b.syncedAt.localeCompare(a.syncedAt));
}

export async function listDashboardSnapshots() {
  await ensureSnapshotTables();
  const sql = datatable();
  const rows = (await sql`
    SELECT DISTINCT ON (collective)
      collective, payload, synced_at, sync_run_id
    FROM opex_dashboard_snapshots
    ORDER BY collective, synced_at DESC
  `.fetch()) as Row[];
  return rows.map((row) => snapshotPayload(row));
}

export async function cacheCollectives(costCenters: Row[]) {
  await ensureSnapshotTables();
  const entries = costCenters
    .filter((item) => item?.label && !ABSORBED_LABELS.has(String(item.label)))
    .map((item) => ({
      collective: String(item.label),
      cost_center_id: String(item.id),
      members: COMBINED_COLLECTIVES[String(item.label)] || [String(item.label)],
    }));
  const sql = datatable();
  await sql`
    UPDATE opex_collectives_cache SET active = FALSE;
    WITH incoming AS (
      SELECT *
      FROM jsonb_to_recordset(${entries}::JSONB)
        AS item(collective TEXT, cost_center_id TEXT, members JSONB)
    )
    INSERT INTO opex_collectives_cache (
      collective, cost_center_id, members, active, refreshed_at
    )
    SELECT collective, cost_center_id, members, TRUE, NOW()
    FROM incoming
    ON CONFLICT (collective) DO UPDATE SET
      cost_center_id = EXCLUDED.cost_center_id,
      members = EXCLUDED.members,
      active = TRUE,
      refreshed_at = NOW();
  `.execute();
  return entries.length;
}

export async function listCachedCollectives() {
  await ensureSnapshotTables();
  const sql = datatable();
  const rows = (await sql`
    SELECT
      directory.collective,
      directory.cost_center_id,
      directory.members,
      snapshot.payload,
      snapshot.synced_at
    FROM opex_collectives_cache AS directory
    LEFT JOIN LATERAL (
      SELECT payload, synced_at
      FROM opex_dashboard_snapshots
      WHERE collective = directory.collective
      ORDER BY synced_at DESC
      LIMIT 1
    ) AS snapshot ON TRUE
    WHERE directory.active = TRUE
    ORDER BY directory.collective
  `.fetch()) as Row[];
  return rows.map((row) => {
    const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
    const members = typeof row.members === "string" ? JSON.parse(row.members) : row.members;
    return {
      id: String(row.cost_center_id || row.collective),
      label: String(row.collective),
      members: Array.isArray(members) ? members.map(String) : [String(row.collective)],
      hasSnapshot: Boolean(row.synced_at),
      hasBudget: Boolean(payload?.budgetName),
      snapshotSyncedAt: row.synced_at ? String(row.synced_at) : null,
    };
  });
}

export async function writeSyncRun(run: Row) {
  await ensureSnapshotTables();
  const sql = datatable();
  await sql`
    INSERT INTO opex_sync_runs (
      run_id, started_at, completed_at, status, collectives_total,
      collectives_succeeded, error_message, trigger_mode, collective,
      stage, items_total, items_completed, next_retry_at, resume_attempt,
      fiscal_year, report_from, report_to
    ) VALUES (
      ${String(run.runId)},
      ${String(run.startedAt)}::TIMESTAMPTZ,
      ${run.completedAt ? String(run.completedAt) : null}::TIMESTAMPTZ,
      ${String(run.status)},
      ${Number(run.collectivesTotal || 0)},
      ${Number(run.collectivesSucceeded || 0)},
      ${run.errorMessage ? String(run.errorMessage) : null},
      ${String(run.triggerMode || "scheduled")},
      ${run.collective ? String(run.collective) : null},
      ${run.stage ? String(run.stage) : null},
      ${Number(run.itemsTotal || 0)},
      ${Number(run.itemsCompleted || 0)},
      ${run.nextRetryAt ? String(run.nextRetryAt) : null}::TIMESTAMPTZ,
      ${Number(run.resumeAttempt || 0)},
      ${run.fiscalYear ? String(run.fiscalYear) : null},
      ${run.from ? String(run.from) : null}::DATE,
      ${run.to ? String(run.to) : null}::DATE
    )
    ON CONFLICT (run_id) DO UPDATE SET
      completed_at = EXCLUDED.completed_at,
      status = EXCLUDED.status,
      collectives_total = EXCLUDED.collectives_total,
      collectives_succeeded = EXCLUDED.collectives_succeeded,
      error_message = EXCLUDED.error_message,
      collective = EXCLUDED.collective,
      stage = EXCLUDED.stage,
      items_total = EXCLUDED.items_total,
      items_completed = EXCLUDED.items_completed,
      next_retry_at = EXCLUDED.next_retry_at,
      resume_attempt = EXCLUDED.resume_attempt,
      fiscal_year = EXCLUDED.fiscal_year,
      report_from = EXCLUDED.report_from,
      report_to = EXCLUDED.report_to;
  `.execute();
}

export async function writeSyncItem(item: Row) {
  await ensureSnapshotTables();
  const sql = datatable();
  await sql`
    INSERT INTO opex_sync_items (
      run_id, collective, account_id, account_name, status, error_message, updated_at
    ) VALUES (
      ${String(item.runId)}, ${String(item.collective)}, ${String(item.accountId)},
      ${String(item.accountName || item.accountId)}, ${String(item.status)},
      ${item.errorMessage ? String(item.errorMessage) : null}, NOW()
    )
    ON CONFLICT (run_id, collective, account_id) DO UPDATE SET
      status = EXCLUDED.status,
      error_message = EXCLUDED.error_message,
      updated_at = NOW();
  `.execute();
}

export async function readLatestSyncStatus(collective: string, fiscalYear = "", from = "", to = "") {
  await ensureSnapshotTables();
  const sql = datatable();
  const row = await sql`
    SELECT run_id, started_at, completed_at, status, collective, stage,
      items_total, items_completed, next_retry_at, resume_attempt, error_message,
      fiscal_year, report_from, report_to
    FROM opex_sync_runs
    WHERE collective = ${collective}
      AND (${fiscalYear} = '' OR fiscal_year = ${fiscalYear})
      AND (${from} = '' OR report_from = NULLIF(${from}, '')::DATE)
      AND (${to} = '' OR report_to = NULLIF(${to}, '')::DATE)
    ORDER BY started_at DESC
    LIMIT 1
  `.fetchOne();
  if (!row) return null;
  return {
    runId: String(row.run_id || ""),
    startedAt: row.started_at ? String(row.started_at) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
    status: String(row.status || ""),
    collective: String(row.collective || collective),
    stage: String(row.stage || ""),
    itemsTotal: Number(row.items_total || 0),
    itemsCompleted: Number(row.items_completed || 0),
    nextRetryAt: row.next_retry_at ? String(row.next_retry_at) : null,
    resumeAttempt: Number(row.resume_attempt || 0),
    errorMessage: row.error_message ? String(row.error_message) : null,
    fiscalYear: row.fiscal_year ? String(row.fiscal_year) : null,
    from: row.report_from ? String(row.report_from).slice(0, 10) : null,
    to: row.report_to ? String(row.report_to).slice(0, 10) : null,
  };
}

function budgetCacheId(budgetId: string, from: string) {
  return `${budgetId}:${from}`;
}

async function readBudgetCache(
  collective: string,
  fiscalYear: string,
  budgetId: string,
  accountId: string,
  from: string,
  to: string,
) {
  await ensureSnapshotTables();
  const sql = datatable();
  const row = await sql`
    SELECT status, months, fetched_at
    FROM opex_budget_cache
    WHERE collective = ${collective}
      AND fiscal_year = ${fiscalYear}
      AND report_to = ${to}::DATE
      AND budget_id = ${budgetCacheId(budgetId, from)}
      AND account_id = ${accountId}
    LIMIT 1
  `.fetchOne();
  if (!row) return null;
  return {
    status: String(row.status || ""),
    months: typeof row.months === "string" ? JSON.parse(row.months) : row.months,
    fetchedAt: row.fetched_at ? String(row.fetched_at) : null,
  };
}

async function saveBudgetCache(
  collective: string,
  fiscalYear: string,
  budget: Row,
  account: Row,
  from: string,
  to: string,
  status: "complete" | "not_available",
  months: Row[] | null,
) {
  await ensureSnapshotTables();
  const sql = datatable();
  await sql`
    INSERT INTO opex_budget_cache (
      collective, fiscal_year, report_to, budget_id, account_id,
      account_name, status, months, fetched_at
    ) VALUES (
      ${collective}, ${fiscalYear}, ${to}::DATE, ${budgetCacheId(String(budget.id), from)},
      ${String(account.account_id)}, ${String(account.account_name || account.account_id)},
      ${status}, ${months}::JSONB, NOW()
    )
    ON CONFLICT (collective, fiscal_year, report_to, budget_id, account_id) DO UPDATE SET
      account_name = EXCLUDED.account_name,
      status = EXCLUDED.status,
      months = EXCLUDED.months,
      fetched_at = NOW();
  `.execute();
}

async function requirePasscode(input: string): Promise<void> {
  const configured = await variable("dashboard_passcode");
  if (!input || input.trim() !== configured) throw new Error("Invalid dashboard passcode.");
}

export async function accessToken(cfg: Config): Promise<string> {
  const response = await fetch(`${cfg.accountsDomain}/oauth/v2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: cfg.refreshToken,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new Error(`Zoho OAuth refresh failed (${response.status}).`);
  }
  return String(payload.access_token);
}

async function zohoGet(
  cfg: Config,
  token: string,
  path: string,
  query: Record<string, unknown> = {},
): Promise<Row> {
  const url = new URL(`${cfg.apiDomain}/books/v3${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await scheduleZohoRequest();
      const response = await fetch(url, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` },
        signal: AbortSignal.timeout(30_000),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) return payload;
      const detail = String(payload.message || payload.error || `HTTP ${response.status}`);
      const rateLimited =
        response.status === 429 ||
        /exceeded the maximum number of requests|blocked for some time|too many requests/i.test(detail);
      if (rateLimited) {
        const retryAfter = Math.min(
          90,
          Math.max(10, Number(response.headers.get("retry-after") || 65)),
        );
        const rateError = new Error(
          `Zoho Books rate limit reached. Retry in ${retryAfter} seconds.`,
        ) as Error & { status?: number; retryAfter?: number };
        rateError.status = 429;
        rateError.retryAfter = retryAfter;
        nextZohoRequestAt = Math.max(nextZohoRequestAt, Date.now() + retryAfter * 1000);
        throw rateError;
      }
      if (response.status >= 500 && attempt < 3) {
        lastError = new Error(`Zoho Books request failed (${response.status}).`);
        await new Promise((resolve) => setTimeout(resolve, 750 * 2 ** attempt));
        continue;
      }
      const error = new Error(`${detail} (${path}).`) as Error & { status?: number };
      error.status = response.status;
      throw error;
    } catch (error: any) {
      if (error?.status === 429) throw error;
      if (error?.status && error.status < 500 && error.status !== 429) throw error;
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 750 * 2 ** attempt));
    }
  }
  throw lastError || new Error(`Zoho Books request failed (${path}).`);
}

function todayInKolkata(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function monthlyRanges(from: string, to: string) {
  const ranges: Array<{ from: string; to: string; key: string; label: string }> = [];
  const first = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  let cursor = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1));
  while (cursor <= end) {
    const next = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    const monthEnd = new Date(Math.min(next.getTime() - 86_400_000, end.getTime()));
    ranges.push({
      from: cursor < first ? from : cursor.toISOString().slice(0, 10),
      to: monthEnd.toISOString().slice(0, 10),
      key: cursor.toISOString().slice(0, 7),
      label: new Intl.DateTimeFormat("en-IN", {
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      }).format(cursor),
    });
    cursor = next;
  }
  return ranges;
}

function isOpexAccount(name = ""): boolean {
  return /^(?:opex|hosp(?:itality)?[\s-]*opex)(?:\s*[-:]|\s)/i.test(name.trim());
}

function hospitalityLabel(name = ""): string {
  return name.trim().replace(/^hosp(?:itality)?[\s-]*opex\s*[-:]?\s*/i, "").trim();
}

function budgetCollective(name = ""): string {
  return name
    .replace(/\s+ABH\+OPEX\s+\(\d{2}-\d{2}\)$/i, "")
    .replace(/\(New\)/i, "New")
    .replace(/\s+/g, " ")
    .trim();
}

function budgetAlias(costCenter: string): string {
  return (
    {
      Mumbai: "Mumbai New",
      "Poomaale 1.0": "Poomale 1.0",
      "Poomaale 2.0": "Poomale 2.0",
    } as Record<string, string>
  )[costCenter] || costCenter;
}

function costCenterRule(ids: string | string[]): string {
  return JSON.stringify({
    columns: [
      {
        index: 1,
        field: "tag_option_id1",
        value: (Array.isArray(ids) ? ids : [ids]).map(String),
        comparator: "in",
        group: "reporting_tag",
      },
    ],
    criteria_string: "1",
  });
}

async function mapLimit<T, R>(items: T[], limit: number, mapper: (item: T, index: number) => Promise<R>) {
  const output = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return output;
}

async function getAccounts(cfg: Config, token: string): Promise<Row[]> {
  const payload = await zohoGet(cfg, token, "/chartofaccounts", {
    organization_id: cfg.organizationId,
  });
  return (payload.chartofaccounts || []).filter((account: Row) => account.is_active !== false);
}

export async function getCostCenters(cfg: Config, token: string) {
  const tags = await zohoGet(cfg, token, "/reportingtags", {
    organization_id: cfg.organizationId,
  });
  const allTags = tags.reporting_tags || tags.reportingtags || tags.tags || [];
  const tag = allTags.find(
    (item: Row) =>
      item.is_active !== false &&
      /^cost\s+cent(?:er|re)$/i.test(String(item.tag_name || "").trim()),
  );
  if (!tag) throw new Error("Zoho Books has no active Cost Center reporting tag.");
  const options = await zohoGet(
    cfg,
    token,
    `/reportingtags/${encodeURIComponent(tag.tag_id)}/options/all`,
    {
      organization_id: cfg.organizationId,
      tag_id: tag.tag_id,
      show_untagged: false,
    },
  );
  return (options.results || options.options || options.reporting_tag_options || [])
    .filter(
      (option: Row) =>
        String(option.option_id || "").toLowerCase() !== "untagged" &&
        String(option.option_name || "").trim(),
    )
    .map((option: Row) => ({
      id: String(option.option_id),
      label: String(option.option_name).trim(),
    }));
}

async function getBudgets(cfg: Config, token: string, accounts: Row[], fiscalYear: FiscalYear) {
  const seed =
    accounts.find((account) => account.account_name === "OPEX-Crop Management") ||
    accounts.find((account) => isOpexAccount(String(account.account_name || "")));
  if (!seed) throw new Error("No active OPEX account was found in Zoho Books.");
  const payload = await zohoGet(
    cfg,
    token,
    `/registers/${encodeURIComponent(seed.account_id)}/budgetvsactuals`,
    {
      organization_id: cfg.organizationId,
      filter_by: "TransactionDate.CustomDate",
      from_date: fiscalYear.from,
      to_date: fiscalYear.to,
      period: "monthly",
    },
  );
  return (payload.register_budget_vs_actual?.budget_info_list || [])
    .filter((budget: Row) => String(budget.name || "").toLowerCase().endsWith(`abh+opex (${fiscalYear.budgetSuffix})`))
    .map((budget: Row) => ({
      id: String(budget.id),
      name: String(budget.name),
      label: budgetCollective(String(budget.name)),
    }));
}

function findBudget(budgets: Row[], costCenter: string): Row | null {
  const alias = budgetAlias(costCenter).toLowerCase();
  return budgets.find((budget) => String(budget.label).toLowerCase() === alias) || null;
}

function collectPnlRows(nodes: Row[], accountMap: Map<string, Row>, rows: Row[] = []): Row[] {
  for (const node of nodes || []) {
    const name = String(node.name || "").trim();
    const accountId = node.account_id ? String(node.account_id) : "";
    if (accountId && isOpexAccount(name)) {
      rows.push({
        accountId,
        name,
        accountType: accountMap.get(accountId)?.account_type || "expense",
        actual: Number(node.total || 0),
      });
    } else if (Array.isArray(node.account_transactions)) {
      collectPnlRows(node.account_transactions, accountMap, rows);
    }
  }
  return rows;
}

async function getPnl(
  cfg: Config,
  token: string,
  costCenterId: string,
  accounts: Row[],
  from: string,
  to: string,
) {
  const payload = await zohoGet(cfg, token, "/reports/profitandloss", {
    organization_id: cfg.organizationId,
    from_date: from,
    to_date: to,
    cash_based: false,
    rule: costCenterRule(costCenterId),
  });
  const accountMap = new Map(accounts.map((account) => [String(account.account_id), account]));
  const rows = collectPnlRows(payload.profit_and_loss || [], accountMap);
  return { rows, actual: rows.reduce((sum, row) => sum + Number(row.actual || 0), 0) };
}

function budgetMonthKey(period: string): string {
  const date = new Date(`${period.replace(" ", " 1, ")} UTC`);
  return Number.isNaN(date.getTime()) ? period : date.toISOString().slice(0, 7);
}

async function getAccountBudget(
  cfg: Config,
  token: string,
  collective: string,
  account: Row,
  budget: Row,
  fiscalYear: FiscalYear,
  from: string,
  to: string,
  runId = "",
) {
  const accountId = String(account.account_id);
  const accountName = String(account.account_name || accountId);
  const cached = await readBudgetCache(collective, fiscalYear.label, String(budget.id), accountId, from, to);
  if (cached?.status === "complete") {
    if (runId) {
      await writeSyncItem({ runId, collective, accountId, accountName, status: "complete" });
    }
    return { accountId, months: cached.months || [], cached: true };
  }
  if (cached?.status === "not_available") {
    if (runId) {
      await writeSyncItem({ runId, collective, accountId, accountName, status: "not_available" });
    }
    return null;
  }
  if (runId) {
    await writeSyncItem({ runId, collective, accountId, accountName, status: "running" });
  }
  try {
    const payload = await zohoGet(
      cfg,
      token,
      `/registers/${encodeURIComponent(account.account_id)}/budgetvsactuals`,
      {
        organization_id: cfg.organizationId,
        budget_id: budget.id,
        filter_by: "TransactionDate.CustomDate",
        from_date: from,
        to_date: to,
        period: "monthly",
      },
    );
    const rows =
      payload.register_budget_vs_actual?.budget_vs_actuals?.detailed_budget_vs_actual || [];
    if (!rows.length) {
      await saveBudgetCache(collective, fiscalYear.label, budget, account, from, to, "not_available", null);
      if (runId) {
        await writeSyncItem({ runId, collective, accountId, accountName, status: "not_available" });
      }
      return null;
    }
    const months = rows.map((row: Row) => ({
        key: budgetMonthKey(String(row.period || "")),
        budget: Number(row.budget_value || 0),
      }));
    await saveBudgetCache(collective, fiscalYear.label, budget, account, from, to, "complete", months);
    if (runId) {
      await writeSyncItem({ runId, collective, accountId, accountName, status: "complete" });
    }
    return { accountId, months, cached: false };
  } catch (error: any) {
    if ([400, 404].includes(Number(error?.status))) {
      await saveBudgetCache(collective, fiscalYear.label, budget, account, from, to, "not_available", null);
      if (runId) {
        await writeSyncItem({ runId, collective, accountId, accountName, status: "not_available" });
      }
      return null;
    }
    if (runId) {
      await writeSyncItem({
        runId,
        collective,
        accountId,
        accountName,
        status: error?.status === 429 ? "paused" : "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
    throw error;
  }
}

type ComponentContext = {
  label: string;
  costCenter: Row;
  budget: Row | null;
  accounts: Row[];
  candidates: Row[];
  pnl: Row;
  monthlyPnl: Row[];
};

async function prepareComponentActuals(
  cfg: Config,
  token: string,
  label: string,
  from: string,
  to: string,
  accounts: Row[],
  costCenters: Row[],
  budgets: Row[],
) {
  const costCenter = costCenters.find(
    (item) => String(item.label).toLowerCase() === label.toLowerCase(),
  );
  if (!costCenter) throw new Error(`Unknown Cost Center: ${label}`);
  const budget = findBudget(budgets, label);
  const ranges = monthlyRanges(from, to);
  const [pnl, monthlyPnl] = await Promise.all([
    getPnl(cfg, token, costCenter.id, accounts, from, to),
    mapLimit(ranges, 3, async (range) => ({
      ...range,
      ...(await getPnl(cfg, token, costCenter.id, accounts, range.from, range.to)),
    })),
  ]);
  const pnlAccountIds = new Set(pnl.rows.map((row: Row) => String(row.accountId)));
  const candidates = accounts.filter(
    (account) =>
      pnlAccountIds.has(String(account.account_id)) &&
      isOpexAccount(String(account.account_name || "")) &&
      account.is_active !== false &&
      ["expense", "cost_of_goods_sold", "other_expense"].includes(account.account_type),
  );
  return { label, costCenter, budget, accounts, candidates, pnl, monthlyPnl } as ComponentContext;
}

function buildComponentDashboard(
  context: ComponentContext,
  fiscalYear: FiscalYear,
  from: string,
  to: string,
  budgetAccounts: Row[],
  budgetStatus: "loading" | "complete" | "not_available",
) {
  const { label, costCenter, budget, accounts, candidates, pnl, monthlyPnl } = context;
  const budgetByAccount = new Map<string, number>();
  const budgetByMonth = new Map<string, number>();
  for (const item of budgetAccounts.filter(Boolean) as Row[]) {
    budgetByAccount.set(
      item.accountId,
      item.months.reduce((sum: number, month: Row) => sum + Number(month.budget || 0), 0),
    );
    for (const month of item.months) {
      budgetByMonth.set(
        month.key,
        Number(budgetByMonth.get(month.key) || 0) + Number(month.budget || 0),
      );
    }
  }
  const pnlByAccount = new Map<string, Row>(
    (pnl.rows as Row[]).map((row: Row): [string, Row] => [String(row.accountId), row]),
  );
  const categoryIds = new Set([...pnlByAccount.keys(), ...budgetByAccount.keys()]);
  const categories = [...categoryIds].map((accountId) => {
    const actualRow = pnlByAccount.get(accountId);
    const account = accounts.find((item) => String(item.account_id) === accountId);
    return {
      accountId,
      name: actualRow?.name || account?.account_name || accountId,
      accountType: actualRow?.accountType || account?.account_type || "expense",
      budget: Number(budgetByAccount.get(accountId) || 0),
      actual: Number(actualRow?.actual || 0),
      costCenterLabels: [label],
      categoryKey: `${label}:${accountId}`,
    };
  });
  const actual = categories.reduce((sum, item) => sum + item.actual, 0);
  const planned = categories.reduce((sum, item) => sum + item.budget, 0);
  const sortedCategories = categories
    .map((item) => ({ ...item, share: actual ? item.actual / actual : 0 }))
    .filter((item) => item.actual !== 0 || item.budget !== 0)
    .sort((a, b) => b.actual - a.actual);
  const months = monthlyPnl.map((month) => {
    const actualValue = Number(month.actual || 0);
    const budgetValue = Number(budgetByMonth.get(month.key) || 0);
    return {
      key: month.key,
      label: month.label,
      budget: budgetValue,
      actual: actualValue,
      variance: budgetValue - actualValue,
      utilization: budgetValue ? actualValue / budgetValue : null,
    };
  });
  return {
    collective: label,
    costCenterId: costCenter.id,
    budgetName: budget?.name || null,
    fiscalYear: fiscalYear.label,
    from,
    to,
    refreshedAt: new Date().toISOString(),
    metrics: {
      actual,
      budget: planned,
      variance: planned - actual,
      utilization: planned ? actual / planned : null,
      activeCategories: sortedCategories.filter((item) => item.actual !== 0).length,
    },
    months,
    categories: sortedCategories,
    quality: {
      candidateAccounts: candidates.length,
      includedAccounts: pnl.rows.length,
      unavailableAccounts: sortedCategories.filter(
        (item) => item.actual !== 0 && item.budget === 0,
      ).length,
      status: budget ? "cost-center-pnl-with-live-budget" : "cost-center-pnl-only",
      budgetSource:
        budgetStatus === "loading"
          ? "loading-from-read-only-api"
          : budgetStatus === "complete"
            ? "live-read-only-api"
            : "not-available",
      budgetStatus,
      checkpointedAccounts: budgetAccounts.length,
    },
  };
}

async function completeComponentBudgets(
  cfg: Config,
  token: string,
  context: ComponentContext,
  fiscalYear: FiscalYear,
  from: string,
  to: string,
  runId: string,
  onProgress?: (completed: number, total: number, label: string) => Promise<void>,
  onCheckpoint?: (part: Row) => Promise<void>,
) {
  if (!context.budget) {
    return buildComponentDashboard(context, fiscalYear, from, to, [], "not_available");
  }
  const results: Row[] = [];
  let completed = 0;
  for (const account of context.candidates) {
    const result = await getAccountBudget(
      cfg,
      token,
      context.label,
      account,
      context.budget,
      fiscalYear,
      from,
      to,
      runId,
    );
    if (result) results.push(result);
    completed += 1;
    if (onProgress) await onProgress(completed, context.candidates.length, context.label);
    if (onCheckpoint && (completed % 5 === 0 || completed === context.candidates.length)) {
      await onCheckpoint(
        buildComponentDashboard(
          context,
          fiscalYear,
          from,
          to,
          results,
          completed === context.candidates.length ? "complete" : "loading",
        ),
      );
    }
  }
  return buildComponentDashboard(context, fiscalYear, from, to, results, "complete");
}

function mergeDashboards(collective: string, parts: Row[], fiscalYear: FiscalYear, from: string) {
  const categoryMap = new Map<string, Row>();
  for (const [partIndex, part] of parts.entries()) {
    for (const category of part.categories || []) {
      const key = `${part.collective}:${category.accountId}`;
      categoryMap.set(key, {
        ...category,
        name:
          partIndex > 0
            ? `Hosp OPEX: ${hospitalityLabel(category.name) || category.name}`
            : category.name,
        categoryKey: key,
        categoryGroup: partIndex > 0 ? "Hosp OPEX" : "Core OPEX",
      });
    }
  }
  const actual = [...categoryMap.values()].reduce(
    (sum, item) => sum + Number(item.actual || 0),
    0,
  );
  const categories: Row[] = [...categoryMap.values()]
    .map((item: Row): Row => ({ ...item, share: actual ? Number(item.actual || 0) / actual : 0 }))
    .sort((a: Row, b: Row) => Number(b.actual || 0) - Number(a.actual || 0));
  const monthMap = new Map<string, Row>();
  for (const part of parts) {
    for (const month of part.months || []) {
      const current = monthMap.get(month.key) || {
        key: month.key,
        label: month.label,
        budget: 0,
        actual: 0,
      };
      current.budget += Number(month.budget || 0);
      current.actual += Number(month.actual || 0);
      monthMap.set(month.key, current);
    }
  }
  const months: Row[] = [...monthMap.values()]
    .map((month: Row): Row => ({
      ...month,
      variance: month.budget - month.actual,
      utilization: month.budget ? month.actual / month.budget : null,
    }))
    .sort((a: Row, b: Row) => String(a.key).localeCompare(String(b.key)));
  const planned = categories.reduce((sum, item) => sum + Number(item.budget || 0), 0);
  return {
    collective,
    memberCollectives: parts.map((part) => part.collective),
    budgetName: parts.map((part) => part.budgetName).filter(Boolean).join(" + ") || null,
    fiscalYear: fiscalYear.label,
    from,
    to: parts[0]?.to,
    refreshedAt: new Date().toISOString(),
    metrics: {
      actual,
      budget: planned,
      variance: planned - actual,
      utilization: planned ? actual / planned : null,
      activeCategories: categories.filter((item) => item.actual !== 0).length,
    },
    months,
    categories,
    quality: {
      candidateAccounts: Math.max(...parts.map((part) => part.quality.candidateAccounts)),
      includedAccounts: categories.filter((item) => item.actual !== 0).length,
      unavailableAccounts: categories.filter(
        (item) => item.actual !== 0 && item.budget === 0,
      ).length,
      status: "combined-cost-center-pnl",
      budgetSource: parts.some((part) => part.quality.budgetSource === "live-read-only-api")
        ? "live-read-only-api"
        : parts.some((part) => part.quality.budgetStatus === "loading")
          ? "loading-from-read-only-api"
          : "not-available",
      budgetStatus: parts.every((part) => part.quality.budgetStatus === "complete")
        ? "complete"
        : parts.some((part) => part.quality.budgetStatus === "loading")
          ? "loading"
          : "not_available",
      checkpointedAccounts: parts.reduce(
        (sum, part) => sum + Number(part.quality.checkpointedAccounts || 0),
        0,
      ),
    },
  };
}

function sourcedDashboard(result: Row, mode: string): Row {
  return {
    ...result,
    source: {
      organization: "Beforest Lifestyle Solutions Private Limited",
      endpoint: "Zoho Books Profit and Loss by Cost Center + Budget vs Actuals",
      mode,
    },
  };
}

export async function dashboard(
  cfg: Config,
  token: string,
  collective: string,
  requestedFrom: string,
  requestedTo: string,
  requestedFiscalYear: string,
  syncContext: Row = {},
) {
  if (!collective.trim()) throw new Error("Select a collective.");
  const { fiscalYear, from, to } = reportRange(requestedFrom, requestedTo, requestedFiscalYear);
  const [accounts, costCenters] = await Promise.all([
    getAccounts(cfg, token),
    getCostCenters(cfg, token),
  ]);
  const budgets = await getBudgets(cfg, token, accounts, fiscalYear);
  const labels = COMBINED_COLLECTIVES[collective] || [collective];
  const contexts: ComponentContext[] = [];
  for (const label of labels) {
    contexts.push(await prepareComponentActuals(cfg, token, label, from, to, accounts, costCenters, budgets));
  }

  const parts: Row[] = contexts.map((context) =>
    buildComponentDashboard(
      context,
      fiscalYear,
      from,
      to,
      [],
      context.budget ? "loading" : "not_available",
    ),
  );
  const combine = () => (labels.length > 1 ? mergeDashboards(collective, parts, fiscalYear, from) : parts[0]);
  const runId = String(syncContext.runId || "");
  const startedAt = String(syncContext.startedAt || new Date().toISOString());
  const triggerMode = String(syncContext.triggerMode || "manual");
  const resumeAttempt = Number(syncContext.resumeAttempt || 0);
  const totalItems = contexts.reduce((sum, context) => sum + context.candidates.length, 0);
  let completedItems = 0;

  if (runId) {
    await saveDashboardSnapshot(
      sourcedDashboard(combine(), "Actuals ready; budget checkpoints loading from read-only Zoho Books"),
      runId,
    );
    await writeSyncRun({
      runId,
      startedAt,
      status: "running",
      collective,
      stage: "budgets",
      itemsTotal: totalItems,
      itemsCompleted: 0,
      collectivesTotal: 1,
      collectivesSucceeded: 0,
      triggerMode,
      resumeAttempt,
      fiscalYear: fiscalYear.label,
      from,
      to,
    });
  }

  for (let index = 0; index < contexts.length; index += 1) {
    const context = contexts[index];
    const beforeComponent = completedItems;
    parts[index] = await completeComponentBudgets(
      cfg,
      token,
      context,
      fiscalYear,
      from,
      to,
      runId,
      async (componentCompleted) => {
        completedItems = beforeComponent + componentCompleted;
        if (runId) {
          await writeSyncRun({
            runId,
            startedAt,
            status: "running",
            collective,
            stage: "budgets",
            itemsTotal: totalItems,
            itemsCompleted: completedItems,
            collectivesTotal: 1,
            collectivesSucceeded: 0,
            triggerMode,
            resumeAttempt,
            fiscalYear: fiscalYear.label,
            from,
            to,
          });
        }
      },
      async (checkpointPart) => {
        parts[index] = checkpointPart;
        if (runId) {
          await saveDashboardSnapshot(
            sourcedDashboard(combine(), "Checkpointed read-only Zoho Books sync in progress"),
            runId,
          );
        }
      },
    );
    completedItems = beforeComponent + context.candidates.length;
  }

  return sourcedDashboard(
    combine(),
    "Fresh read-only Zoho Books API with PostgreSQL budget checkpoints",
  );
}

function transactionTag(value: any): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(transactionTag).filter(Boolean).join(", ");
  return (
    value.option_name ||
    value.tag_option_name ||
    value.tag_option ||
    value.option_value ||
    value.name ||
    value.tag_name ||
    ""
  );
}

function titleCase(value = ""): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

async function transactions(
  cfg: Config,
  token: string,
  collective: string,
  accountId: string,
  categoryKey: string,
  costCenterLabels: string[],
  expectedActual: number,
  requestedFrom: string,
  requestedTo: string,
  requestedFiscalYear: string,
) {
  if (!accountId) throw new Error("Account ID is required.");
  const { fiscalYear, from, to } = reportRange(requestedFrom, requestedTo, requestedFiscalYear);
  const allCostCenters = await getCostCenters(cfg, token);
  const labels =
    costCenterLabels.length > 0
      ? costCenterLabels
      : categoryKey.includes(":")
        ? [categoryKey.slice(0, categoryKey.lastIndexOf(":"))]
        : COMBINED_COLLECTIVES[collective] || [collective];
  const selected = labels.map((label) =>
    allCostCenters.find((item) => item.label.toLowerCase() === label.toLowerCase()),
  );
  if (selected.some((item) => !item)) throw new Error("A Cost Center mapping is unavailable.");
  const selectedCostCenters = selected as Array<{ id: string; label: string }>;
  const rows: Row[] = [];
  const seen = new Set<string>();
  let pagesFetched = 0;
  for (const range of monthlyRanges(from, to)) {
    let page = 1;
    let hasMore = false;
    do {
      const payload = await zohoGet(
        cfg,
        token,
        `/registers/${encodeURIComponent(accountId)}/transactions`,
        {
          organization_id: cfg.organizationId,
          filter_by: "TransactionDate.CustomDate",
          from_date: range.from,
          to_date: range.to,
          account_id: accountId,
          rule: costCenterRule(selectedCostCenters.map((item) => item.id)),
          sort_column: "date",
          optional_columns: "net_amount",
          page,
          per_page: 200,
        },
      );
      pagesFetched += 1;
      const groups = payload.register_transactions?.account_transactions || [];
      const ledgerRows = groups.flatMap((group: Row) =>
        Array.isArray(group?.account_transactions) ? group.account_transactions : group ? [group] : [],
      );
      for (const row of ledgerRows) {
        if (String(row.account_id) !== String(accountId)) continue;
        const debit = Number(row.debit || row.debit_amount || 0);
        const credit = Number(row.credit || row.credit_amount || 0);
        const amount = debit - credit;
        if (!amount) continue;
        const lineId = String(
          row.register_details_id ||
            row.account_transaction_id ||
            row.line_item_id ||
            row.ledger_id ||
            "",
        );
        if (lineId) {
          const key = `${accountId}:${lineId}`;
          if (seen.has(key)) continue;
          seen.add(key);
        }
        rows.push({
          id: lineId || String(row.transaction_id || ""),
          date: row.date || row.transaction_date || "",
          detail: row.transaction_details || row.description || "",
          type: row.transaction_type_formatted || titleCase(row.transaction_type),
          entityNumber: row.entity_number || "",
          reference: row.reference_number || "",
          branch: row.branch?.location_name || "",
          reportingTag: transactionTag(row.reporting_tag) || labels.join(" + "),
          amount,
          currency: row.currency_code || "INR",
        });
      }
      hasMore = Boolean(payload.page_context?.has_more_page);
      page += 1;
      if (page > 50 && hasMore) {
        throw new Error("Transaction detail exceeds the safe pagination limit.");
      }
    } while (hasMore);
  }
  rows.sort(
    (a, b) =>
      String(b.date).localeCompare(String(a.date)) || String(b.id).localeCompare(String(a.id)),
  );
  const transactionActual = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  if (Number.isFinite(expectedActual) && Math.abs(transactionActual - expectedActual) >= 0.01) {
    throw new Error(
      `Transaction rows did not reconcile to the selected category (${rows.length} filtered rows).`,
    );
  }
  return {
    collective,
    accountId,
    fiscalYear: fiscalYear.label,
    from,
    to,
    expectedActual,
    transactionActual,
    reconciles: true,
    transactions: rows,
    pagesFetched,
    scope: {
      costCenters: labels,
      filtering: "Zoho server-side reporting-tag rule",
    },
    source: {
      organization: "Beforest Lifestyle Solutions Private Limited",
      endpoint: "Zoho Books Registers — Transactions",
      mode: "Fresh read-only API",
    },
    refreshedAt: new Date().toISOString(),
  };
}

export async function main(
  action: Action = "collectives",
  dashboard_passcode = "",
  collective = "",
  from = "",
  to = "",
  fiscal_year = "",
  snapshot_run_id = "",
  account_id = "",
  category_key = "",
  cost_center_labels: string[] = [],
  expected_actual = Number.NaN,
) {
  await requirePasscode(dashboard_passcode);
  if (action === "collectives") {
    let collectives = await listCachedCollectives();
    if (!collectives.length) {
      const cfg = await config();
      const token = await accessToken(cfg);
      const costCenters = await getCostCenters(cfg, token);
      await cacheCollectives(costCenters);
      collectives = await listCachedCollectives();
    }
    return {
      fiscalYear: currentFiscalYear(),
      fiscalYears: supportedFiscalYears(),
      collectives,
      sourceMode: "windmill-postgresql-collective-directory",
    };
  }
  if (action === "snapshots") {
    const selectedFiscalYear = resolveFiscalYear(fiscal_year).label;
    return {
      fiscalYear: selectedFiscalYear,
      snapshots: await listSnapshotHistory(collective, selectedFiscalYear),
    };
  }
  if (action === "dashboard") {
    const selectedFiscalYear = fiscal_year ? resolveFiscalYear(fiscal_year).label : "";
    const range = from || to ? reportRange(from, to, fiscal_year) : null;
    let snapshot = await readDashboardSnapshot(
      collective,
      range?.fiscalYear.label || selectedFiscalYear,
      snapshot_run_id,
      range?.from || "",
      range?.to || "",
    );
    if (!snapshot && range && !snapshot_run_id && isFiscalYearToDateRange(range)) {
      snapshot = await readDashboardSnapshot(
        collective,
        range.fiscalYear.label,
        "",
        "",
        "",
      );
    }
    if (!snapshot) {
      const detail = range ? ` for ${range.from} to ${range.to}` : "";
      throw new Error(`No OPEX snapshot is available for ${collective}${detail}. Use Sync from Zoho to create one.`);
    }
    return snapshot;
  }
  if (action === "status") {
    const range = reportRange(from, to, fiscal_year);
    const [data, sync] = await Promise.all([
      readDashboardSnapshot(collective, range.fiscalYear.label, "", range.from, range.to),
      readLatestSyncStatus(collective, range.fiscalYear.label, range.from, range.to),
    ]);
    return { data, sync };
  }
  if (action === "refresh") {
    const range = reportRange(from, to, fiscal_year);
    const snapshot = await readDashboardSnapshot(
      collective, range.fiscalYear.label, "", range.from, range.to,
    );
    const jobId = await queueOpexSnapshotSync(
      [collective], range.from, range.to, range.fiscalYear.label, "manual", 0, 0,
    );
    if (!snapshot) {
      return {
        collective,
        refresh: { status: "queued", jobId },
        pendingInitialSnapshot: true,
      };
    }
    return {
      ...snapshot,
      refresh: { status: "queued", jobId },
    };
  }
  const cfg = await config();
  const token = await accessToken(cfg);
  if (action === "transactions") {
    return transactions(
      cfg,
      token,
      collective,
      account_id,
      category_key,
      cost_center_labels,
      Number(expected_actual),
      from,
      to,
      fiscal_year,
    );
  }
  throw new Error(`Unsupported action: ${action}`);
}
