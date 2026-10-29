import * as wmill from "windmill-client";
import {
  db, ensureSchema, seedDefaults, getSettings, rows, logEvent, parseMeetingLink, vexaRequest, vexaErrorText, vexaFetchRaw,
  DEFAULT_SETTINGS,
} from "./vexa_core.ts";
import { dispatchOne } from "./dispatch_bots.ts";

type Action =
  | "overview"
  | "send_now"
  | "send_queued"
  | "skip"
  | "unskip"
  | "stop_bot"
  | "transcript"
  | "library"
  | "meeting_detail"
  | "audio_chunk"
  | "toggle_calendar"
  | "set_setting"
  | "scan_now"
  | "dispatch_now"
  | "check_access";

/**
 * Backend for the Vexa console app. One entry point, switched on `action`.
 */
export async function main(action: Action = "overview", payload: object = {}) {
  const p = (payload || {}) as Record<string, any>;
  const sql = db();
  await ensureSchema(sql);
  await seedDefaults(sql);
  const actor = process.env.WM_USERNAME || "console";

  switch (action) {
    case "overview": {
      const hoursBack = Number(p.hours_back ?? 12);
      const hoursAhead = Number(p.hours_ahead ?? 24);
      const meetings = await rows(sql`
        SELECT id, meeting_key, platform, native_meeting_id, meeting_url, title, organizer, start_at, end_at,
               calendars, attendee_count, has_external, source, status, skip_reason, attempts, last_error,
               vexa_status, vexa_meeting_id, requested_by, bot_name, outcome, outcome_detail, dispatched_at, updated_at
        FROM vexa_meetings
        WHERE (start_at IS NULL AND created_at > NOW() - make_interval(hours => ${hoursBack}::int))
           OR (start_at >= NOW() - make_interval(hours => ${hoursBack}::int)
               AND start_at <= NOW() + make_interval(hours => ${hoursAhead}::int))
        ORDER BY COALESCE(start_at, created_at)
        LIMIT 500`);
      const calendars = await rows(sql`
        SELECT email, display_name, enabled, access_status, source, last_scanned_at, last_scan_ok, last_error, meetings_found
        FROM vexa_calendars ORDER BY enabled DESC, email`);
      const sources = await rows(sql`
        SELECT name, maton_key_path, expected_identity, verified_identity, last_checked_at, last_status FROM vexa_sources ORDER BY name`);
      const events = await rows(sql`SELECT id, at, kind, meeting_key, detail FROM vexa_events ORDER BY at DESC LIMIT 60`);
      const lastScan = await rows(sql`SELECT at, detail FROM vexa_events WHERE kind = 'scan' ORDER BY at DESC LIMIT 1`);
      const alerts = await rows(sql`SELECT kind, active_since, last_sent_at, last_detail FROM vexa_alerts WHERE active_since IS NOT NULL`);
      const live = await vexaRequest("GET", "/bots/status").catch((error) => ({ ok: false, status: 0, data: String(error.message || error) }));
      return {
        now: new Date().toISOString(),
        settings: await getSettings(sql),
        meetings,
        calendars,
        sources,
        events,
        last_scan: lastScan[0] || null,
        alerts,
        live_bots: live.ok ? (live.data?.running_bots || live.data?.running || []) : [],
        live_error: live.ok ? null : `HTTP ${live.status} ${vexaErrorText(live.data)}`,
      };
    }

    case "send_now": {
      const link = parseMeetingLink(String(p.meeting_url || ""));
      if (!link) throw new Error("Unrecognised link. Paste a Google Meet, Zoom or Teams meeting URL.");
      const settings = await getSettings(sql);
      const key = `${link.platform}:${link.native_meeting_id}:manual:${Date.now()}`;
      const inserted = await rows<{ id: number }>(sql`
        INSERT INTO vexa_meetings (meeting_key, platform, native_meeting_id, meeting_url, title, source, status, start_at, end_at, requested_by)
        VALUES (${key}, ${link.platform}, ${link.native_meeting_id}, ${link.meeting_url},
                ${String(p.title || "Manual send")}, 'manual', 'pending', NOW(), NOW() + INTERVAL '2 hours', ${actor})
        RETURNING id`);
      const name = String(p.bot_name || (p.brand === "bewild" ? settings.bot_name_bewild : settings.bot_name));
      return await dispatchOne(sql, inserted[0].id, settings, actor, ["pending"], name);
    }

    case "send_queued": {
      const settings = await getSettings(sql);
      return await dispatchOne(sql, Number(p.id), settings, actor, ["pending", "skipped", "failed", "missed", "cancelled", "stopped"]);
    }

    case "skip":
    case "unskip": {
      const next = action === "skip" ? "skipped" : "pending";
      const from = action === "skip" ? "pending,failed,missed" : "skipped,failed,missed,cancelled";
      const updated = await rows(sql`
        UPDATE vexa_meetings SET status = ${next}, skip_reason = ${action === "skip" ? `skipped by ${actor}` : null},
          attempts = CASE WHEN ${next}::text = 'pending' THEN 0 ELSE attempts END, last_error = NULL, updated_at = NOW()
        WHERE id = ${Number(p.id)}::bigint AND status = ANY(string_to_array(${from}, ','))
        RETURNING meeting_key, status`);
      if (updated[0]) await logEvent(sql, action, updated[0].meeting_key, `by ${actor}`);
      return updated[0] || { error: "meeting not in a state that allows this" };
    }

    case "stop_bot": {
      const found = await rows<any>(sql`SELECT * FROM vexa_meetings WHERE id = ${Number(p.id)}::bigint`);
      const m = found[0];
      if (!m) throw new Error("meeting not found");
      const platform = m.vexa_platform || m.platform;
      const native = m.vexa_native_id || m.native_meeting_id;
      const res = await vexaRequest("DELETE", `/bots/${platform}/${encodeURIComponent(native)}`);
      if (res.ok || res.status === 404) {
        await sql`UPDATE vexa_meetings SET status = 'stopped', vexa_status = 'stopped', updated_at = NOW() WHERE id = ${m.id}::bigint`.execute();
      }
      await logEvent(sql, "bot_stop", m.meeting_key, `by ${actor}: HTTP ${res.status}`);
      return { status: res.status, data: res.data };
    }

    case "transcript":
    case "meeting_detail": {
      // Accepts a Vexa meeting id (library) or a queue row id (queue tab).
      let vexaId = p.vexa_meeting_id != null ? String(p.vexa_meeting_id) : "";
      let path = "";
      let queueTitle: string | null = null;
      if (!vexaId && p.id != null) {
        const found = await rows<any>(sql`SELECT * FROM vexa_meetings WHERE id = ${Number(p.id)}::bigint`);
        const m = found[0];
        if (!m) throw new Error("meeting not found");
        queueTitle = m.title;
        vexaId = m.vexa_meeting_id || "";
        if (!vexaId) path = `/transcripts/${m.vexa_platform || m.platform}/${encodeURIComponent(m.vexa_native_id || m.native_meeting_id)}`;
      }
      if (!path) path = `/transcripts/by-id/${encodeURIComponent(vexaId)}`;
      const res = await vexaRequest("GET", path);
      if (!res.ok) return { error: `HTTP ${res.status} ${vexaErrorText(res.data)}`, segments: [], recordings: [] };
      const d = res.data || {};
      const segments = (d.segments || [])
        .filter((s: any) => s.completed !== false)
        .map((s: any) => ({ speaker: s.speaker || "", text: s.text, start: s.start, end: s.end }));
      let recordings: any[] = d.recordings || [];
      if (!recordings.length && d.id != null) {
        const list = await vexaRequest("GET", "/recordings?limit=100");
        recordings = (list.data?.recordings || []).filter((r: any) => String(r.meeting_id) === String(d.id));
      }
      return {
        meeting: {
          id: d.id, platform: d.platform, native_meeting_id: d.native_meeting_id, status: d.status,
          title: d.data?.title || queueTitle || d.native_meeting_id, start_time: d.start_time, end_time: d.end_time,
        },
        segments,
        recordings: recordings.map((r: any) => ({
          id: r.id, status: r.status, duration_seconds: r.duration_seconds,
          media: (r.media_files || []).filter((f: any) => f.type === "audio").map((f: any) => ({
            id: f.id, format: f.format, size: f.file_size_bytes, duration_seconds: f.duration_seconds,
          })),
        })),
      };
    }

    case "library": {
      const limit = Math.min(Number(p.limit) || 50, 100);
      const offset = Math.max(Number(p.offset) || 0, 0);
      const res = await vexaRequest("GET", `/meetings?limit=${limit}&offset=${offset}&exclude_planned=true`);
      if (!res.ok) return { error: `HTTP ${res.status} ${vexaErrorText(res.data)}`, meetings: [] };
      const recs = await vexaRequest("GET", "/recordings?limit=100");
      const audio = new Map<string, { size: number; status: string }>();
      for (const r of recs.data?.recordings || []) {
        const size = (r.media_files || []).filter((f: any) => f.type === "audio").reduce((n: number, f: any) => n + (f.file_size_bytes || 0), 0);
        audio.set(String(r.meeting_id), { size, status: r.status });
      }
      // Titles we know from the calendar queue, for meetings Vexa has no title for.
      const queued = await rows<any>(sql`SELECT vexa_meeting_id, title FROM vexa_meetings WHERE vexa_meeting_id IS NOT NULL`);
      const titles = new Map(queued.map((q) => [String(q.vexa_meeting_id), q.title]));
      const meetings = (res.data?.meetings || []).map((m: any) => ({
        id: m.id, platform: m.platform, native_meeting_id: m.native_meeting_id, status: m.status,
        title: m.data?.title || titles.get(String(m.id)) || m.native_meeting_id,
        start_time: m.start_time, end_time: m.end_time, created_at: m.created_at,
        calendar_managed: !!m.data?.calendar_managed, completion_reason: m.completion_reason,
        audio_bytes: audio.get(String(m.id))?.size || 0, recording_status: audio.get(String(m.id))?.status || null,
      }));
      return { meetings, offset, limit, has_more: Boolean(res.data?.has_more) || meetings.length === limit };
    }

    case "audio_chunk": {
      // Vexa streams audio only with the API key, so the browser pulls it through here in ranges.
      const recordingId = Number(p.recording_id);
      const mediaId = Number(p.media_id);
      const offset = Math.max(Number(p.offset) || 0, 0);
      const length = Math.min(Number(p.length) || 4_000_000, 4_000_000);
      if (!recordingId || !mediaId) throw new Error("recording_id and media_id required");
      const res = await vexaFetchRaw(`/recordings/${recordingId}/media/${mediaId}/raw?type=audio`, { Range: `bytes=${offset}-${offset + length - 1}` });
      if (!res.ok) throw new Error(`Vexa audio HTTP ${res.status}`);
      let bytes = new Uint8Array(await res.arrayBuffer());
      let total = Number(res.headers.get("content-range")?.split("/")[1]) || 0;
      if (res.status === 200) {
        // Range ignored: we got the whole file, so slice it ourselves.
        total = bytes.length;
        bytes = bytes.slice(offset, offset + length);
      }
      return {
        content_type: res.headers.get("content-type") || "audio/webm",
        offset, bytes: bytes.length, total,
        done: offset + bytes.length >= total,
        base64: Buffer.from(bytes).toString("base64"),
      };
    }

    case "toggle_calendar": {
      const updated = await rows(sql`
        UPDATE vexa_calendars SET enabled = ${Boolean(p.enabled)}::boolean
        WHERE email = ${String(p.email)} RETURNING email, enabled`);
      if (updated[0]) await logEvent(sql, "calendar_toggle", null, `${p.email} -> ${p.enabled} by ${actor}`);
      return updated[0] || { error: "calendar not found" };
    }

    case "set_setting": {
      const key = String(p.key);
      if (!(key in DEFAULT_SETTINGS)) throw new Error(`unknown setting ${key}`);
      const value = String(p.value);
      await sql`
        INSERT INTO vexa_settings (key, value, updated_at) VALUES (${key}, ${value}, NOW())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`.execute();
      await logEvent(sql, "setting", null, `${key} = ${value} by ${actor}`);
      return { key, value };
    }

    case "scan_now":
      return { job_id: await wmill.runScriptByPathAsync("f/vexa/scan_calendars", {}) };

    case "check_access":
      return { job_id: await wmill.runScriptByPathAsync("f/vexa/check_calendar_access", { source: String(p.source || "bewild"), enable_readable: true }) };

    case "dispatch_now":
      return { job_id: await wmill.runScriptByPathAsync("f/vexa/dispatch_bots", {}) };

    default:
      throw new Error(`unknown action ${action}`);
  }
}
