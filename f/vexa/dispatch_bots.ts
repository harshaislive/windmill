import * as wmill from "windmill-client";
import { db, ensureSchema, getSettings, rows, logEvent, vexaRequest, vexaErrorText, botNameFor, setAlert, VEXA_KEY_PATH, type Sql } from "./vexa_core.ts";

type MeetingRow = { id: number; meeting_key: string; meeting_url: string; platform: string; native_meeting_id: string; attempts: number; organizer: string | null; calendars: string[] | null };

export type DispatchOutcome = { meeting_key: string; result: "dispatched" | "already_active" | "rate_limited" | "out_of_credit" | "failed" | "retry" | "not_claimed"; detail?: string };

/** Claim one queued meeting and ask Vexa for a bot. Safe against concurrent runs. */
export async function dispatchOne(sql: Sql, id: number, settings: Record<string, string>, requestedBy: string, allowStatuses = ["pending"], botNameOverride = ""): Promise<DispatchOutcome> {
  const claimed = await rows<MeetingRow>(sql`
    UPDATE vexa_meetings SET status = 'dispatching', attempts = attempts + 1, updated_at = NOW()
    WHERE id = ${id}::bigint AND status = ANY(string_to_array(${allowStatuses.join(",")}, ','))
    RETURNING id, meeting_key, meeting_url, platform, native_meeting_id, attempts, organizer, calendars`);
  const m = claimed[0];
  if (!m) return { meeting_key: String(id), result: "not_claimed", detail: "meeting is not in a sendable state" };

  const botName = botNameOverride || botNameFor(settings, m.organizer, m.calendars);
  const leaveAloneMs = (Number(settings.leave_alone_seconds) || 0) * 1000;
  const body: Record<string, unknown> = { meeting_url: m.meeting_url, bot_name: botName };
  if (leaveAloneMs > 0) body.automatic_leave = { max_time_left_alone: leaveAloneMs };
  let res;
  try {
    res = await vexaRequest("POST", "/bots", body);
    if (res.status === 422 && body.automatic_leave) {
      // Never lose a bot over the optional leave setting: retry without it.
      delete body.automatic_leave;
      await logEvent(sql, "automatic_leave_rejected", m.meeting_key, vexaErrorText(res.data));
      res = await vexaRequest("POST", "/bots", body);
    }
  } catch (error) {
    res = { status: 0, ok: false, data: String((error as Error).message || error) };
  }
  const data = res.data && typeof res.data === "object" ? res.data : {};
  const responseJson = JSON.stringify(res.data ?? null);

  if (res.ok) {
    await sql`
      UPDATE vexa_meetings SET status = 'dispatched', dispatched_at = NOW(), last_error = NULL,
        vexa_meeting_id = ${data.id != null ? String(data.id) : null},
        vexa_platform = ${data.platform || m.platform},
        vexa_native_id = ${data.native_meeting_id || m.native_meeting_id},
        vexa_status = ${data.status || "requested"}, outcome = 'joining', outcome_detail = NULL,
        vexa_response = ${responseJson}::jsonb, requested_by = ${requestedBy}, bot_name = ${botName}, updated_at = NOW()
      WHERE id = ${m.id}::bigint`.execute();
    await logEvent(sql, "bot_sent", m.meeting_key, `${botName} by ${requestedBy}`);
    return { meeting_key: m.meeting_key, result: "dispatched" };
  }

  const detail = `HTTP ${res.status} ${vexaErrorText(res.data)}`;
  let status = "pending";
  let result: DispatchOutcome["result"] = "retry";
  if (res.status === 409) {
    status = "dispatched";
    result = "already_active";
  } else if ((res.status === 402 || res.status === 403) && /insufficient_balance|balance|credit|payment/i.test(detail)) {
    result = "out_of_credit"; // account needs topping up: keep queued, alert, try next run
  } else if (res.status === 403 || res.status === 429) {
    result = "rate_limited"; // concurrency limit: keep queued and try next run
  } else if (res.status === 400 || res.status === 422 || res.status === 404) {
    status = "failed";
    result = "failed";
  } else if (res.status === 401) {
    status = "pending";
    result = "failed";
  } else if (m.attempts >= 3) {
    status = "failed";
    result = "failed";
  }
  await sql`
    UPDATE vexa_meetings SET status = ${status}, last_error = ${detail},
      vexa_status = CASE WHEN ${status}::text = 'dispatched' THEN 'already_active' ELSE vexa_status END,
      outcome = CASE WHEN ${status}::text = 'dispatched' THEN 'already_active' ELSE outcome END,
      vexa_platform = COALESCE(vexa_platform, platform), vexa_native_id = COALESCE(vexa_native_id, native_meeting_id),
      dispatched_at = CASE WHEN ${status}::text = 'dispatched' THEN NOW() ELSE dispatched_at END,
      requested_by = ${requestedBy}, updated_at = NOW()
    WHERE id = ${m.id}::bigint`.execute();
  await logEvent(sql, `bot_${result}`, m.meeting_key, detail);
  if (res.status === 401) throw new Error("Vexa rejected the API key (401). Check f/vexa/vexa_api_key.");
  return { meeting_key: m.meeting_key, result, detail };
}

