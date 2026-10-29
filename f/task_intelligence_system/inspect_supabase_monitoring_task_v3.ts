
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
  const columns = await runSql(`
    select column_name, data_type
    from information_schema.columns
    where table_name = 'task_intel_tasks'
    order by ordinal_position;
  `);
  const rows = await runSql(`
    select
      t.*,
      coalesce(jsonb_agg(jsonb_build_object('owner_name', o.owner_name, 'owner_id', o.owner_id) order by o.owner_name) filter (where o.owner_name is not null), '[]'::jsonb) as owners
    from task_intel_tasks t
    left join task_intel_task_owners o on o.task_id = t.id
    where lower(t.title) like '%supabase%'
       or lower(t.title) like '%monitor%'
       or lower(t.title) like '%montior%'
    group by t.id
    order by t.title;
  `);
  return { columns, rows };
}
