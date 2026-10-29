import * as wmill from "windmill-client";

type Row = Record<string, any>;

const VARIABLE_ROOT = "f/finance/opex";
const FY = { label: "FY 2026–27", from: "2026-04-01", to: "2027-03-31" };
const DEPARTMENTS = [
  "Beforest Cafe", "Beforest EC-Landscaping", "Beforest EC-Office",
  "Content and Strategy", "Sales", "Admin", "BI", "CE", "EDT", "Finance",
  "HO", "HR", "Legal and Liason", "MO",
];
const BUDGET_IDS: Record<string, string> = {
  Admin: "2378403000016501334",
  BI: "2378403000016740171",
  CE: "2378403000016148463",
  EDT: "2378403000016148552",
};
const BUDGET_ACCOUNT_IDS: Record<string, string[]> = {
  Admin: [
    "2378403000000000528", "2378403000007195619", "2378403000000000498", "2378403000016505209",
    "2378403000000279055", "2378403000000000555", "2378403000000000525", "2378403000000000558",
    "2378403000016505159", "2378403000006964621", "2378403000018923003", "2378403000000000540",
    "2378403000016505176", "2378403000000030119", "2378403000021770270", "2378403000003301194",
    "2378403000021514059", "2378403000021770235", "2378403000016505155", "2378403000021770252",
    "2378403000016505282", "2378403000010292300", "2378403000016505180", "2378403000016505151",
    "2378403000010292132", "2378403000017179327",
  ],
  BI: ["2378403000000588157", "2378403000019700255"],
  CE: [
    "2378403000008244125", "2378403000000000516", "2378403000019452918", "2378403000022842056",
    "2378403000016148504", "2378403000016148512", "2378403000020088031", "2378403000019999145",
    "2378403000018117087", "2378403000018117116", "2378403000020088027", "2378403000000000540",
    "2378403000009963717", "2378403000020088070", "2378403000016148508",
  ],
  EDT: [
    "2378403000015112135", "2378403000000000546", "2378403000000000516",
    "2378403000000030105", "2378403000008852722",
  ],
};
const BUDGET_ACCOUNT_REFERENCES: Record<string, Record<string, { name: string; monthly: Record<string, number> }>> = {
  BI: {
    "2378403000000588157": {
      name: "Software & Tools Expenses",
      monthly: {
        "2026-04": 74548, "2026-05": 74548, "2026-06": 74548,
        "2026-07": 74548, "2026-08": 74548,
      },
    },
    "2378403000019700255": {
      name: "HO Advertisement & Marketing Expenses",
      monthly: {
        "2026-04": 275000, "2026-05": 275000, "2026-06": 275000,
        "2026-07": 275000, "2026-08": 275000,
      },
    },
  },
};

let nextRequestAt = 0;

async function pace() {
  const wait = Math.max(0, nextRequestAt - Date.now());
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  nextRequestAt = Date.now() + 850;
}

async function variable(name: string) {
  const value = (await wmill.getVariable(`${VARIABLE_ROOT}/${name}`)).trim();
  if (!value) throw new Error(`Missing Windmill variable ${VARIABLE_ROOT}/${name}`);
  return value;
}

async function config() {
  const [accountsDomain, apiDomain, clientId, clientSecret, refreshToken, organizationId, scopes] =
    await Promise.all([
      variable("zoho_accounts_domain"), variable("zoho_api_domain"),
      variable("zoho_client_id"), variable("zoho_client_secret"),
      variable("zoho_refresh_token"), variable("zoho_organization_id"),
      variable("zoho_read_only_scopes"),
    ]);
  if (/(?:CREATE|UPDATE|DELETE|WRITE|ALL)(?:[,\s]|$)/i.test(scopes)) {
    throw new Error("Zoho configuration must remain read-only.");
  }
  return { accountsDomain, apiDomain, clientId, clientSecret, refreshToken, organizationId };
}

