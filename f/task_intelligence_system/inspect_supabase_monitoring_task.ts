
declare const process: { env: Record<string, string | undefined> };
function apiCandidates(path: string) {
  const base = (process.env.BASE_INTERNAL_URL || process.env.BASE_URL || "").replace(/\/+$/, "");
  const normalized = path.startsWith("/") ? path : "/" + path;
  if (base.endsWith("/api")) return [base + normalized];
  return [base + "/api" + normalized, base + normalized];
}
async function apiPost(path: string, body: unknown) {
  const token = process.env.WM_TOKEN;
  let lastError = "";
  for (const candidate of apiCandidates(path)) {
    const response = await fetch(candidate, { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (response.ok) return await response.json();
    lastError = response.status + " " + await response.text().catch(() => "");
    if (response.status !== 404) break;
  }
  throw new Error(lastError);
}
async function runSql(content: string) {
  const workspace = process.env.WM_WORKSPACE || "beforest-automations";
  return apiPost("/w/" + workspace + "/jobs/run_inline/preview", { language: "postgresql", content, args: { database: "datatable://main" } });
}
export async function main() {
  const rows = await runSql(`
    select
      t.id,
      t.title,
      t.status,
      t.owner_name,
      t.project_name,
      t.start_date::text as start_date,
      t.due_date::text as due_date,
      t.created_at::text as created_at,
      t.updated_at::text as updated_at,
      t.closed_at::text as closed_at,
      t.tags,
      t.raw_payload,
      coalesce(jsonb_agg(jsonb_build_object('owner_name', o.owner_name, 'owner_id', o.owner_id) order by o.owner_name) filter (where o.owner_name is not null), '[]'::jsonb) as owners
    from task_intel_tasks t
    left join task_intel_task_owners o on o.task_id = t.id
    where lower(t.title) like '%supabase%'
       or lower(t.title) like '%monitor%'
       or lower(t.title) like '%montior%'
    group by t.id
    order by t.title;
  `);
  return rows;
}
