import { db, ensureSchema, seedDefaults, rows, logEvent, resolveSource, matonCalendarGet } from "./vexa_core.ts";

/**
 * Test which calendars a Maton source can read (GET only) and record the result.
 * With enable_readable, calendars with full event access are switched on and the rest off.
 */
export async function main(source = "bewild", enable_readable = true) {
  const sql = db();
  await ensureSchema(sql);
  await seedDefaults(sql);

  const { source: auth, reason } = await resolveSource(sql, source);
  if (!auth) return { source, ready: false, reason };

  const calendars = await rows<{ email: string }>(sql`SELECT email FROM vexa_calendars WHERE source = ${source} ORDER BY email`);
  const now = Date.now();
  const results = [];
  for (const { email } of calendars) {
    const res = await matonCalendarGet(auth, `calendars/${encodeURIComponent(email)}/events`, {
      timeMin: new Date(now).toISOString(),
      timeMax: new Date(now + 7 * 86_400_000).toISOString(),
      singleEvents: "true",
      maxResults: "5",
      fields: "accessRole",
    });
    const role = res.data?.accessRole || "";
    const access =
      res.status === 200 && ["reader", "writer", "owner", "writerWithoutPrivateAccess"].includes(role) ? "readable"
      : res.status === 200 && role === "freeBusyReader" ? "free_busy_only"
      : res.status === 403 || res.status === 404 ? "not_accessible"
      : `error_http_${res.status}`;
    if (enable_readable) {
      await sql`UPDATE vexa_calendars SET access_status = ${access}, enabled = ${access === "readable"}::boolean,
        last_error = ${access === "readable" ? null : `access check: ${access}`} WHERE email = ${email}`.execute();
    } else {
      await sql`UPDATE vexa_calendars SET access_status = ${access} WHERE email = ${email}`.execute();
    }
    results.push({ email, access, role, http: res.status });
  }

  const readable = results.filter((r) => r.access === "readable").length;
  await logEvent(sql, "access_check", null, `${source} as ${auth.identity}: ${readable}/${results.length} readable`);
  return { source, ready: true, identity: auth.identity, readable, total: results.length, results };
}
