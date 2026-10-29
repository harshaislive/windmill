import * as wmill from "windmill-client";

const PIPEDRIVE_VARIABLE_PATH = "f/collectives/zoom_collective_to_pipedrive/pipedrive_api_key";
const INTERAKT_API_KEY_PATH = "f/sales/calendar_prebook_1on1/interakt_api_key";
const INTERAKT_BASE_URL_PATH = "f/sales/calendar_prebook_1on1/interakt_base_url";
const DEFAULT_PIPEDRIVE_DOMAIN = "beforest";
const BEFOREST_ADMIN_USER_ID = 18891506;
const TEMPLATE_NAME = "collective_1on1_team_scheduling_notice";
const SENT_ACTIVITY_SUBJECT = "1on1 team scheduling notice sent";
const OWNER_TOUCHBASE_SCHEDULE_SCRIPT_PATH = "f/sales/owner_touchbase/schedule_owner_touchbase_check";
const MAILCHIMP_FALLBACK_SCRIPT_PATH = "f/sales/send_mailchimp_fallback_after_whatsapp_failure";
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const FALLBACK_DELAY_MINUTES = 45;
const QUIET_START_HOUR_IST = 22;
const QUIET_END_HOUR_IST = 8;

type Deal = Record<string, any> & {
  id?: number;
  title?: string;
  pipeline_id?: number | { id?: number };
  person_id?: number | { id?: number };
  custom_fields?: Record<string, unknown>;
};

type Person = {
  id?: number;
  name?: string;
  phones?: Array<{ value?: string; primary?: boolean }>;
  phone?: Array<{ value?: string; primary?: boolean }>;
};

type InteraktRecipient = {
  countryCode?: string;
  phoneNumber?: string;
  fullPhoneNumber?: string;
};

const DEAL_FIELDS = {
  phone: "7f1ebc80670dad0d9f6ea3d5f2585c923395305a",
};

