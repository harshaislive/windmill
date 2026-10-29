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

function apiCandidates(path: string) {
  const base = (process.env.BASE_INTERNAL_URL || process.env.BASE_URL || "").replace(/\/+$/, "");
  if (!base) throw new Error("BASE_INTERNAL_URL or BASE_URL is required to read dashboard datatables.");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (base.endsWith("/api")) return [`${base}${normalized}`];
  return [`${base}/api${normalized}`, `${base}${normalized}`];
}

async function apiPost(path: string, body: unknown) {
  const token = process.env.WM_TOKEN;
  if (!token) throw new Error("WM_TOKEN is required to read dashboard datatables.");
  let lastError = "";
  for (const candidate of apiCandidates(path)) {
    const response = await fetch(candidate, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (response.ok) return await response.json();
    lastError = `${response.status} ${await response.text().catch(() => "")}`;
    if (response.status !== 404) break;
  }
  throw new Error(`Windmill API request failed for ${path}: ${lastError}`);
}

async function apiGet(path: string, query: Record<string, string | number | boolean | undefined> = {}) {
  const token = process.env.WM_TOKEN;
  if (!token) throw new Error("WM_TOKEN is required to read Windmill jobs.");
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

    const run = () =>
      apiPost(`/w/${workspace}/jobs/run_inline/preview`, {
        language: "postgresql",
        content,
        args: {
          ...args,
          database: "datatable://main",
        },
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

function dateStartIso(date: string) {
  return new Date(`${date}T00:00:00+05:30`).toISOString();
}

function dateEndIso(date: string) {
  return new Date(`${addDays(date, 1)}T00:00:00+05:30`).toISOString();
}

async function listInteraktFailureJobs(workspace: string, startedAfter: string, startedBefore: string) {
  const jobs: any[] = [];
  const paths = [
    "f/sales/interakt_ignored_message_worker",
    "f/sales/interakt_whatsapp_inbound",
  ];
  for (const scriptPath of paths) {
    for (let page = 1; page <= 10; page += 1) {
      const pageRows = await apiGet(`/w/${workspace}/jobs/completed/list`, {
        script_path_exact: scriptPath,
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
  }
  return jobs;
}

async function listCompletedJobsInRange(workspace: string, scriptPath: string, startedAfter: string, startedBefore: string) {
  const jobs: any[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const pageRows = await apiGet(`/w/${workspace}/jobs/completed/list`, {
      script_path_exact: scriptPath,
      started_after: startedAfter,
      started_before: startedBefore,
      order_desc: true,
      page,
      per_page: 200,
    });
    const rows = Array.isArray(pageRows) ? pageRows : pageRows?.jobs || [];
    jobs.push(...rows);
    if (!Array.isArray(rows) || rows.length < 200) break;
  }
  return jobs;
}

function sentCountFromResult(scriptPath: string, result: any) {
  if (!result || result.dry_run === true) return 0;
  if (scriptPath === "f/sales/calendar_prebook_1on1") {
    return result.whatsapp_sent === true && !result.action ? 1 : 0;
  }
  const explicitCount = Number(result.sent_count);
  if (Number.isFinite(explicitCount) && explicitCount > 0) return explicitCount;
  return Array.isArray(result.sent) ? result.sent.length : 0;
}

async function messageSendCounts(workspace: string, startDate: string, endDate: string) {
  const startedAfter = dateStartIso(startDate);
  const startedBefore = dateEndIso(endDate);
  const scripts = {
    one_on_one_prebook: "f/sales/calendar_prebook_1on1",
    one_on_one_reminder: "f/sales/send_1on1_reminders",
    webinar_reminder: "f/sales/send_webinar_reminders",
  };
  const counts = {
    one_on_one_prebook: 0,
    one_on_one_reminder: 0,
    webinar_reminder: 0,
  };

  for (const [key, scriptPath] of Object.entries(scripts)) {
    const jobs = await listCompletedJobsInRange(workspace, scriptPath, startedAfter, startedBefore);
    for (const job of jobs) {
      const detail = await apiGet(`/w/${workspace}/jobs_u/completed/get/${job.id}`).catch(() => null);
      counts[key as keyof typeof counts] += sentCountFromResult(scriptPath, detail?.result);
    }
  }

  return counts;
}

async function webinarCreationCounts(workspace: string, startDate: string, endDate: string) {
  const jobs = await listCompletedJobsInRange(
    workspace,
    "f/sales/create_webinar_activity_from_calendly",
    dateStartIso(startDate),
    dateEndIso(endDate),
  );
  const counts = {
    created_deals: 0,
    created_persons: 0,
  };

  for (const job of jobs) {
    const detail = await apiGet(`/w/${workspace}/jobs_u/completed/get/${job.id}`).catch(() => null);
    const result = detail?.result;
    if (!result || result.dry_run === true) continue;
    if (result.created_deal === true) counts.created_deals += 1;
    if (result.created_person === true) counts.created_persons += 1;
  }

  return counts;
}

function classifyInteraktFailure(templateName: string) {
  const template = templateName.toLowerCase();
  if (template.includes("1on1") && template.includes("reminder")) return "one_on_one_reminder";
  if (template.includes("prebook") || template.includes("prebookedcall")) return "one_on_one_prebook";
  if (template.includes("webinar")) return "webinar_reminder";
  return "other";
}

function parseJson(value: unknown) {
  if (!value || typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function templateNameFromDetail(detail: any) {
  const route = detail?.args?.route || {};
  const body = detail?.args?.body || parseJson(detail?.args?.raw_string) || {};
  const message = body?.data?.message || {};
  const rawTemplate = route?.raw_template || message?.raw_template;
  const parsedTemplate = parseJson(rawTemplate);
  return String(
    route?.template_name ||
      parsedTemplate?.name ||
      parsedTemplate?.display_name ||
      message?.campaign_name ||
      message?.meta_data?.source_data?.callback_data ||
      "",
  );
}

async function interaktFailureCounts(workspace: string, startDate: string, endDate: string) {
  const jobs = await listInteraktFailureJobs(workspace, dateStartIso(startDate), dateEndIso(endDate));
  const counts = {
    one_on_one_prebook: 0,
    one_on_one_reminder: 0,
    webinar_reminder: 0,
  };

  for (const job of jobs) {
    const detail = await apiGet(`/w/${workspace}/jobs_u/completed/get/${job.id}`).catch(() => null);
    const route = detail?.args?.route || {};
    if (route?.action !== "message_failed" && detail?.result?.action !== "message_failed") continue;
    const classification = classifyInteraktFailure(templateNameFromDetail(detail));
    if (classification === "one_on_one_prebook") counts.one_on_one_prebook += 1;
    if (classification === "one_on_one_reminder") counts.one_on_one_reminder += 1;
    if (classification === "webinar_reminder") counts.webinar_reminder += 1;
  }

  return counts;
}

async function tableExists(sql: ReturnType<typeof datatable>, tableName: string) {
  const row = await sql`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ${tableName}
    ) AS exists
  `.fetchOne();
  return Boolean(row?.exists);
}

function parseJsonObject(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function compactJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
}

function readableError(value: unknown, seen = new Set<unknown>()): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "[object Object]") return "";
    const parsed = trimmed.startsWith("{") || trimmed.startsWith("[") ? parseJsonObject(trimmed) : null;
    return parsed ? readableError(parsed, seen) || trimmed : trimmed;
  }
  if (value instanceof Error) return [value.name, value.message, value.stack].filter(Boolean).join(": ");
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "";
  seen.add(value);

  const record = value as Record<string, unknown>;
  const directParts = [
    record.message,
    record.error_message,
    record.reason,
    record.detail,
    record.details,
    record.description,
    record.name,
    record.code,
  ]
    .map((item) => readableError(item, seen))
    .filter(Boolean);
  if (directParts.length) return directParts.join(" | ");

  for (const key of ["error", "exception", "cause", "result", "body", "response", "data", "logs"]) {
    const nested = readableError(record[key], seen);
    if (nested) return nested;
  }

  return compactJson(value);
}

export async function main(metric_date = "", days = 7, timezone = "Asia/Kolkata") {
  const date = metric_date || dateInTimezone(new Date(), timezone);
  const startDate = addDays(date, -Math.max(0, Number(days) - 1));
  const workspace =
    process.env.WM_WORKSPACE ||
    process.env.WORKSPACE ||
    process.env.WM_WORKSPACE_ID ||
    "beforest-automations";
  const sql = datatable(workspace);

  const ready = await tableExists(sql, "dashboard_workflow_daily_metrics");
  if (!ready) {
    return {
      ready: false,
      message: "Dashboard metrics tables do not exist yet. Run f/dashboard/collect_workflow_metrics first.",
      summary: {
        active_workflows: 0,
        total_runs: 0,
        failed_runs: 0,
        successful_runs: 0,
        success_rate: 0,
        avg_runtime_seconds: 0,
        time_saved_hours: 0,
      },
      workflows: [],
      failures: [],
      trends: [],
      registry: [],
    };
  }

  const registry = await sql`
    SELECT *
    FROM dashboard_workflow_registry
    ORDER BY active DESC, criticality DESC, workflow_name ASC
  `.fetch();

  const workflows = (await sql`
    WITH metric_range AS (
      SELECT *
      FROM dashboard_workflow_daily_metrics
      WHERE metric_date >= ${startDate}::TEXT::DATE
        AND metric_date <= ${date}::TEXT::DATE
    ),
    agg AS (
      SELECT
        workflow_path,
        SUM(total_runs)::int AS total_runs,
        SUM(successful_runs)::int AS successful_runs,
        SUM(failed_runs)::int AS failed_runs,
        CASE
          WHEN SUM(total_runs) = 0 THEN 100
          ELSE ROUND((SUM(successful_runs)::numeric / NULLIF(SUM(total_runs), 0)) * 100, 2)
        END AS success_rate,
        CASE
          WHEN SUM(total_runs) = 0 THEN 0
          ELSE ROUND((SUM(total_runtime_seconds)::numeric / NULLIF(SUM(total_runs), 0)), 2)
        END AS avg_runtime_seconds,
        SUM(total_runtime_seconds) AS total_runtime_seconds,
        SUM(time_saved_minutes) AS time_saved_minutes,
        SUM(time_saved_hours) AS time_saved_hours,
        MAX(last_run_at) AS last_run_at,
        MAX(last_success_at) AS last_success_at,
        MAX(last_failure_at) AS last_failure_at,
        MAX(consecutive_failures) AS consecutive_failures,
        (ARRAY_AGG(latest_error ORDER BY last_failure_at DESC) FILTER (WHERE latest_error IS NOT NULL))[1] AS latest_error
      FROM metric_range
      GROUP BY workflow_path
    )
    SELECT
      r.workflow_name,
      r.workflow_path,
      r.workflow_kind,
      r.trigger_type,
      r.category,
      r.owner,
      r.criticality,
      r.active,
      r.expected_run_frequency,
      r.manual_minutes_saved_per_success,
      COALESCE(a.total_runs, 0) AS total_runs,
      COALESCE(a.successful_runs, 0) AS successful_runs,
      COALESCE(a.failed_runs, 0) AS failed_runs,
      COALESCE(a.success_rate, CASE WHEN r.active THEN 100 ELSE 0 END) AS success_rate,
      COALESCE(a.avg_runtime_seconds, 0) AS avg_runtime_seconds,
      COALESCE(a.total_runtime_seconds, 0) AS total_runtime_seconds,
      COALESCE(a.time_saved_minutes, 0) AS time_saved_minutes,
      COALESCE(a.time_saved_hours, 0) AS time_saved_hours,
      a.last_run_at,
      a.last_success_at,
      a.last_failure_at,
      a.latest_error,
      COALESCE(a.consecutive_failures, 0) AS consecutive_failures,
      CASE
        WHEN r.active = FALSE THEN 'Disabled'
        WHEN COALESCE(a.total_runs, 0) = 0 THEN 'No runs'
        WHEN COALESCE(a.consecutive_failures, 0) >= 2 OR COALESCE(a.success_rate, 100) < 80 THEN 'Failing'
        WHEN COALESCE(a.consecutive_failures, 0) = 1 OR COALESCE(a.success_rate, 100) < 95 THEN 'Warning'
        ELSE 'Healthy'
      END AS health_status
    FROM dashboard_workflow_registry r
    LEFT JOIN agg a
      ON a.workflow_path = r.workflow_path
    WHERE r.active = TRUE
    ORDER BY
      CASE
        WHEN r.active = FALSE THEN 5
        WHEN COALESCE(a.total_runs, 0) = 0 THEN 3
        WHEN COALESCE(a.consecutive_failures, 0) >= 2 OR COALESCE(a.success_rate, 100) < 80 THEN 1
        WHEN COALESCE(a.consecutive_failures, 0) = 1 OR COALESCE(a.success_rate, 100) < 95 THEN 2
        ELSE 4
      END,
      r.workflow_name ASC
  `.fetch()).map((workflow: any) => ({
    ...workflow,
    latest_error: readableError(workflow.latest_error),
  }));

  const summary = await sql`
    WITH metric_range AS (
      SELECT *
      FROM dashboard_workflow_daily_metrics
      WHERE metric_date >= ${startDate}::TEXT::DATE
        AND metric_date <= ${date}::TEXT::DATE
    ),
    agg AS (
      SELECT
        workflow_path,
        SUM(total_runs)::int AS total_runs,
        SUM(successful_runs)::int AS successful_runs,
        SUM(failed_runs)::int AS failed_runs,
        CASE
          WHEN SUM(total_runs) = 0 THEN 100
          ELSE ROUND((SUM(successful_runs)::numeric / NULLIF(SUM(total_runs), 0)) * 100, 2)
        END AS success_rate,
        SUM(total_runtime_seconds) AS total_runtime_seconds,
        SUM(time_saved_hours) AS time_saved_hours
      FROM metric_range
      GROUP BY workflow_path
    )
    SELECT
      COUNT(*) FILTER (WHERE r.active = TRUE)::int AS active_workflows,
      COALESCE(SUM(a.total_runs), 0)::int AS total_runs,
      COALESCE(SUM(a.successful_runs), 0)::int AS successful_runs,
      COALESCE(SUM(a.failed_runs), 0)::int AS failed_runs,
      CASE
        WHEN COALESCE(SUM(a.total_runs), 0) = 0 THEN 100
        ELSE ROUND((SUM(a.successful_runs)::numeric / NULLIF(SUM(a.total_runs), 0)) * 100, 2)
      END AS success_rate,
      CASE
        WHEN COALESCE(SUM(a.total_runs), 0) = 0 THEN 0
        ELSE ROUND((SUM(a.total_runtime_seconds)::numeric / NULLIF(SUM(a.total_runs), 0)), 2)
      END AS avg_runtime_seconds,
      COALESCE(ROUND(SUM(a.time_saved_hours)::numeric, 2), 0) AS time_saved_hours
    FROM dashboard_workflow_registry r
    LEFT JOIN agg a ON a.workflow_path = r.workflow_path
  `.fetchOne();

  const failures = (await sql`
    SELECT *
    FROM dashboard_workflow_failures
    WHERE failed_at >= ${startDate}::TEXT::DATE
      AND failed_at < (${date}::TEXT::DATE + INTERVAL '1 day')
    ORDER BY failed_at DESC
    LIMIT 50
  `.fetch()).map((failure: any) => ({
    ...failure,
    error_message: readableError(failure.error_message) || "Failed without an available error message.",
  }));

  const trends = await sql`
    SELECT
      metric_date,
      SUM(total_runs)::int AS total_runs,
      SUM(successful_runs)::int AS successful_runs,
      SUM(failed_runs)::int AS failed_runs,
      CASE
        WHEN SUM(total_runs) = 0 THEN 100
        ELSE ROUND((SUM(successful_runs)::numeric / NULLIF(SUM(total_runs), 0)) * 100, 2)
      END AS success_rate,
      COALESCE(ROUND(SUM(time_saved_hours)::numeric, 2), 0) AS time_saved_hours,
      CASE
        WHEN SUM(total_runs) = 0 THEN 0
        ELSE ROUND((SUM(total_runtime_seconds)::numeric / NULLIF(SUM(total_runs), 0)), 2)
      END AS avg_runtime_seconds
    FROM dashboard_workflow_daily_metrics
    WHERE metric_date >= ${startDate}::TEXT::DATE
      AND metric_date <= ${date}::TEXT::DATE
    GROUP BY metric_date
    ORDER BY metric_date ASC
  `.fetch();

  const byPath = new Map(workflows.map((workflow: any) => [workflow.workflow_path, workflow]));
  const successful = (path: string) => Number((byPath.get(path) as any)?.successful_runs || 0);
  const maxSuccessful = (...paths: string[]) => Math.max(0, ...paths.map(successful));
  const [messageSends, interaktFailures, webinarCreations] = await Promise.all([
    messageSendCounts(workspace, startDate, date),
    interaktFailureCounts(workspace, startDate, date),
    webinarCreationCounts(workspace, startDate, date),
  ]);
  const business_metrics = [
    {
      detail: "Typeform leads",
      count: successful("f/sales/typeform_to_pipedrive_intake"),
      source: "Typeform Intake to Pipedrive",
    },
    {
      detail: "Webinar bookings",
      count: maxSuccessful(
        "f/sales/calendly_webinar_to_pipedrive_activity",
        "f/sales/create_webinar_activity_from_calendly",
      ),
      source: "Calendly Webinar Booking Flow / Create Webinar Activity",
    },
    {
      detail: "Webinar new deals created",
      count: webinarCreations.created_deals,
      source: "Create Webinar Activity from Calendly job result",
    },
    {
      detail: "Webinar new persons created",
      count: webinarCreations.created_persons,
      source: "Create Webinar Activity from Calendly job result",
    },
    {
      detail: "Webinar delivery sent",
      count:
        maxSuccessful(
          "f/sales/calendly_webinar_to_pipedrive_activity",
          "f/sales/create_webinar_activity_from_calendly",
        ) + messageSends.webinar_reminder,
      source: "Calendly Webinar Booking Flow + Webinar Reminder Worker job result",
    },
    {
      detail: "Webinar delivery failed",
      count: interaktFailures.webinar_reminder,
      source: "Interakt failed delivery webhook",
    },
    {
      detail: "1on1 prebook processed",
      count: messageSends.one_on_one_prebook,
      source: "Calendar Prebook 1on1 processed jobs",
    },
    {
      detail: "1on1 delivery sent",
      count: Math.max(0, messageSends.one_on_one_prebook - interaktFailures.one_on_one_prebook),
      source: "Calendar Prebook 1on1 processed jobs minus failed delivery webhooks",
    },
    {
      detail: "1on1 delivery failed",
      count: interaktFailures.one_on_one_prebook,
      source: "Interakt failed delivery webhook",
    },
    {
      detail: "Zoom registrants synced",
      count: successful("f/collectives/zoom_collective_to_pipedrive"),
      source: "Zoom Collective Registrants to Pipedrive",
    },
  ];

  return {
    ready: true,
    metric_date: date,
    start_date: startDate,
    timezone,
    summary,
    workflows,
    failures,
    trends,
    business_metrics,
    registry,
  };
}