/** Segment times are either absolute epoch seconds or seconds from meeting start. */
function segmentEpochMs(value: number, meetingStartMs: number) {
  if (!Number.isFinite(value)) return 0;
  return value > 1e9 ? value * 1000 : meetingStartMs + value * 1000;
}

type WatchDecision = { vexa_meeting_id: string; title: string; minutes_in: number; minutes_silent: number; rule: string; action: "stop" | "keep" };

/**
 * Stale-bot watchdog. Vexa's own exit listens for sound, so an open mic or room device keeps a bot in an
 * empty meeting for hours. This checks transcript activity instead and removes bots that stopped hearing speech.
 */
async function watchdog(sql: Sql, settings: Record<string, string>, reportOnly: boolean): Promise<WatchDecision[]> {
  if (settings.watchdog_enabled !== "true") return [];
  const afterEnd = Number(settings.silence_after_end_minutes) || 10;
  const during = Number(settings.silence_during_minutes) || 10;
  const capAfterEnd = Number(settings.hard_cap_after_end_minutes) || 30;
  const manualMax = Number(settings.manual_max_minutes) || 120;

  const status = await vexaRequest("GET", "/bots/status").catch(() => null);
  if (!status?.ok) return [];
  const bots: any[] = status.data?.running_bots || status.data?.running || [];
  const now = Date.now();
  const decisions: WatchDecision[] = [];

  for (const bot of bots) {
    if (bot.status !== "active" || !bot.start_time) continue; // lobby/joining is Vexa's job
    const joinedMs = Date.parse(bot.start_time);
    const queue = await rows<{ id: number; title: string; end_at: string | null; source: string; meeting_key: string }>(sql`
      SELECT id, title, end_at, source, meeting_key FROM vexa_meetings
      WHERE vexa_meeting_id = ${String(bot.id)}
         OR (vexa_platform = ${String(bot.platform)} AND vexa_native_id = ${String(bot.native_meeting_id)} AND status = 'dispatched')
      ORDER BY (vexa_meeting_id = ${String(bot.id)}) DESC, dispatched_at DESC NULLS LAST LIMIT 1`);
    const row = queue[0];
    const endMs = row?.end_at && row.source !== "manual" ? Date.parse(row.end_at) : null;

    // Last moment we heard speech: newest transcript segment (drafts count too), else when the bot joined.
    let lastSpeechMs = joinedMs;
    const tr = await vexaRequest("GET", `/transcripts/by-id/${encodeURIComponent(String(bot.id))}`).catch(() => null);
    if (!tr?.ok) continue; // can't judge silence without a transcript; try again next run
    for (const seg of tr.data?.segments || []) {
      const t = segmentEpochMs(Number(seg.end ?? seg.start), joinedMs);
      if (t > lastSpeechMs && t <= now + 60_000) lastSpeechMs = t;
    }
    const silentMin = (now - lastSpeechMs) / 60_000;
    const inMin = (now - joinedMs) / 60_000;

    let rule = "";
    if (endMs != null) {
      if (now > endMs + capAfterEnd * 60_000) rule = `hard cap: ${capAfterEnd} min past scheduled end`;
      else if (now > endMs && silentMin >= afterEnd) rule = `no speech for ${afterEnd} min after scheduled end`;
      else if (silentMin >= during) rule = `no speech for ${during} min`;
    } else {
      if (inMin >= manualMax) rule = `hard cap: ${manualMax} min (no scheduled end)`;
      else if (silentMin >= during) rule = `no speech for ${during} min`;
    }

    const decision: WatchDecision = {
      vexa_meeting_id: String(bot.id), title: row?.title || bot.data?.title || bot.native_meeting_id,
      minutes_in: Math.round(inMin), minutes_silent: Math.round(silentMin), rule: rule || "ok", action: rule ? "stop" : "keep",
    };
    decisions.push(decision);
    if (!rule || reportOnly) continue;

    const stop = await vexaRequest("DELETE", `/bots/${bot.platform}/${encodeURIComponent(bot.native_meeting_id)}`).catch(() => null);
    const detail = `${rule}; in ${decision.minutes_in} min, silent ${decision.minutes_silent} min; HTTP ${stop?.status ?? 0}`;
    if ((stop?.ok || stop?.status === 404) && row) {
      await sql`UPDATE vexa_meetings SET status = 'stopped', vexa_status = 'auto_left', last_error = ${`Auto-left: ${rule}`}, updated_at = NOW()
        WHERE id = ${row.id}::bigint`.execute();
    }
    await logEvent(sql, "bot_auto_left", row?.meeting_key || `vexa:${bot.id}`, detail);
  }
  return decisions;
}