const COLLECTIVES_BY_PIPELINE: Record<number, { label: string }> = {
  1: { label: "Hammiyala Collective" },
  2: { label: "Mumbai Collective" },
  3: { label: "Poomaale Collective 2.0" },
  4: { label: "Bhopal Collective" },
  6: { label: "Hyderabad Collective" },
};

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(asString(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function escapeHtml(value: string): string {
  return value.replace(/[<>&]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[char] || char));
}

function pipelineId(deal: Deal): number | null {
  if (typeof deal.pipeline_id === "object") return asNumber(deal.pipeline_id?.id);
  return asNumber(deal.pipeline_id);
}

function personId(deal: Deal): number | null {
  if (typeof deal.person_id === "number") return deal.person_id;
  if (deal.person_id && typeof deal.person_id === "object") return asNumber(deal.person_id.id);
  return null;
}

function primaryPhone(person: Person | null): string {
  const phones = [...(person?.phones || []), ...(person?.phone || [])];
  return asString(phones.find((entry) => entry.primary)?.value || phones[0]?.value);
}

function dealPhone(deal: Deal): string {
  return asString(deal.custom_fields?.[DEAL_FIELDS.phone] ?? deal[DEAL_FIELDS.phone]);
}

function firstName(deal: Deal, person: Person | null): string {
  const source = asString(person?.name || deal.title);
  return source.split(/\s+/).filter(Boolean)[0] || "there";
}

function interaktRecipient(rawPhone: string): InteraktRecipient {
  const cleaned = asString(rawPhone).replace(/[^\d+]/g, "");
  if (!cleaned) return {};
  const digits = cleaned.replace(/\D/g, "");
  if (digits.length === 10) return { countryCode: "+91", phoneNumber: digits };
  if (digits.length === 11 && digits.startsWith("0")) return { countryCode: "+91", phoneNumber: digits.slice(1) };
  if (digits.length === 12 && digits.startsWith("91")) return { fullPhoneNumber: digits };
  if (cleaned.startsWith("+")) return { fullPhoneNumber: digits };
  return { fullPhoneNumber: digits };
}

function displayPhone(rawPhone: string): string {
  const cleaned = asString(rawPhone).replace(/[^\d+]/g, "");
  const digits = cleaned.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
  return `+${digits}`;
}

function assertRecipientReady(recipient: InteraktRecipient, rawPhone: string) {
  if (!rawPhone || (!recipient.fullPhoneNumber && !(recipient.countryCode && recipient.phoneNumber))) {
    throw new Error("No usable WhatsApp phone found for this deal.");
  }
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

function istDayStartUtcMs(timestampMs: number): number {
  const istDate = new Date(timestampMs + IST_OFFSET_MS);
  return Date.UTC(istDate.getUTCFullYear(), istDate.getUTCMonth(), istDate.getUTCDate()) - IST_OFFSET_MS;
}

function istHour(timestampMs: number): number {
  return new Date(timestampMs + IST_OFFSET_MS).getUTCHours();
}

function nextFallbackEmailTime(timestampMs: number): number {
  const hour = istHour(timestampMs);
  const dayStart = istDayStartUtcMs(timestampMs);
  if (hour < QUIET_END_HOUR_IST) return dayStart + QUIET_END_HOUR_IST * 60 * 60 * 1000;
  if (hour >= QUIET_START_HOUR_IST) return dayStart + 24 * 60 * 60 * 1000 + QUIET_END_HOUR_IST * 60 * 60 * 1000;
  return timestampMs + FALLBACK_DELAY_MINUTES * 60 * 1000;
}

async function queueMailchimpFallback(dealId: number) {
  const now = Date.now();
  const scheduledInSeconds = Math.max(0, Math.ceil((nextFallbackEmailTime(now) - now) / 1000));
  return await wmill.runScriptByPathAsync(
    MAILCHIMP_FALLBACK_SCRIPT_PATH,
    {
      dry_run: false,
      send_campaigns: true,
      target_deal_id: dealId,
      max_deals: 1,
      max_emails: 1,
      fallback_delay_minutes: FALLBACK_DELAY_MINUTES,
      quiet_start_hour_ist: QUIET_START_HOUR_IST,
      quiet_end_hour_ist: QUIET_END_HOUR_IST,
    },
    scheduledInSeconds,
  );
}

async function pipedriveRequest(
  method: string,
  path: string,
  options: { params?: Record<string, unknown>; body?: Record<string, unknown>; apiVersion?: "v1" | "v2" } = {},
): Promise<any> {
  const apiToken = await wmill.getVariable(PIPEDRIVE_VARIABLE_PATH);
  const url = new URL(`https://${DEFAULT_PIPEDRIVE_DOMAIN}.pipedrive.com/api/${options.apiVersion || "v2"}/${path}`);
  url.searchParams.set("api_token", apiToken);
  for (const [key, value] of Object.entries(options.params || {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    method,
    headers: options.body ? { "content-type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(`Pipedrive ${method} ${path} failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function getDeal(dealId: number): Promise<Deal> {
  const payload = await pipedriveRequest("GET", `deals/${dealId}`);
  return payload.data as Deal;
}

async function getPerson(id: number): Promise<Person | null> {
  const payload = await pipedriveRequest("GET", `persons/${id}`).catch(() => null);
  return payload?.data || null;
}

async function createPipedriveActivity(
  dealId: number,
  subject: string,
  note: string,
  options: { personId?: number | null; done?: 0 | 1 } = {},
) {
  const payload = await pipedriveRequest("POST", "activities", {
    apiVersion: "v1",
    body: {
      deal_id: dealId,
      ...(options.personId ? { person_id: options.personId } : {}),
      user_id: BEFOREST_ADMIN_USER_ID,
      subject,
      type: "task",
      done: options.done ?? 1,
      due_date: todayInTimezone("Asia/Kolkata"),
      note,
    },
  });
  return payload.data;
}

async function hasSentActivity(dealId: number): Promise<boolean> {
  const payload = await pipedriveRequest("GET", `deals/${dealId}/activities`, {
    apiVersion: "v1",
    params: { done: 1, limit: 100 },
  });
  return (payload.data || []).some((activity: any) => asString(activity.subject) === SENT_ACTIVITY_SUBJECT);
}

function manualNotice(firstNameValue: string, collective: string): string {
  return [
    `Hi ${firstNameValue || "there"},`,
    "",
    `Your request for a 1on1 conversation for ${collective} is in review. One of our team members will message you directly to schedule the conversation.`,
  ].join("\n");
}

function manualFailureNote(params: { reason: string; phone: string; manualMessage: string }) {
  const phone = displayPhone(params.phone);
  return [
    "1on1 scheduling notice WhatsApp delivery failed. Please send this manually from WhatsApp Web.",
    params.reason ? `Reason: ${escapeHtml(params.reason)}` : "",
    phone ? `Send to: ${escapeHtml(phone)}` : "Send to: phone number on the Pipedrive person/deal.",
    `Template: ${escapeHtml(TEMPLATE_NAME)}`,
    "",
    "<strong>Copy-paste message</strong>",
    `<pre>${escapeHtml(params.manualMessage)}</pre>`,
  ].filter(Boolean).join("<br>");
}

function touchbaseQueueFailureNote(reason: string) {
  return [
    "The lead-facing 1on1 scheduling notice was sent, but Windmill could not queue the owner touchbase check.",
    `Reason: ${escapeHtml(reason)}`,
    `Queue script: ${OWNER_TOUCHBASE_SCHEDULE_SCRIPT_PATH}`,
    "",
    "Manual action: please check whether the owner has touched base with this lead. If not, message the owner directly.",
  ].join("<br>");
}

async function sendInteraktTemplate(plan: {
  recipient: InteraktRecipient;
  bodyValues: string[];
  callbackData: string;
}) {
  const apiKey = await wmill.getVariable(INTERAKT_API_KEY_PATH);
  const baseUrl = (await wmill.getVariable(INTERAKT_BASE_URL_PATH).catch(() => "https://api.interakt.ai")) || "https://api.interakt.ai";
  const authorization = apiKey.toLowerCase().startsWith("basic ") ? apiKey : `Basic ${apiKey}`;
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/v1/public/message/`, {
    method: "POST",
    headers: {
      authorization,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      ...plan.recipient,
      callbackData: plan.callbackData,
      template_category: "marketing",
      type: "Template",
      template: {
        name: TEMPLATE_NAME,
        languageCode: "en",
        bodyValues: plan.bodyValues,
      },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.result === false) {
    throw new Error(`Interakt 1on1 scheduling notice failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

export async function main(deal_id: number, dry_run = false) {
  const dealId = Number(deal_id);
  if (!Number.isFinite(dealId) || dealId <= 0) throw new Error("deal_id is required.");

  const deal = await getDeal(dealId);
  const config = COLLECTIVES_BY_PIPELINE[pipelineId(deal) || 0];
  const pid = personId(deal);
  const person = pid ? await getPerson(pid) : null;
  const rawPhone = primaryPhone(person) || dealPhone(deal);
  const recipient = interaktRecipient(rawPhone);
  const alreadySent = await hasSentActivity(dealId);

  if (!config) return { status: "ignored", reason: "Unsupported pipeline for 1on1 notice.", deal_id: dealId };
  if (alreadySent) return { status: "skipped", reason: "1on1 scheduling notice was already logged.", deal_id: dealId };

  const bodyValues = [firstName(deal, person), config.label];
  const manualMessage = manualNotice(bodyValues[0], config.label);
  const plan = {
    template_name: TEMPLATE_NAME,
    recipient,
    raw_phone_present: Boolean(rawPhone),
    body_values: bodyValues,
    callback_data: `pipedrive_deal:${dealId}:1on1_team_scheduling_notice`,
  };

  if (dry_run) {
    return {
      dry_run: true,
      status: "would_send",
      deal_id: dealId,
      deal_title: deal.title || null,
      collective: config.label,
      plan,
      owner_touchbase_queue: {
        status: "would_queue",
        script_path: OWNER_TOUCHBASE_SCHEDULE_SCRIPT_PATH,
        args: { deal_id: dealId, dry_run: false },
      },
      manual_message: manualMessage,
    };
  }

  try {
    assertRecipientReady(recipient, rawPhone);
    const interaktResponse = await sendInteraktTemplate({
      recipient,
      bodyValues,
      callbackData: plan.callback_data,
    });
    const activity = await createPipedriveActivity(
      dealId,
      SENT_ACTIVITY_SUBJECT,
      [
        "Sent the 1on1 team scheduling notice on WhatsApp.",
        `Collective: ${config.label}`,
        `Template: ${TEMPLATE_NAME}`,
        "",
        "<strong>Message sent</strong>",
        `<pre>${escapeHtml(manualMessage)}</pre>`,
      ].join("<br>"),
      { personId: pid },
    );
    let ownerTouchbaseQueue: Record<string, unknown>;
    try {
      const jobId = await wmill.runScriptByPathAsync(
        OWNER_TOUCHBASE_SCHEDULE_SCRIPT_PATH,
        { deal_id: dealId, dry_run: false },
        0,
      );
      ownerTouchbaseQueue = {
        status: "queued",
        script_path: OWNER_TOUCHBASE_SCHEDULE_SCRIPT_PATH,
        job_id: jobId,
      };
    } catch (queueError) {
      const reason = queueError instanceof Error ? queueError.message : String(queueError);
      const queueFailureActivity = await createPipedriveActivity(
        dealId,
        "Owner touchbase check queue failed",
        touchbaseQueueFailureNote(reason),
        { personId: pid, done: 0 },
      );
      ownerTouchbaseQueue = {
        status: "queue_failed_manual_task_created",
        script_path: OWNER_TOUCHBASE_SCHEDULE_SCRIPT_PATH,
        error: reason,
        manual_review_activity_id: Number(queueFailureActivity?.id) || null,
      };
    }
    return {
      dry_run: false,
      status: "sent",
      deal_id: dealId,
      collective: config.label,
      interakt_response: interaktResponse,
      audit_activity_id: Number(activity?.id) || null,
      owner_touchbase_queue: ownerTouchbaseQueue,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const activity = await createPipedriveActivity(
      dealId,
      "WhatsApp failed to deliver",
      manualFailureNote({
        reason: message,
        phone: rawPhone,
        manualMessage,
      }),
      { personId: pid, done: 0 },
    );
    const fallbackJobId = await queueMailchimpFallback(dealId).catch(() => null);
    return {
      dry_run: false,
      status: "failed",
      deal_id: dealId,
      error: message,
      manual_review_activity_id: Number(activity?.id) || null,
      mailchimp_fallback_job_id: fallbackJobId,
    };
  }
}
