declare const process: { env: Record<string, string | undefined> };

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

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

function currentMonth() {
  return dateInTimezone().slice(0, 7);
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

async function runSql(workspace: string, content: string, args: Record<string, unknown> = {}) {
  return apiPost(`/w/${workspace}/jobs/run_inline/preview`, {
    language: "postgresql",
    content,
    args: {
      ...args,
      database: "datatable://main",
    },
  });
}

const baseTasksCte = `
with task_owner_names as (
  select
    task_id,
    jsonb_agg(owner_name order by owner_name) as owner_names_json,
    string_agg(owner_name, ', ' order by owner_name) as owner_names_text
  from task_intel_task_owners
  group by task_id
),
task_tags as (
  select
    t.*,
    lower(coalesce(t.status, '')) as status_l,
    coalesce(o.owner_names_json, to_jsonb(array[coalesce(t.owner_name, 'Unassigned')])) as owner_names_json,
    coalesce(o.owner_names_text, coalesce(t.owner_name, 'Unassigned')) as owner_names_text,
    coalesce(
      (
        select to_char(to_date(replace(replace(
          case
            when lower(tag.value) ~ '(^|[^0-9])((2026|2027|2028|2029|2030)[-_ ]?(0[1-9]|1[0-2]))([^0-9]|$)'
              then substring(lower(tag.value) from '((2026|2027|2028|2029|2030)[-_ ]?(0[1-9]|1[0-2]))')
            when lower(tag.value) ~ '(jan|january)[-_ ]*(2026|2027|2028|2029|2030)' then substring(lower(tag.value) from '(2026|2027|2028|2029|2030)') || '-01'
            when lower(tag.value) ~ '(feb|february)[-_ ]*(2026|2027|2028|2029|2030)' then substring(lower(tag.value) from '(2026|2027|2028|2029|2030)') || '-02'
            when lower(tag.value) ~ '(mar|march)[-_ ]*(2026|2027|2028|2029|2030)' then substring(lower(tag.value) from '(2026|2027|2028|2029|2030)') || '-03'
            when lower(tag.value) ~ '(apr|april)[-_ ]*(2026|2027|2028|2029|2030)' then substring(lower(tag.value) from '(2026|2027|2028|2029|2030)') || '-04'
            when lower(tag.value) ~ '(may)[-_ ]*(2026|2027|2028|2029|2030)' then substring(lower(tag.value) from '(2026|2027|2028|2029|2030)') || '-05'
            when lower(tag.value) ~ '(jun|june)[-_ ]*(2026|2027|2028|2029|2030)' then substring(lower(tag.value) from '(2026|2027|2028|2029|2030)') || '-06'
            when lower(tag.value) ~ '(jul|july)[-_ ]*(2026|2027|2028|2029|2030)' then substring(lower(tag.value) from '(2026|2027|2028|2029|2030)') || '-07'
            when lower(tag.value) ~ '(aug|august)[-_ ]*(2026|2027|2028|2029|2030)' then substring(lower(tag.value) from '(2026|2027|2028|2029|2030)') || '-08'
            when lower(tag.value) ~ '(sep|sept|september)[-_ ]*(2026|2027|2028|2029|2030)' then substring(lower(tag.value) from '(2026|2027|2028|2029|2030)') || '-09'
            when lower(tag.value) ~ '(oct|october)[-_ ]*(2026|2027|2028|2029|2030)' then substring(lower(tag.value) from '(2026|2027|2028|2029|2030)') || '-10'
            when lower(tag.value) ~ '(nov|november)[-_ ]*(2026|2027|2028|2029|2030)' then substring(lower(tag.value) from '(2026|2027|2028|2029|2030)') || '-11'
            when lower(tag.value) ~ '(dec|december)[-_ ]*(2026|2027|2028|2029|2030)' then substring(lower(tag.value) from '(2026|2027|2028|2029|2030)') || '-12'
          end,
          '_', '-'), ' ', '-'), 'YYYY-MM'), 'YYYY-MM')
        from jsonb_array_elements_text(coalesce(t.tags, '[]'::jsonb)) as tag(value)
        where lower(tag.value) ~ '(2026|2027|2028|2029|2030|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)'
        limit 1
      ),
      to_char(coalesce(t.due_date, t.start_date, t.created_at::date), 'YYYY-MM')
    ) as task_month
  from task_intel_tasks t
  left join task_owner_names o on o.task_id = t.id
),
base as (
  select
    *,
    case
      when status_l in ('closed', 'done', 'completed') then 'closed'
      when status_l in ('in progress', 'in-progress', 'inprogress', 'progress', 'wip') then 'in_progress'
      when status_l in ('cancelled', 'canceled') then 'cancelled'
      else 'open'
    end as status_group
  from task_tags
  where task_month >= '2026-04'
)
`;

const progressColumns = `
  count(*) filter (where status_group <> 'cancelled')::int as total_tasks,
  count(*) filter (where status_group = 'open')::int as open_tasks,
  count(*) filter (where status_group = 'in_progress')::int as in_progress_tasks,
  count(*) filter (where status_group = 'closed')::int as closed_tasks,
  count(*) filter (where status_group = 'cancelled')::int as cancelled_tasks,
  round((
    count(*) filter (where status_group = 'open') * 1.5
    + count(*) filter (where status_group = 'in_progress') * 5
    + count(*) filter (where status_group = 'closed') * 10
  )::numeric, 1)::float as weighted_score,
  case
    when count(*) filter (where status_group <> 'cancelled') = 0 then 0
    else round(least(100, (
      (
        count(*) filter (where status_group = 'open') * 1.5
        + count(*) filter (where status_group = 'in_progress') * 5
        + count(*) filter (where status_group = 'closed') * 10
      ) / (count(*) filter (where status_group <> 'cancelled') * 10.0)
    ) * 100)::numeric, 1)
  end::float as progress_percent
`;

function normalizeSummary(row: any) {
  return {
    total_tasks: num(row?.total_tasks),
    open_tasks: num(row?.open_tasks),
    in_progress_tasks: num(row?.in_progress_tasks),
    closed_tasks: num(row?.closed_tasks),
    cancelled_tasks: num(row?.cancelled_tasks),
    weighted_score: num(row?.weighted_score),
    progress_percent: num(row?.progress_percent),
  };
}

export async function main(month?: string, owner?: string, status?: string) {
  const workspace = process.env.WM_WORKSPACE || "beforest-automations";
  const selectedMonth = month && month >= "2026-04" ? month : currentMonth();
  const selectedOwner = owner && owner !== "All Owners" ? owner : null;
  const selectedStatus = status && status !== "All Statuses" ? status : null;
  const args = { month: selectedMonth, owner: selectedOwner, status: selectedStatus };
  const filter = "task_month = $1::text and ($2::text is null or owner_names_json ? ($2::text)) and ($3::text is null or status_group = $3::text)";
  const argComments = "-- $1 month\n-- $2 owner\n-- $3 status\n\n";

  const rows = await runSql(workspace, `${argComments}
${baseTasksCte}
select jsonb_build_object(
  'summary', (
    select to_jsonb(summary_row)
    from (
      select
${progressColumns}
      from base
      where ${filter}
    ) summary_row
  ),
  'months', coalesce((
    select jsonb_agg(month_row order by month)
    from (
      select task_month as month, to_char(to_date(task_month, 'YYYY-MM'), 'Mon YYYY') as label, count(*)::int as task_count
      from base
      group by task_month
    ) month_row
  ), '[]'::jsonb),
  'owners', coalesce((
    select jsonb_agg(owner_row order by total_tasks desc, progress_percent desc)
    from (
      select
        coalesce(task_owner.owner_name, 'Unassigned') as owner_name,
${progressColumns}
      from base
      join task_intel_task_owners task_owner on task_owner.task_id = base.id
      where task_month = $1::text
        and ($2::text is null or task_owner.owner_name = $2::text)
        and ($3::text is null or status_group = $3::text)
      group by coalesce(task_owner.owner_name, 'Unassigned')
    ) owner_row
  ), '[]'::jsonb),
  'owner_options', coalesce((
    select jsonb_agg(owner_name order by owner_name)
    from (
      select distinct coalesce(task_owner.owner_name, 'Unassigned') as owner_name
      from task_intel_task_owners task_owner
      join base on base.id = task_owner.task_id
    ) owner_option_row
  ), '[]'::jsonb),
  'trend', coalesce((
    select jsonb_agg(trend_row order by month)
    from (
      select
        task_month as month,
        to_char(to_date(task_month, 'YYYY-MM'), 'Mon YYYY') as label,
${progressColumns}
      from base
      where ($2::text is null or owner_names_json ? ($2::text))
        and ($3::text is null or status_group = $3::text)
      group by task_month
    ) trend_row
  ), '[]'::jsonb),
  'tasks', coalesce((
    select jsonb_agg(task_row order by status_sort, due_sort, title)
    from (
      select
        id,
        title,
        coalesce(project_name, '-') as project_name,
        coalesce(owner_names_text, '-') as owner_name,
        coalesce(status, '-') as status,
        status_group,
        task_month,
        due_date::text as due_date,
        start_date::text as start_date,
        percent_complete::float as percent_complete,
        tags,
        case status_group when 'open' then 1 when 'in_progress' then 2 when 'closed' then 3 else 4 end as status_sort,
        due_date as due_sort
      from base
      where ${filter}
      order by
        case status_group when 'open' then 1 when 'in_progress' then 2 when 'closed' then 3 else 4 end,
        due_date nulls last,
        title
      limit 300
    ) task_row
  ), '[]'::jsonb)
) as dashboard;
`, args);
  const payload = (Array.isArray(rows) ? rows[0] : rows)?.dashboard || {};
  const summary = normalizeSummary(payload.summary);

  return {
    ok: true,
    generated_at: new Date().toISOString(),
    selected_month: selectedMonth,
    selected_owner: selectedOwner || "All Owners",
    selected_status: selectedStatus || "All Statuses",
    weights: { open: 1.5, in_progress: 5, closed: 10 },
    summary,
    months: payload.months || [],
    owners: payload.owners || [],
    owner_options: payload.owner_options || [],
    status_options: ["All Statuses", "open", "in_progress", "closed", "cancelled"],
    trend: payload.trend || [],
    tasks: payload.tasks || [],
  };
}
