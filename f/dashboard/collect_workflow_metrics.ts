type WorkflowRegistrySeed = {
  workflow_name: string;
  workflow_path: string;
  workflow_kind: "script" | "flow";
  trigger_type: "webhook" | "schedule" | "internal" | "worker";
  category: string;
  owner: string;
  criticality: "High" | "Medium" | "Low";
  active: boolean;
  expected_run_frequency: string;
};

type CompletedJob = {
  id: string;
  script_path?: string;
  job_kind?: string;
  started_at?: string;
  completed_at?: string;
  duration_ms?: number;
  success?: boolean;
  schedule_path?: string;
  created_by?: string;
};

const WORKFLOWS: WorkflowRegistrySeed[] = [
  {
    workflow_name: "Typeform Intake to Pipedrive",
    workflow_path: "f/sales/typeform_to_pipedrive_intake",
    workflow_kind: "script",
    trigger_type: "webhook",
    category: "Lead intake",
    owner: "Sales",
    criticality: "High",
    active: true,
    expected_run_frequency: "event-driven",
  },
  {
    workflow_name: "Map Deal Product from Collective",
    workflow_path: "f/sales/map_deal_product_from_collective",
    workflow_kind: "script",
    trigger_type: "internal",
    category: "Pipedrive enrichment",
    owner: "Sales",
    criticality: "Medium",
    active: true,
    expected_run_frequency: "event-driven",
  },
  {
    workflow_name: "Pipedrive 1on1/Webinar Guard",
    workflow_path: "f/sales/pipedrive_1on1_tbc_to_calendar_prebook",
    workflow_kind: "script",
    trigger_type: "webhook",
    category: "Routing",
    owner: "Sales",
    criticality: "High",
    active: true,
    expected_run_frequency: "event-driven",
  },
  {
    workflow_name: "Calendar Prebook 1on1",
    workflow_path: "f/sales/calendar_prebook_1on1",
    workflow_kind: "script",
    trigger_type: "internal",
    category: "1on1 booking",
    owner: "Sales",
    criticality: "High",
    active: true,
    expected_run_frequency: "event-driven",
  },
  {
    workflow_name: "Calendly Webinar Booking Flow",
    workflow_path: "f/sales/calendly_webinar_to_pipedrive_activity",
    workflow_kind: "flow",
    trigger_type: "webhook",
    category: "Webinar booking",
    owner: "Sales",
    criticality: "High",
    active: true,
    expected_run_frequency: "event-driven",
  },
  {
    workflow_name: "Create Webinar Activity from Calendly",
    workflow_path: "f/sales/create_webinar_activity_from_calendly",
    workflow_kind: "script",
    trigger_type: "internal",
    category: "Webinar booking",
    owner: "Sales",
    criticality: "High",
    active: true,
    expected_run_frequency: "event-driven",
  },
  {
    workflow_name: "Send Webinar Registration CTA",
    workflow_path: "f/sales/send_webinar_registration_cta",
    workflow_kind: "script",
    trigger_type: "internal",
    category: "Webinar nurturing",
    owner: "Sales",
    criticality: "Medium",
    active: true,
    expected_run_frequency: "event-driven",
  },
  {
    workflow_name: "Interakt WhatsApp Inbound Flow",
    workflow_path: "f/sales/interakt_whatsapp_inbound",
    workflow_kind: "flow",
    trigger_type: "webhook",
    category: "WhatsApp inbound",
    owner: "Sales",
    criticality: "High",
    active: true,
    expected_run_frequency: "event-driven",
  },
  {
    workflow_name: "Interakt WhatsApp Inbound Router",
    workflow_path: "f/sales/interakt_whatsapp_inbound_router",
    workflow_kind: "script",
    trigger_type: "internal",
    category: "WhatsApp inbound",
    owner: "Sales",
    criticality: "High",
    active: true,
    expected_run_frequency: "event-driven",
  },
  {
    workflow_name: "Lead Reschedule Request",
    workflow_path: "f/sales/interakt_reschedule_requested_worker",
    workflow_kind: "script",
    trigger_type: "internal",
    category: "1on1 reschedule",
    owner: "Sales",
    criticality: "High",
    active: true,
    expected_run_frequency: "event-driven",
  },
  {
    workflow_name: "Lead Attendance Confirmation",
    workflow_path: "f/sales/interakt_attendance_confirmed_worker",
    workflow_kind: "script",
    trigger_type: "internal",
    category: "1on1 attendance",
    owner: "Sales",
    criticality: "Medium",
    active: true,
    expected_run_frequency: "event-driven",
  },
  {
    workflow_name: "Owner Marked Attended",
    workflow_path: "f/sales/interakt_owner_attended_worker",
    workflow_kind: "script",
    trigger_type: "internal",
    category: "1on1 attendance",
    owner: "Sales",
    criticality: "Medium",
    active: true,
    expected_run_frequency: "event-driven",
  },
  {
    workflow_name: "Owner Marked No-Show",
    workflow_path: "f/sales/interakt_owner_no_show_worker",
    workflow_kind: "script",
    trigger_type: "internal",
    category: "1on1 attendance",
    owner: "Sales",
    criticality: "Medium",
    active: true,
    expected_run_frequency: "event-driven",
  },
  {
    workflow_name: "Ignored / Failed WhatsApp Event",
    workflow_path: "f/sales/interakt_ignored_message_worker",
    workflow_kind: "script",
    trigger_type: "internal",
    category: "WhatsApp inbound",
    owner: "Sales",
    criticality: "Low",
    active: true,
    expected_run_frequency: "event-driven",
  },
  {
    workflow_name: "1on1 Reminder Scheduler",
    workflow_path: "f/sales/send_1on1_reminders",
    workflow_kind: "script",
    trigger_type: "schedule",
    category: "Reminders",
    owner: "Sales",
    criticality: "High",
    active: true,
    expected_run_frequency: "15 minutes",
  },
  {
    workflow_name: "Owner Attendance Check",
    workflow_path: "f/sales/send_owner_attendance_checks",
    workflow_kind: "script",
    trigger_type: "schedule",
    category: "1on1 attendance",
    owner: "Sales",
    criticality: "High",
    active: true,
    expected_run_frequency: "30 minutes",
  },
  {
    workflow_name: "Webinar Reminder Worker",
    workflow_path: "f/sales/send_webinar_reminders",
    workflow_kind: "script",
    trigger_type: "worker",
    category: "Reminders",
    owner: "Sales",
    criticality: "High",
    active: true,
    expected_run_frequency: "delayed jobs",
  },
  {
    workflow_name: "Zoom Collective Registrants to Pipedrive",
    workflow_path: "f/collectives/zoom_collective_to_pipedrive",
    workflow_kind: "script",
    trigger_type: "schedule",
    category: "Zoom sync",
    owner: "Sales",
    criticality: "Medium",
    active: true,
    expected_run_frequency: "3 hours",
  },
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

function dayBounds(date: string, timezone: string) {
  const offset = timezone === "Asia/Kolkata" || timezone === "Asia/Calcutta" ? "+05:30" : "Z";
  const start = new Date(`${date}T00:00:00${offset}`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

function toSeconds(ms: number | undefined) {
  return Math.round(((ms || 0) / 1000) * 100) / 100;
}

function pct(successful: number, total: number) {
  return total ? Math.round((successful / total) * 10000) / 100 : 100;
}

function healthStatus(active: boolean, total: number, successRate: number, consecutiveFailures: number) {
  if (!active) return "Disabled";
  if (consecutiveFailures >= 2 || successRate < 80) return "Failing";
  if (consecutiveFailures === 1 || successRate < 95) return "Warning";
  if (total === 0) return "No runs";
  return "Healthy";
}

function apiCandidates(path: string) {
  const base = (process.env.BASE_INTERNAL_URL || process.env.BASE_URL || "").replace(/\/+$/, "");
  if (!base) throw new Error("BASE_INTERNAL_URL or BASE_URL is required to read Windmill jobs.");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (base.endsWith("/api")) return [`${base}${normalized}`];
  return [`${base}/api${normalized}`, `${base}${normalized}`];
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

async function apiPost(path: string, body: unknown) {
  const token = process.env.WM_TOKEN;
  if (!token) throw new Error("WM_TOKEN is required to read Windmill jobs.");
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

async function listCompletedJobs(workspace: string, workflowPath: string, startedAfter: string, startedBefore: string) {
  const jobs: CompletedJob[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const pageRows = await apiGet(`/w/${workspace}/jobs/completed/list`, {
      script_path_exact: workflowPath,
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

async function latestFailureText(workspace: string, jobId: string) {
  const detail = await apiGet(`/w/${workspace}/jobs_u/completed/get/${jobId}`).catch(() => null);
  const logs = await apiGet(`/w/${workspace}/jobs_u/get_completed_logs_tail/${jobId}`).catch(() => "");
  const candidates = [
    detail?.error,
    detail?.exception,
    detail?.result?.error,
    typeof detail?.result === "string" ? detail.result : "",
    typeof logs === "string" ? logs : JSON.stringify(logs || ""),
  ];
  const message = candidates.map((candidate) => readableError(candidate)).find(Boolean);
  return (message || "Failed without an available error message.").slice(0, 4000);
}

async function ensureTables(sql: ReturnType<typeof datatable>) {
  await sql`
    CREATE TABLE IF NOT EXISTS dashboard_workflow_registry (
      workflow_path TEXT PRIMARY KEY,
      workflow_name TEXT NOT NULL,
      workflow_kind TEXT NOT NULL,
      trigger_type TEXT NOT NULL,
      category TEXT NOT NULL,
      owner TEXT NOT NULL,
      criticality TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      manual_minutes_saved_per_success NUMERIC NOT NULL DEFAULT 0,
      manual_minutes_saved_per_unit NUMERIC NOT NULL DEFAULT 0,
      unit_result_key TEXT,
      expected_run_frequency TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute();
  await sql`
    CREATE TABLE IF NOT EXISTS dashboard_workflow_daily_metrics (
      metric_date DATE NOT NULL,
      workflow_path TEXT NOT NULL,
      workflow_name TEXT NOT NULL,
      total_runs INTEGER NOT NULL DEFAULT 0,
      successful_runs INTEGER NOT NULL DEFAULT 0,
      failed_runs INTEGER NOT NULL DEFAULT 0,
      success_rate NUMERIC NOT NULL DEFAULT 100,
      avg_runtime_seconds NUMERIC NOT NULL DEFAULT 0,
      total_runtime_seconds NUMERIC NOT NULL DEFAULT 0,
      time_saved_minutes NUMERIC NOT NULL DEFAULT 0,
      time_saved_hours NUMERIC NOT NULL DEFAULT 0,
      last_run_at TIMESTAMPTZ,
      last_success_at TIMESTAMPTZ,
      last_failure_at TIMESTAMPTZ,
      latest_error TEXT,
      consecutive_failures INTEGER NOT NULL DEFAULT 0,
      health_status TEXT NOT NULL DEFAULT 'No runs',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (metric_date, workflow_path)
    )
  `.execute();
  await sql`
    CREATE TABLE IF NOT EXISTS dashboard_workflow_failures (
      job_id TEXT PRIMARY KEY,
      failed_at TIMESTAMPTZ NOT NULL,
      workflow_path TEXT NOT NULL,
      workflow_name TEXT NOT NULL,
      error_message TEXT,
      duration_seconds NUMERIC NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'failed',
      resolved BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute();
}

async function seedRegistry(sql: ReturnType<typeof datatable>) {
  for (const workflow of WORKFLOWS) {
    await sql`
      INSERT INTO dashboard_workflow_registry (
        workflow_path,
        workflow_name,
        workflow_kind,
        trigger_type,
        category,
        owner,
        criticality,
        active,
        expected_run_frequency
      )
      VALUES (
        ${workflow.workflow_path},
        ${workflow.workflow_name},
        ${workflow.workflow_kind},
        ${workflow.trigger_type},
        ${workflow.category},
        ${workflow.owner},
        ${workflow.criticality},
        ${workflow.active},
        ${workflow.expected_run_frequency}
      )
      ON CONFLICT (workflow_path) DO UPDATE SET
        workflow_name = EXCLUDED.workflow_name,
        workflow_kind = EXCLUDED.workflow_kind,
        trigger_type = EXCLUDED.trigger_type,
        category = EXCLUDED.category,
        owner = EXCLUDED.owner,
        criticality = EXCLUDED.criticality,
        active = EXCLUDED.active,
        expected_run_frequency = EXCLUDED.expected_run_frequency,
        updated_at = NOW()
    `.execute();
  }
}

async function registryRows(sql: ReturnType<typeof datatable>) {
  return await sql`
    SELECT *
    FROM dashboard_workflow_registry
    WHERE active = TRUE
    ORDER BY criticality DESC, workflow_name ASC
  `.fetch();
}

function consecutiveFailures(jobs: CompletedJob[]) {
  let count = 0;
  for (const job of [...jobs].sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)))) {
    if (job.success === false) count += 1;
    else break;
  }
  return count;
}

export async function main(metric_date = "", timezone = "Asia/Kolkata") {
  const date = metric_date || dateInTimezone(new Date(), timezone);
  const { start, end } = dayBounds(date, timezone);
  const workspace =
    process.env.WM_WORKSPACE ||
    process.env.WORKSPACE ||
    process.env.WM_WORKSPACE_ID ||
    "beforest-automations";
  const sql = datatable(workspace);

  await ensureTables(sql);
  await seedRegistry(sql);
  const registry = await registryRows(sql);

  const summaries = [];
  for (const workflow of registry) {
    const jobs = await listCompletedJobs(workspace, workflow.workflow_path, start, end);
    const totalRuns = jobs.length;
    const successfulRuns = jobs.filter((job) => job.success === true).length;
    const failedRuns = jobs.filter((job) => job.success === false).length;
    const successRate = pct(successfulRuns, totalRuns);
    const totalRuntimeSeconds = Math.round(jobs.reduce((sum, job) => sum + toSeconds(job.duration_ms), 0) * 100) / 100;
    const avgRuntimeSeconds = totalRuns ? Math.round((totalRuntimeSeconds / totalRuns) * 100) / 100 : 0;
    const sorted = [...jobs].sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)));
    const lastRun = sorted[0] || null;
    const lastSuccess = sorted.find((job) => job.success === true) || null;
    const lastFailure = sorted.find((job) => job.success === false) || null;
    const failureText = lastFailure ? await latestFailureText(workspace, lastFailure.id) : null;
    const failureStreak = consecutiveFailures(jobs);
    const timeSavedMinutes = Number(workflow.manual_minutes_saved_per_success || 0) * successfulRuns;
    const health = healthStatus(Boolean(workflow.active), totalRuns, successRate, failureStreak);

    await sql`
      INSERT INTO dashboard_workflow_daily_metrics (
        metric_date,
        workflow_path,
        workflow_name,
        total_runs,
        successful_runs,
        failed_runs,
        success_rate,
        avg_runtime_seconds,
        total_runtime_seconds,
        time_saved_minutes,
        time_saved_hours,
        last_run_at,
        last_success_at,
        last_failure_at,
        latest_error,
        consecutive_failures,
        health_status,
        updated_at
      )
      VALUES (
        ${date}::TEXT::DATE,
        ${workflow.workflow_path},
        ${workflow.workflow_name},
        ${totalRuns},
        ${successfulRuns},
        ${failedRuns},
        ${successRate},
        ${avgRuntimeSeconds},
        ${totalRuntimeSeconds},
        ${timeSavedMinutes},
        ${Math.round((timeSavedMinutes / 60) * 100) / 100},
        ${lastRun?.started_at || null}::TEXT::TIMESTAMPTZ,
        ${lastSuccess?.started_at || null}::TEXT::TIMESTAMPTZ,
        ${lastFailure?.started_at || null}::TEXT::TIMESTAMPTZ,
        ${failureText},
        ${failureStreak},
        ${health},
        NOW()
      )
      ON CONFLICT (metric_date, workflow_path) DO UPDATE SET
        workflow_name = EXCLUDED.workflow_name,
        total_runs = EXCLUDED.total_runs,
        successful_runs = EXCLUDED.successful_runs,
        failed_runs = EXCLUDED.failed_runs,
        success_rate = EXCLUDED.success_rate,
        avg_runtime_seconds = EXCLUDED.avg_runtime_seconds,
        total_runtime_seconds = EXCLUDED.total_runtime_seconds,
        time_saved_minutes = EXCLUDED.time_saved_minutes,
        time_saved_hours = EXCLUDED.time_saved_hours,
        last_run_at = EXCLUDED.last_run_at,
        last_success_at = EXCLUDED.last_success_at,
        last_failure_at = EXCLUDED.last_failure_at,
        latest_error = EXCLUDED.latest_error,
        consecutive_failures = EXCLUDED.consecutive_failures,
        health_status = EXCLUDED.health_status,
        updated_at = NOW()
    `.execute();

    for (const failed of jobs.filter((job) => job.success === false)) {
      const error = failed.id === lastFailure?.id ? failureText : await latestFailureText(workspace, failed.id);
      await sql`
        INSERT INTO dashboard_workflow_failures (
          job_id,
          failed_at,
          workflow_path,
          workflow_name,
          error_message,
          duration_seconds,
          status
        )
        VALUES (
          ${failed.id},
          ${failed.started_at || failed.completed_at || new Date().toISOString()}::TEXT::TIMESTAMPTZ,
          ${workflow.workflow_path},
          ${workflow.workflow_name},
          ${error},
          ${toSeconds(failed.duration_ms)},
          'failed'
        )
        ON CONFLICT (job_id) DO UPDATE SET
          error_message = EXCLUDED.error_message,
          duration_seconds = EXCLUDED.duration_seconds
      `.execute();
    }

    summaries.push({
      workflow_path: workflow.workflow_path,
      workflow_name: workflow.workflow_name,
      total_runs: totalRuns,
      successful_runs: successfulRuns,
      failed_runs: failedRuns,
      success_rate: successRate,
      avg_runtime_seconds: avgRuntimeSeconds,
      health_status: health,
    });
  }

  const persisted = await sql`
    SELECT
      COUNT(*)::int AS rows,
      COALESCE(SUM(total_runs), 0)::int AS total_runs,
      COALESCE(SUM(failed_runs), 0)::int AS failed_runs
    FROM dashboard_workflow_daily_metrics
    WHERE metric_date = ${date}::TEXT::DATE
  `.fetchOne();

  return {
    metric_date: date,
    timezone,
    workflows_checked: summaries.length,
    persisted,
    summaries,
  };
}
