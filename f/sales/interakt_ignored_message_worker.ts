import * as wmill from "windmill-client";

const PIPEDRIVE_VARIABLE_PATH = "f/collectives/zoom_collective_to_pipedrive/pipedrive_api_key";
const PIPEDRIVE_DOMAIN = "beforest";
const BEFOREST_ADMIN_USER_ID = 18891506;

function asString(value: unknown) {
  return String(value ?? "").trim();
}

function asNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
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
  const apiToken = await wmill.getVariable(PIPEDRIVE_VARIABLE_PATH);
  const url = new URL(`https://${PIPEDRIVE_DOMAIN}.pipedrive.com/api/v1/${path.replace(/^\/+/, "")}`);
  url.searchParams.set("api_token", apiToken);
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(`Pipedrive v1 ${method} ${path} failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload.data;
}

function failureNote(route: Record<string, unknown>) {
  const errorCode = asString(route.channel_error_code);
  const reason = asString(route.channel_failure_reason);
  const templateName = asString(route.template_name);
  const phone = asString(route.phone);
  const lines = [
    "WhatsApp could not deliver this message.",
    errorCode || reason ? `Error: ${[errorCode, reason].filter(Boolean).join(" - ")}` : "",
    templateName ? `Template: ${templateName}` : "",
    phone ? `Phone: +${phone.replace(/^\+/, "")}` : "",
  ].filter(Boolean);
  return lines.join("<br>");
}

async function createFailureActivity(route: Record<string, unknown>, dry_run: boolean) {
  const dealId = asNumber(route.deal_id);
  if (!dealId) {
    return {
      logged: false,
      reason: "missing_deal_id",
      message_id: route.message_id ?? null,
      error_code: route.channel_error_code ?? null,
    };
  }

  const body = {
    deal_id: dealId,
    user_id: BEFOREST_ADMIN_USER_ID,
    subject: "WhatsApp failed to deliver",
    type: "task",
    done: 0,
    due_date: todayInTimezone("Asia/Kolkata"),
    note: failureNote(route),
  };

  if (dry_run) return { logged: false, dry_run: true, planned_activity: body };
  const activity = await pipedriveV1("POST", "activities", body);
  return {
    logged: true,
    activity_id: Number(activity?.id) || null,
  };
}

export async function main(route: Record<string, unknown>, dry_run = false) {
  if (route?.action === "message_failed") {
    const failure = await createFailureActivity(route, dry_run);
    return {
      handled: true,
      action: "message_failed",
      status: failure.logged ? "pipedrive_activity_created" : "not_logged",
      deal_id: route?.deal_id ?? null,
      error_code: route?.channel_error_code ?? null,
      failure_reason: route?.channel_failure_reason ?? null,
      dry_run,
      ...failure,
    };
  }

  return {
    handled: true,
    action: "ignored",
    deal_id: route?.deal_id ?? null,
    status: "ignored_unrecognized_interakt_message",
    dry_run,
    button_text: route?.button_text ?? null,
  };
}