async function accessToken(cfg: Awaited<ReturnType<typeof config>>) {
  const form = new URLSearchParams({
    refresh_token: cfg.refreshToken,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: "refresh_token",
  });
  const response = await fetch(`${cfg.accountsDomain.replace(/\/$/, "")}/oauth/v2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) throw new Error(`Zoho OAuth refresh failed (${response.status}).`);
  return String(payload.access_token);
}

async function zohoGet(
  cfg: Awaited<ReturnType<typeof config>>, token: string, path: string, query: Row = {},
  retryRateLimits = true,
) {
  const url = new URL(`${cfg.apiDomain.replace(/\/$/, "")}/books/v3${path}`);
  url.searchParams.set("organization_id", cfg.organizationId);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await pace();
    const response = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) return payload;
    const detail = String(payload.message || `Zoho request failed (${response.status})`);
    lastError = Object.assign(new Error(`${detail} [${path}]`), { status: response.status });
    if (response.status === 429 || /maximum number of requests|too many requests|blocked for some time/i.test(detail)) {
      if (!retryRateLimits) throw lastError;
      const retryAfter = Math.min(90, Math.max(15, Number(response.headers.get("retry-after") || 65)));
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
      continue;
    }
    if (response.status >= 500 && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
      continue;
    }
    throw lastError;
  }
  throw lastError || new Error(`Zoho request failed [${path}]`);
}

function todayKolkata() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function monthRanges(to: string) {
  const result: Array<{ key: string; from: string; to: string; label: string }> = [];
  const end = new Date(`${to}T00:00:00Z`);
  let cursor = new Date(`${FY.from}T00:00:00Z`);
  while (cursor <= end) {
    const next = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    const monthEnd = new Date(Math.min(next.getTime() - 86400000, end.getTime()));
    result.push({
      key: cursor.toISOString().slice(0, 7),
      from: cursor.toISOString().slice(0, 10),
      to: monthEnd.toISOString().slice(0, 10),
      label: new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric", timeZone: "UTC" }).format(cursor),
    });
    cursor = next;
  }
  return result;
}

function departmentRule(optionId: string) {
  return JSON.stringify({
    columns: [{ index: 1, field: "tag_option_id2", group: "reporting_tag", comparator: "in", value: [optionId] }],
    criteria_string: "1",
  });
}

function expenseAccount(account: Row) {
  const type = String(account.account_type || "").toLowerCase();
  return type.includes("expense") || type.includes("cost_of_goods") || type.includes("cost of goods");
}

function collectActuals(nodes: Row[], allowed: Set<string>, output = new Map<string, Row>()) {
  for (const node of nodes || []) {
    const id = String(node.account_id || "");
    if (id && allowed.has(id)) {
      const prior = output.get(id) || { account_id: id, name: String(node.name || id), actual: 0 };
      prior.actual += Number(node.total || node.amount || 0);
      output.set(id, prior);
    }
    for (const key of ["account_transactions", "accounts", "children"]) {
      if (Array.isArray(node[key])) collectActuals(node[key], allowed, output);
    }
  }
  return output;
}

function budgetMonthKey(period: string) {
  const parsed = new Date(`${period.replace(" ", " 1, ")} UTC`);
  return Number.isNaN(parsed.getTime()) ? period : parsed.toISOString().slice(0, 7);
}

async function ensureTables() {
  const sql = wmill.datatable("main");
  await sql`CREATE TABLE IF NOT EXISTS ho_expense_departments (
    option_id TEXT PRIMARY KEY, department TEXT NOT NULL UNIQUE, active BOOLEAN NOT NULL DEFAULT TRUE,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`.execute();
  await sql`CREATE TABLE IF NOT EXISTS ho_expense_snapshots (
    department TEXT NOT NULL, fiscal_year TEXT NOT NULL, period_key TEXT NOT NULL,
    report_from DATE NOT NULL, report_to DATE NOT NULL, payload JSONB NOT NULL,
    data_status TEXT NOT NULL, synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (department, fiscal_year, period_key)
  )`.execute();
  await sql`CREATE TABLE IF NOT EXISTS ho_expense_budget_cache (
    department TEXT NOT NULL, fiscal_year TEXT NOT NULL, account_id TEXT NOT NULL,
    account_name TEXT NOT NULL, months JSONB NOT NULL, status TEXT NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (department, fiscal_year, account_id)
  )`.execute();
  await sql`CREATE TABLE IF NOT EXISTS ho_expense_ytd_categories (
    department TEXT NOT NULL, fiscal_year TEXT NOT NULL, report_to DATE NOT NULL,
    payload JSONB NOT NULL, synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (department, fiscal_year)
  )`.execute();
}

async function getDepartments(cfg: Awaited<ReturnType<typeof config>>, token: string) {
  const payload = await zohoGet(cfg, token, "/reportingtags");
  const tags = payload.reporting_tags || payload.reportingtags || payload.tags || [];
  const tag = tags.find((item: Row) => item.is_active !== false && /^departments?$/i.test(String(item.tag_name || "").trim()));
  if (!tag) throw new Error("Zoho Books has no active Departments reporting tag.");
  const options = await zohoGet(cfg, token, `/reportingtags/${encodeURIComponent(tag.tag_id)}/options/all`, {
    tag_id: tag.tag_id, show_untagged: false,
  });
  const available = new Map<string, string>();
  for (const option of options.results || options.options || options.reporting_tag_options || []) {
    available.set(String(option.option_name || "").trim().toLowerCase(), String(option.option_id || ""));
  }
  return DEPARTMENTS.map((department) => ({ department, option_id: available.get(department.toLowerCase()) || "" }));
}

async function readBudgetMonths(
  cfg: Awaited<ReturnType<typeof config>>, token: string, department: string,
  accounts: Row[], budgetId: string,
) {
  const sql = wmill.datatable("main");
  const cached = await sql`SELECT account_id, account_name, months, status FROM ho_expense_budget_cache
    WHERE department = ${department} AND fiscal_year = ${FY.label}`.fetch();
  const byId = new Map(
    cached.filter((row: Row) => row.status !== "unavailable").map((row: Row) => [String(row.account_id), row]),
  );
  for (const account of accounts) {
    const accountId = String(account.account_id);
    if (byId.has(accountId)) continue;
    let months: Row[] = [];
    let status = "not_configured";
    try {
      const payload = await zohoGet(cfg, token, `/registers/${encodeURIComponent(accountId)}/budgetvsactuals`, {
        filter_by: "TransactionDate.CustomDate", from_date: FY.from, to_date: FY.to,
        period: "monthly", budget_id: budgetId,
      }, false);
      const detail = payload.register_budget_vs_actual?.budget_vs_actuals?.detailed_budget_vs_actual || [];
      months = detail.map((row: Row) => ({ key: budgetMonthKey(String(row.period || "")), budget: Number(row.budget_value || 0) }));
      status = months.length ? "configured" : "not_configured";
    } catch (error: any) {
      if (Number(error?.status) === 429) break;
      status = [400, 404].includes(Number(error?.status)) ? "not_configured" : "unavailable";
    }
    await sql`INSERT INTO ho_expense_budget_cache (department, fiscal_year, account_id, account_name, months, status)
      VALUES (${department}, ${FY.label}, ${accountId}, ${String(account.account_name || accountId)}, ${JSON.stringify(months)}::jsonb, ${status})
      ON CONFLICT (department, fiscal_year, account_id) DO UPDATE SET
        account_name = EXCLUDED.account_name, months = EXCLUDED.months, status = EXCLUDED.status, synced_at = NOW()`.execute();
    byId.set(accountId, { account_id: accountId, account_name: String(account.account_name || accountId), months, status });
  }
  const complete = accounts.every((account) => byId.has(String(account.account_id)));
  return { rows: byId, complete };
}

export async function main(departments: string[] = [], to = "", full_refresh = false) {
  await ensureTables();
  const cfg = await config();
  const token = await accessToken(cfg);
  const directory = await getDepartments(cfg, token);
  const sql = wmill.datatable("main");
  for (const item of directory) {
    if (!item.option_id) continue;
    await sql`INSERT INTO ho_expense_departments (option_id, department, active, last_seen_at)
      VALUES (${item.option_id}, ${item.department}, TRUE, NOW())
      ON CONFLICT (option_id) DO UPDATE SET department = EXCLUDED.department, active = TRUE, last_seen_at = NOW()`.execute();
  }

  const accountsPayload = await zohoGet(cfg, token, "/chartofaccounts");
  const accounts = (accountsPayload.chartofaccounts || []).filter((account: Row) => account.is_active !== false && expenseAccount(account));
  const allowedAccountIds = new Set(accounts.map((account: Row) => String(account.account_id)));
  const accountNames = new Map(accounts.map((account: Row) => [String(account.account_id), String(account.account_name || account.account_id)]));
  const selected = new Set(departments.map((value) => value.toLowerCase()));
  const targets = directory.filter((item) => item.option_id && (!selected.size || selected.has(item.department.toLowerCase())));
  const reportTo = to || (todayKolkata() < FY.to ? todayKolkata() : FY.to);
  const availablePeriods = monthRanges(reportTo);
  const periods = full_refresh ? availablePeriods : availablePeriods.slice(-1);
  const results: Row[] = [];

  for (const target of targets) {
    const budgetId = BUDGET_IDS[target.department] || "";
    const periodActuals = new Map<string, Map<string, Row>>();
    for (const period of periods) {
      const pnl = await zohoGet(cfg, token, "/reports/profitandloss", {
        from_date: period.from, to_date: period.to, cash_based: false,
        rule: departmentRule(target.option_id),
      });
      periodActuals.set(period.key, collectActuals(pnl.profit_and_loss || [], allowedAccountIds));
    }
    const knownBudgetAccounts = new Set(BUDGET_ACCOUNT_IDS[target.department] || []);
    const budgetCandidates = accounts.filter((account: Row) => knownBudgetAccounts.has(String(account.account_id)));
    const budgetRead = budgetId
      ? await readBudgetMonths(cfg, token, target.department, budgetCandidates, budgetId)
      : { rows: new Map<string, Row>(), complete: false };
    const budgetReference = BUDGET_ACCOUNT_REFERENCES[target.department];
    const budgetRows = budgetRead.complete ? new Map(budgetRead.rows) : new Map<string, Row>();
    if (budgetReference) {
      for (const [accountId, reference] of Object.entries(budgetReference)) {
        const cached = budgetRows.get(accountId);
        const cachedTotal = Array.isArray(cached?.months)
          ? cached.months.reduce((sum: number, item: Row) => sum + Number(item.budget || 0), 0)
          : 0;
        if (cachedTotal <= 0) {
          budgetRows.set(accountId, {
            account_id: accountId,
            account_name: reference.name,
            months: availablePeriods.map((period) => ({ key: period.key, budget: reference.monthly[period.key] || 0 })),
            status: "configured_reference",
          });
        }
      }
    }
    const budgetStatus = !budgetId
      ? "not_configured"
      : budgetRead.complete || Boolean(budgetReference) ? "configured" : "sync_pending";
    const monthlyBudgets = Object.fromEntries(availablePeriods.map((candidate) => [
      candidate.key,
      [...budgetRows.values()].reduce((sum, row: Row) => {
        const month = Array.isArray(row.months) ? row.months.find((item: Row) => item.key === candidate.key) : null;
        return sum + Number(month?.budget || 0);
      }, 0),
    ]));
    for (const period of periods) {
      const actuals = periodActuals.get(period.key) || new Map<string, Row>();
      const ytdPnl = period.from === FY.from
        ? null
        : await zohoGet(cfg, token, "/reports/profitandloss", {
          from_date: FY.from, to_date: period.to, cash_based: false,
          rule: departmentRule(target.option_id),
        });
      const categoryActuals = ytdPnl
        ? collectActuals(ytdPnl.profit_and_loss || [], allowedAccountIds)
        : actuals;
      const categoryIds = new Set([...categoryActuals.keys(), ...budgetRows.keys()]);
      const categories = [...categoryIds].map((accountId) => {
        const actual = Number(categoryActuals.get(accountId)?.actual || 0);
        const budgetRow = budgetRows.get(accountId);
        const annualBudget = Array.isArray(budgetRow?.months)
          ? budgetRow.months.reduce((sum: number, item: Row) => sum + Number(item.budget || 0), 0)
          : 0;
        const budget = budgetStatus === "configured" && annualBudget > 0 ? annualBudget : null;
        return {
          account_id: accountId,
          name: accountNames.get(accountId) || categoryActuals.get(accountId)?.name || budgetRow?.account_name || accountId,
          budget, actual, variance: budget === null ? null : budget - actual,
          utilization: budget && budget > 0 ? actual / budget : null,
        };
      }).filter((item) => item.actual !== 0 || (item.budget !== null && item.budget !== 0));
      const actual = [...actuals.values()].reduce((sum, item) => sum + Number(item.actual || 0), 0);
      const ytdActual = categories.reduce((sum, item) => sum + item.actual, 0);
      const monthBudget = Number(monthlyBudgets[period.key] || 0);
      const budget = budgetStatus === "configured" && monthBudget > 0 ? monthBudget : null;
      const payload = {
        department: target.department, fiscalYear: FY.label, period,
        metrics: {
          actual, budget, variance: budget === null ? null : budget - actual,
          utilization: budget && budget > 0 ? actual / budget : null,
          activeCategories: categories.filter((item) => item.actual !== 0).length,
        },
        categories: categories.map((item) => ({ ...item, share: ytdActual ? item.actual / ytdActual : 0 })),
        categoryScope: "fiscal_year_to_date",
        budgetStatus: budgetStatus === "configured" && monthBudget <= 0 ? "not_configured_for_period" : budgetStatus,
        source: { system: "Zoho Books", basis: "accrual", departmentField: "tag_option_id2", refreshedAt: new Date().toISOString() },
      };
      const dataStatus = actual !== 0 || budget !== null ? "available" : "no_data";
      await sql`INSERT INTO ho_expense_snapshots
        (department, fiscal_year, period_key, report_from, report_to, payload, data_status, synced_at)
        VALUES (${target.department}, ${FY.label}, ${period.key}, ${period.from}::date, ${period.to}::date,
          ${JSON.stringify(payload)}::jsonb, ${dataStatus}, NOW())
        ON CONFLICT (department, fiscal_year, period_key) DO UPDATE SET
          report_from = EXCLUDED.report_from, report_to = EXCLUDED.report_to,
          payload = EXCLUDED.payload, data_status = EXCLUDED.data_status, synced_at = NOW()`.execute();
      results.push({ department: target.department, period: period.key, data_status: dataStatus, actual, budget });
      await sql`INSERT INTO ho_expense_ytd_categories (department, fiscal_year, report_to, payload, synced_at)
        VALUES (${target.department}, ${FY.label}, ${period.to}::date,
          ${JSON.stringify({ categories: payload.categories, activeCategories: payload.metrics.activeCategories, categoryScope: payload.categoryScope, budgetStatus, monthlyBudgets })}::jsonb, NOW())
        ON CONFLICT (department, fiscal_year) DO UPDATE SET
          report_to = EXCLUDED.report_to, payload = EXCLUDED.payload, synced_at = NOW()
        WHERE ho_expense_ytd_categories.report_to <= EXCLUDED.report_to`.execute();
    }
  }
  return {
    status: "synced", fiscal_year: FY.label, report_to: reportTo,
    refresh_mode: full_refresh ? "historical_backfill" : "current_month_to_date",
    departments: targets.length, snapshots: results.length, results,
  };
}
