import {
  db, ensureSchema, seedDefaults, getSettings, rows, logEvent, findMeetingLink, meetingKey,
  matonCalendarGet, resolveSource, INTERNAL_DOMAINS, type MatonSource,
} from "./vexa_core.ts";

type Found = {
  key: string;
  platform: string;
  native_meeting_id: string;
  meeting_url: string;
  title: string;
  organizer: string;
  start_at: string;
  end_at: string;
  calendars: Set<string>;
  attendee_count: number;
  has_external: boolean;
  skip_reason: string | null;
};

/**
 * Scan every enabled calendar for upcoming meetings with a Meet/Zoom/Teams link
 * and upsert them into the vexa_meetings queue. Sends no bots.
 */
export async function main(lookahead_hours = 0, only_email = "") {
  const sql = db();
  await ensureSchema(sql);
  await seedDefaults(sql);
  const settings = await getSettings(sql);
  const hours = lookahead_hours > 0 ? lookahead_hours : Number(settings.lookahead_hours) || 3;
  const skipKeyword = (settings.skip_keyword || "#nobot").toLowerCase();

  // Each source's identity is verified once per run before any of its calendars are read.
  const sources = new Map<string, { source: MatonSource | null; reason: string }>();
  const sourceFor = async (name: string) => {
    if (!sources.has(name)) sources.set(name, await resolveSource(sql, name));
    return sources.get(name)!;
  };

  const now = Date.now();
  const timeMin = new Date(now - 15 * 60_000).toISOString();
  const timeMax = new Date(now + hours * 3_600_000).toISOString();

  const calendars = await rows<{ email: string; source: string }>(
    only_email
      ? sql`SELECT email, source FROM vexa_calendars WHERE email = ${only_email}`
      : sql`SELECT email, source FROM vexa_calendars WHERE enabled = TRUE ORDER BY source, email`,
  );

  const found = new Map<string, Found>();
  let failedCalendars = 0;

  for (const { email, source: sourceName } of calendars) {
    let pageToken = "";
    let count = 0;
    let error = "";
    const { source, reason } = await sourceFor(sourceName);
    if (!source) error = `${sourceName} source unavailable: ${reason}`;
    else do {
      const params: Record<string, string> = {
        timeMin, timeMax, singleEvents: "true", orderBy: "startTime", maxResults: "250",
        fields: "accessRole,nextPageToken,items(id,status,summary,description,location,hangoutLink,conferenceData(entryPoints(entryPointType,uri)),start,end,organizer(email),attendees(email,self,resource,responseStatus),eventType)",
      };
      if (pageToken) params.pageToken = pageToken;
      const res = await matonCalendarGet(source, `calendars/${encodeURIComponent(email)}/events`, params);
      if (res.status !== 200) {
        error = `HTTP ${res.status}: ${JSON.stringify(res.data?.error?.message || "").slice(0, 200)}`;
        break;
      }
      if (res.data.accessRole === "freeBusyReader") {
        error = "free/busy access only";
        break;
      }
      for (const event of res.data.items || []) {
        if (event.status === "cancelled" || !event.start?.dateTime) continue; // all-day or cancelled
        if (event.eventType && event.eventType !== "default") continue; // focus time, OOO, working location
        const self = (event.attendees || []).find((a: any) => (a.email || "").toLowerCase() === email);
        if (self?.responseStatus === "declined") continue; // this person isn't going; another calendar may still hold it
        const link = findMeetingLink(event);
        if (!link) continue;
        const key = meetingKey(link, event.start.dateTime);
        const people = (event.attendees || []).filter((a: any) => !a.resource);
        const external = people.some((a: any) => !INTERNAL_DOMAINS.includes(String(a.email || "").split("@")[1]?.toLowerCase()));
        const text = `${event.summary || ""}\n${event.description || ""}`.toLowerCase();
        const existing = found.get(key);
        if (existing) {
          existing.calendars.add(email);
          continue;
        }
        found.set(key, {
          key,
          ...link,
          title: event.summary || "(no title)",
          organizer: event.organizer?.email || "",
          start_at: new Date(event.start.dateTime).toISOString(),
          end_at: new Date(event.end?.dateTime || event.start.dateTime).toISOString(),
          calendars: new Set([email]),
          attendee_count: people.length,
          has_external: external,
          skip_reason: skipKeyword && text.includes(skipKeyword) ? `tagged ${skipKeyword}` : null,
        });
        count++;
      }
      pageToken = res.data.nextPageToken || "";
    } while (pageToken);

    if (error) failedCalendars++;
    await sql`
      UPDATE vexa_calendars
      SET last_scanned_at = NOW(), last_scan_ok = ${!error}::boolean, last_error = ${error || null},
          meetings_found = ${count}::int
      WHERE email = ${email}`.execute();
  }

  const upsertStarted = new Date().toISOString();
  let inserted = 0;
  let updated = 0;
  for (const m of found.values()) {
    const calendarsJson = JSON.stringify([...m.calendars].sort());
    const status = m.skip_reason ? "skipped" : "pending";
    const result = await rows<{ inserted: boolean }>(sql`
      INSERT INTO vexa_meetings (meeting_key, platform, native_meeting_id, meeting_url, title, organizer,
        start_at, end_at, calendars, attendee_count, has_external, source, status, skip_reason, last_seen_at)
      VALUES (${m.key}, ${m.platform}, ${m.native_meeting_id}, ${m.meeting_url}, ${m.title}, ${m.organizer},
        ${m.start_at}::timestamptz, ${m.end_at}::timestamptz, ${calendarsJson}::jsonb, ${m.attendee_count}::int,
        ${m.has_external}::boolean, 'calendar', ${status}, ${m.skip_reason}, NOW())
      ON CONFLICT (meeting_key) DO UPDATE SET
        title = EXCLUDED.title,
        organizer = EXCLUDED.organizer,
        end_at = EXCLUDED.end_at,
        meeting_url = EXCLUDED.meeting_url,
        calendars = EXCLUDED.calendars,
        attendee_count = EXCLUDED.attendee_count,
        has_external = EXCLUDED.has_external,
        last_seen_at = NOW(),
        -- a cancelled meeting that reappears goes back to pending; manual skips stay skipped
        status = CASE
          WHEN vexa_meetings.status = 'cancelled' THEN EXCLUDED.status
          WHEN vexa_meetings.status = 'pending' AND EXCLUDED.status = 'skipped' THEN 'skipped'
          ELSE vexa_meetings.status END,
        skip_reason = CASE
          WHEN vexa_meetings.status IN ('pending', 'cancelled') THEN EXCLUDED.skip_reason
          ELSE vexa_meetings.skip_reason END,
        updated_at = NOW()
      RETURNING (xmax = 0) AS inserted`);
    if (result[0]?.inserted) inserted++;
    else updated++;
  }

  // Pending meetings in the scanned window that no calendar returned were moved or cancelled.
  // Only trust this when every calendar scanned cleanly and this was a full scan.
  let cancelled = 0;
  if (!only_email && failedCalendars === 0) {
    const gone = await rows<{ meeting_key: string }>(sql`
      UPDATE vexa_meetings SET status = 'cancelled', skip_reason = 'no longer on any calendar', updated_at = NOW()
      WHERE source = 'calendar' AND status = 'pending'
        AND start_at >= ${timeMin}::timestamptz AND start_at < ${timeMax}::timestamptz
        AND (last_seen_at IS NULL OR last_seen_at < ${upsertStarted}::timestamptz)
      RETURNING meeting_key`);
    cancelled = gone.length;
  }

  if (calendars.length && failedCalendars === calendars.length) {
    throw new Error(`every calendar failed; sources: ${JSON.stringify(Object.fromEntries([...sources].map(([k, v]) => [k, v.reason])))}`);
  }

  const summary = {
    window: { from: timeMin, to: timeMax },
    calendars_scanned: calendars.length,
    calendars_failed: failedCalendars,
    meetings_found: found.size,
    inserted,
    updated,
    cancelled,
  };
  await logEvent(sql, "scan", null, JSON.stringify(summary));
  return summary;
}
