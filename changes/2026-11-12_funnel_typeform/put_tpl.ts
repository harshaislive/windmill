import * as wmill from "windmill-client";
export async function main(html: string, backup_name: string) {
  const sql = wmill.datatable("main");
  if (!html.includes("__FUNNEL_DATA__")) throw new Error("template missing placeholder");
  await sql`INSERT INTO dashboard_pages (name, html) SELECT ${backup_name}, html FROM dashboard_pages WHERE name = 'funnel_live' ON CONFLICT (name) DO UPDATE SET html = EXCLUDED.html`.execute();
  await sql`UPDATE dashboard_pages SET html = ${html} WHERE name = 'funnel_live'`.execute();
  const rows = await sql`SELECT name, length(html) AS n FROM dashboard_pages WHERE name IN ('funnel_live', ${backup_name})`.fetch();
  return rows;
}
