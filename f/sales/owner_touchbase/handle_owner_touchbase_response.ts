import * as wmill from "windmill-client";

const PIPEDRIVE_VARIABLE_PATH = "f/collectives/zoom_collective_to_pipedrive/pipedrive_api_key";
const DEFAULT_PIPEDRIVE_DOMAIN = "beforest";
const BEFOREST_ADMIN_USER_ID = 18891506;
const SCHEDULE_SCRIPT_PATH = "f/sales/owner_touchbase/schedule_owner_touchbase_check";
const REMINDER_INTERVAL_HOURS_PATH = "f/sales/owner_touchbase/reminder_interval_hours";
const MAX_REMINDERS_PATH = "f/sales/owner_touchbase/max_reminders";
const CONFIRMED_ACTIVITY_SUBJECT = "Owner confirmed lead touched base";
const PENDING_ACTIVITY_SUBJECT = "Owner marked touchbase pending";
const LIMIT_ACTIVITY_SUBJECT = "Owner touchbase reminder limit reached";

function asString(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function escapeHtml(value: string): string {
  return value.replace(/[<>&]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[char] || char));
}

function todayInTimezone(timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function parseDealId(route: Record<string, unknown>): number | null {
  const explicit = Number(route?.deal_id);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const text = [route?.callback_data, route?.button_text].map(asString).join(" ");
  const match = text.match(/pipedrive_deal:(\d+)/i) ?? text.match(/deal[_\s-]?id[:=]\s*(\d+)/i);
  return match?.[1] ? Number(match[1]) : null;
}

function parseAttempt(route: Record<string, unknown>): number {
  const text = [route?.callback_data, route?.button_text].map(asString).join(" ");
  const match = text.match(/owner_touchbase_check:(\d+)/i);
  const attempt = Number(match?.[1]);
  return Number.isFinite(attempt) && attempt > 0 ? attempt : 1;
}

function actionFromRoute(route: Record<string, unknown>) {
  const explicit = asString(route?.action);
  if (explicit === "owner_touchbase_confirmed" || explicit === "owner_touchbase_pending") return explicit;
  const text = asString(route?.button_text).toLowerCase();
  if (text.includes("no") || text.includes("pending")) return "owner_touchbase_pending";
  return "owner_touchbase_confirmed";
}

async function pipedriveV1(method: string, path: string, body?: Record<string, unknown>) {
  const url = new URL(`https://${DEFAULT_PIPEDRIVE_DOMAIN}.pipedrive.com/api/v1/${path.replace(/^\/+/, "")}`);
  url.searchParams.set("api_token", await wmill.getVariable(PIPEDRIVE_VARIABLE_PATH));
  const response = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(`Pipedrive v1 ${method} ${path} failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload.data;
}

async function pipedriveV2(method: string, path: string) {
  const url = new URL(`https://${DEFAULT_PIPEDRIVE_DOMAIN}.pipedrive.com/api/v2/${path.replace(/^\/+/, "")}`);
  url.searchParams.set("api_token", await wmill.getVariable(PIPEDRIVE_VARIABLE_PATH));
  const response = await fetch(url, { method });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(`Pipedrive v2 ${method} ${path} failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload.data;
}

async function getActivities(dealId: number) {
  const [openActivities, doneActivities] = await Promise.all([
    pipedriveV1("GET", `deals/${dealId}/activities?done=0&limit=500`).catch(() => []),
    pipedriveV1("GET", `deals/${dealId}/activities?done=1&limit=500`).catch(() => []),
  ]);
  return [
    ...(Array.isArray(openActivities) ? openActivities : []),
    ...(Array.isArray(doneActivities) ? doneActivities : []),
  ];
}

function hasActivity(activities: any[], subject: string, attempt?: number) {
  return activities.some((activity) => {
    if (asString(activity?.subject) !== subject) return false;
    if (!attempt) return true;
    return asString(activity?.note || activity?.note_clean).includes(`Attempt: ${attempt}`);
  });
}

async function createActivity(dealId: number, subject: string, note: string, done: 0 | 1 = 1) {
  return await pipedriveV1("POST", "activities", {
    deal_id: dealId,
    user_id: BEFOREST_ADMIN_USER_ID,
    subject,
    type: "task",
    done,
    due_date: todayInTimezone("Asia/Kolkata"),
    note,
  });
}

async function maxReminders() {
  const configured = Number(await wmill.getVariable(MAX_REMINDERS_PATH).catch(() => "3"));
  return Number.isFinite(configured) && configured > 0 ? configured : 3;
}

async function reminderIntervalHours() {
  const configured = Number(await wmill.getVariable(REMINDER_INTERVAL_HOURS_PATH).catch(() => "24"));
  return Number.isFinite(configured) && configured > 0 ? configured : 24;
}

async function logLimitReached(dealId: number, attempt: number, max: number) {
  return await createActivity(
    dealId,
    LIMIT_ACTIVITY_SUBJECT,
    [
      "Owner marked touchbase pending, but the automatic reminder limit has been reached.",
      `Latest attempt: ${attempt}`,
      `Max reminders: ${max}`,
      "Manual owner follow-up is required.",
    ].join("<br>"),
    0,
  );
}

async function queueNextReminder(dealId: number, nextAttempt: number, delayHours: number, dryRun: boolean) {
  const args = { deal_id: dealId, attempt: nextAttempt, delay_hours: delayHours, dry_run: false };
  if (dryRun) return { status: "would_queue", script_path: SCHEDULE_SCRIPT_PATH, args };
  const jobId = await wmill.runScriptByPathAsync(SCHEDULE_SCRIPT_PATH, args, 0);
  return { status: "queued", script_path: SCHEDULE_SCRIPT_PATH, job_id: jobId, args };
}

export async function main(route: Record<string, unknown>, dry_run = false) {
  const dealId = parseDealId(route || {});
  const attempt = parseAttempt(route || {});
  const action = actionFromRoute(route || {});
  if (!dealId) {
    return { handled: false, status: "missing_deal_id", action, route, dry_run };
  }

  const deal = await pipedriveV2("GET", `deals/${dealId}`).catch(() => null);
  if (!deal) return { handled: false, status: "deal_not_found", action, deal_id: dealId, dry_run };

  const activities = await getActivities(dealId);
  const responseSubject = action === "owner_touchbase_pending" ? PENDING_ACTIVITY_SUBJECT : CONFIRMED_ACTIVITY_SUBJECT;
  if (hasActivity(activities, responseSubject, attempt)) {
    return { handled: true, status: "already_logged", action, deal_id: dealId, attempt, dry_run };
  }

  const note = [
    action === "owner_touchbase_pending"
      ? "Owner replied that the lead touchbase is still pending."
      : "Owner confirmed that the lead has been touched base with.",
    `Deal: ${escapeHtml(asString((deal as any).title))} (#${dealId})`,
    `Attempt: ${attempt}`,
    `Button text: ${escapeHtml(asString(route?.button_text))}`,
    `Callback data: ${escapeHtml(asString(route?.callback_data))}`,
  ].join("<br>");

  if (dry_run) {
    const max = await maxReminders();
    return {
      handled: true,
      dry_run: true,
      status: "would_log_response",
      action,
      deal_id: dealId,
      attempt,
      planned_activity: { subject: responseSubject, note },
      next_reminder: action === "owner_touchbase_pending" && attempt < max
        ? await queueNextReminder(dealId, attempt + 1, await reminderIntervalHours(), true)
        : null,
    };
  }

  const activity = await createActivity(dealId, responseSubject, note, 1);
  let nextReminder: Record<string, unknown> | null = null;
  if (action === "owner_touchbase_pending") {
    const max = await maxReminders();
    if (attempt >= max) {
      const limitActivity = await logLimitReached(dealId, attempt, max);
      nextReminder = {
        status: "limit_reached",
        activity_id: Number(limitActivity?.id) || null,
      };
    } else {
      nextReminder = await queueNextReminder(dealId, attempt + 1, await reminderIntervalHours(), false);
    }
  }

  return {
    handled: true,
    status: "completed",
    action,
    deal_id: dealId,
    attempt,
    activity_id: Number(activity?.id) || null,
    next_reminder: nextReminder,
    dry_run: false,
  };
}
