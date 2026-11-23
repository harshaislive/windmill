import * as wmill from "windmill-client";
export async function main() {
  const sql = wmill.datatable("main");
  const rows = await sql`SELECT name, length(html) AS n, html FROM dashboard_pages WHERE name IN ('funnel_live')`.fetch() as any[];
  return rows[0];
}