const OUT_OF_CREDIT = {
  subject: "Vexa is out of credit",
  first: (since: string) =>
    `Vexa ran out of credit at ${since}, so the meeting bots aren't joining calls right now.\n\n` +
    "Could you top up the Vexa account? Meetings in the queue will go out on their own once it's done.",
  reminder: (since: string) =>
    `Just a reminder: Vexa has been out of credit since ${since}, so bots still aren't joining meetings.\n\n` +
    "Could you top it up when you get a chance?",
  resolvedSubject: "Vexa is back",
  resolved: () => "Vexa has credit again and the bots are joining meetings as usual.",
};

const TERMINAL_OUTCOMES =["recorded", "not_admitted", "rejected", "join_failed"];

/** Translate a Vexa meeting record into what actually happened to our bot. */
export function outcomeOf(m: any): { outcome: string; detail: string | null } {
  const status = String(m?.status || "");
  const reason = String(m?.completion_reason || "");
  const stage = String(m?.failure_stage || "");
  if (status === "completed") return { outcome: "recorded", detail: reason || null };
  if (status === "failed") {
    if (reason === "awaiting_admission_rejected") return { outcome: "rejected", detail: "someone denied the bot entry" };
    if (stage === "awaiting_admission" || reason === "awaiting_admission_timeout") return { outcome: "not_admitted", detail: "nobody admitted the bot from the waiting room" };
    return { outcome: "join_failed", detail: [reason, stage].filter(Boolean).join(" at ") || null };
  }
  if (status === "awaiting_admission") return { outcome: "waiting_admission", detail: null };
  if (status === "active" || status === "stopping") return { outcome: "recording", detail: null };
  return { outcome: "joining", detail: status || null };
}

