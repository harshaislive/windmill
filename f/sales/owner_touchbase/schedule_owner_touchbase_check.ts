import * as wmill from "windmill-client";

const PIPEDRIVE_VARIABLE_PATH = "f/collectives/zoom_collective_to_pipedrive/pipedrive_api_key";
const DEFAULT_PIPEDRIVE_DOMAIN = "beforest";
const BEFOREST_ADMIN_USER_ID = 18891506;
const SEND_SCRIPT_PATH = "f/sales/owner_touchbase/send_owner_touchbase_check";
const CHECK_DELAY_HOURS_PATH = "f/sales/owner_touchbase/check_delay_hours";
const QUEUED_ACTIVITY_SUBJECT = "Owner touchbase check queued";

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

async function getDelayHours(input: number | null) {
  if (Number.isFinite(Number(input)) && Number(input) > 0) return Number(input);
  const configured = Number(await wmill.getVariable(CHECK_DELAY_HOURS_PATH).catch(() => "24"));
  return Number.isFinite(configured) && configured > 0 ? configured : 24;
}

async function queuedAlready(dealId: number, attempt: number) {
  const activities = await pipedriveV1("GET", `deals/${dealId}/activities?done=1&limit=100`).catch(() => []);
  return Array.isArray(activities) && activities.some((activity: any) =>
    asString(activity?.subject) === QUEUED_ACTIVITY_SUBJECT &&
    asString(activity?.note || activity?.note_clean).includes(`Attempt: ${attempt}`),
  );
}

async function logQueuedActivity(dealId: number, attempt: number, delayHours: number, jobId: string) {
  const dueAt = new Date(Date.now() + delayHours * 60 * 60_000).toISOString();
  return await pipedriveV1("POST", "activities", {
    deal_id: dealId,
    user_id: BEFOREST_ADMIN_USER_ID,
    subject: QUEUED_ACTIVITY_SUBJECT,
    type: "task",
    done: 1,
    due_date: todayInTimezone("Asia/Kolkata"),
    note: [
      "Queued the owner 1on1 touchbase check.",
      `Attempt: ${attempt}`,
      `Delay hours: ${delayHours}`,
      `Scheduled for: ${escapeHtml(dueAt)}`,
      `Windmill job: ${escapeHtml(jobId)}`,
      `Worker: ${SEND_SCRIPT_PATH}`,
    ].join("<br>"),
  });
}

export async function main(
  deal_id: number,
  attempt = 1,
  delay_hours: number | null = null,
  dry_run = false,
) {
  const dealId = Number(deal_id);
  const attemptNumber = Number(attempt) || 1;
  if (!Number.isFinite(dealId) || dealId <= 0) throw new Error("deal_id is required.");

  const deal = await pipedriveV2("GET", `deals/${dealId}`).catch((error) => {
    throw new Error(`Cannot queue owner touchbase check because deal ${dealId} was not found: ${error instanceof Error ? error.message : String(error)}`);
  });
  const delayHours = await getDelayHours(delay_hours);
  const args = { deal_id: dealId, attempt: attemptNumber, dry_run: false };
  const alreadyQueued = await queuedAlready(dealId, attemptNumber);

  if (dry_run) {
    return {
      dry_run: true,
      status: alreadyQueued ? "already_queued" : "would_queue",
      deal_id: dealId,
      deal_title: deal?.title || null,
      attempt: attemptNumber,
      delay_hours: delayHours,
      script_path: SEND_SCRIPT_PATH,
      args,
    };
  }

  if (alreadyQueued) {
    return {
      dry_run: false,
      status: "already_queued",
      deal_id: dealId,
      attempt: attemptNumber,
      script_path: SEND_SCRIPT_PATH,
    };
  }

  const jobId = await wmill.runScriptByPathAsync(SEND_SCRIPT_PATH, args, Math.round(delayHours * 3600));
  const activity = await logQueuedActivity(dealId, attemptNumber, delayHours, jobId);
  return {
    dry_run: false,
    status: "queued",
    deal_id: dealId,
    deal_title: deal?.title || null,
    attempt: attemptNumber,
    delay_hours: delayHours,
    script_path: SEND_SCRIPT_PATH,
    job_id: jobId,
    activity_id: Number(activity?.id) || null,
  };
}