/** Pull the real result of each recent bot from Vexa until it reaches a final state. */
async function syncOutcomes(sql: Sql) {
  const open = await rows<{ id: number; vexa_meeting_id: string; outcome: string | null }>(sql`
    SELECT id, vexa_meeting_id, outcome FROM vexa_meetings
    WHERE status IN ('dispatched', 'stopped') AND vexa_meeting_id IS NOT NULL
      AND dispatched_at > NOW() - INTERVAL '36 hours'
      AND (outcome IS NULL OR outcome NOT IN ('recorded', 'not_admitted', 'rejected', 'join_failed'))
    ORDER BY dispatched_at DESC LIMIT 60`);
  let changed = 0;
  for (const row of open) {
    const res = await vexaRequest("GET", `/meetings/${encodeURIComponent(row.vexa_meeting_id)}`).catch(() => null);
    if (!res?.ok) continue;
    const { outcome, detail } = outcomeOf(res.data);
    if (outcome !== row.outcome) {
      await sql`UPDATE vexa_meetings SET outcome = ${outcome}, outcome_detail = ${detail}, vexa_status = ${String(res.data?.status || "")}, updated_at = NOW()
        WHERE id = ${row.id}::bigint`.execute();
      if (TERMINAL_OUTCOMES.includes(outcome)) await logEvent(sql, `outcome_${outcome}`, String(row.vexa_meeting_id), detail || "");
      changed++;
    }
  }
  return changed;
}

/**
 * Send bots for queued meetings that start within the lead window.
 * Runs every few minutes; the hourly scanner only fills the queue.
 */
export async function main(dry_run = false, watchdog_report_only = false) {
  const sql = db();
  await ensureSchema(sql);
  const settings = await getSettings(sql);
  const lead = Number(settings.dispatch_lead_minutes) || 2;
  const late = Number(settings.late_join_minutes) || 15;

  const due = await rows<{ id: number; meeting_key: string; title: string; start_at: string }>(sql`
    SELECT id, meeting_key, title, start_at FROM vexa_meetings
    WHERE status = 'pending'
      AND start_at <= NOW() + make_interval(mins => ${lead}::int)
      AND start_at >= NOW() - make_interval(mins => ${late}::int)
    ORDER BY start_at, id`);
  if (dry_run || watchdog_report_only) {
    const watch = watchdog_report_only ? await watchdog(sql, settings, true) : [];
    return { dry_run, auto_dispatch_enabled: settings.auto_dispatch_enabled === "true", would_send: due, watchdog: watch };
  }

  // Release claims from a crashed run, and retire meetings we can no longer join.
  await sql`UPDATE vexa_meetings SET status = 'pending', updated_at = NOW()
    WHERE status = 'dispatching' AND updated_at < NOW() - INTERVAL '10 minutes'`.execute();
  const missed = await rows(sql`
    UPDATE vexa_meetings SET status = 'missed', updated_at = NOW()
    WHERE status = 'pending' AND (end_at < NOW() OR start_at < NOW() - make_interval(mins => ${late}::int))
    RETURNING id`);

  const hasKey = await wmill.getVariable(VEXA_KEY_PATH).then(Boolean).catch(() => false);
  if (!hasKey) return { error: `Vexa API key missing at ${VEXA_KEY_PATH}; nothing sent`, missed: missed.length, waiting: due.length };

  // Runs even when auto-send is paused, so manually sent bots are watched too.
  const watch = await watchdog(sql, settings, false);

  if (settings.auto_dispatch_enabled !== "true") {
    return { auto_dispatch_enabled: false, missed: missed.length, waiting: due.length, watchdog: watch };
  }

  const outcomes: DispatchOutcome[] = [];
  for (const meeting of due) {
    const outcome = await dispatchOne(sql, meeting.id, settings, "auto");
    outcomes.push(outcome);
    if (outcome.result === "rate_limited" || outcome.result === "out_of_credit") break; // nothing else will go through this run
  }

  // Out-of-credit alert: raise on refusal, clear once a bot is accepted again.
  const broke = outcomes.find((o) => o.result === "out_of_credit");
  if (broke) {
    await setAlert(sql, settings, "vexa_out_of_credit", true, OUT_OF_CREDIT, broke.detail || "");
  } else if (outcomes.some((o) => o.result === "dispatched" || o.result === "already_active")) {
    await setAlert(sql, settings, "vexa_out_of_credit", false, OUT_OF_CREDIT, "credit restored");
  }

  const statusChanges = await syncOutcomes(sql);
  return { missed: missed.length, due: due.length, outcomes, status_changes: statusChanges, watchdog: watch };
}
