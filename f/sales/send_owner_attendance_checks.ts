import * as wmill from "windmill-client";

const PIPEDRIVE_VARIABLE_PATH = "f/collectives/zoom_collective_to_pipedrive/pipedrive_api_key";
const INTERAKT_API_KEY_PATH = "f/sales/calendar_prebook_1on1/interakt_api_key";
const INTERAKT_BASE_URL_PATH = "f/sales/calendar_prebook_1on1/interakt_base_url";
const DEFAULT_PIPEDRIVE_DOMAIN = "beforest";
const DEFAULT_TIMEZONE = "Asia/Kolkata";
const ONE_ON_ONE_PENDING_LABEL_ID = 106;
const OWNER_ATTENDANCE_TEMPLATE_NAME = "collective_owner_attendance_check";
const OWNER_ATTENDANCE_TEMPLATE_ID = "1735882337778498";
const BEFOREST_ADMIN_USER_ID = 18891506;

const DEAL_FIELDS = {
  oneOnOneMeetingDateTime: "d6fd8c9877d20bfd678ecb37f21e5b33bd2717fd",
};

const PIPEDRIVE_OWNER_ALIASES: Record<number, string> = {
  22251956: "Vivekanand",
  13490118: "Rakesh",
};

const OWNER_PHONE_NUMBERS: Record<string, string> = {
  Vivekanand: "+916396252216",
  Rakesh: "+918527494761",
};

type Deal = {
  id: number;
  title: string;
  label?: unknown;
  label_ids?: Array<number | string>;
  labels?: Array<{ id?: number | string } | number | string>;
  owner_id?: number | { id?: number; name?: string; email?: string };
  custom_fields?: Record<string, unknown>;
  [key: string]: unknown;
};

type InteraktRecipient = {
  countryCode?: string;
  phoneNumber?: string;
  fullPhoneNumber?: string;
};

type AttendanceCheckPlan = {
  deal_id: number;
  deal_title: string;
  owner: string;
  meeting_datetime: string;
  template_name: string;
  whatsapp_template_id: string;
  recipient: InteraktRecipient;
  raw_phone_present: boolean;
  body_values: string[];
  callback_data: string;
  already_logged: boolean;
};

function asString(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function isPlaceholder(value: string): boolean {
  return !value || /dummy|placeholder|changeme|replace/i.test(value);
}

async function pipedriveV1(method: string, path: string, body?: Record<string, unknown>, query?: Record<string, unknown>) {
  const url = new URL(`https://${DEFAULT_PIPEDRIVE_DOMAIN}.pipedrive.com/api/v1/${path.replace(/^\/+/, "")}`);
  url.searchParams.set("api_token", await wmill.getVariable(PIPEDRIVE_VARIABLE_PATH));
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(`Pipedrive v1 ${method} ${path} failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function getDeal(dealId: number): Promise<Deal> {
  const payload = await pipedriveV1("GET", `deals/${dealId}`);
  return payload.data as Deal;
}

async function listOpenDeals(maxDeals: number): Promise<Deal[]> {
  const deals: Deal[] = [];
  let start = 0;
  while (deals.length < maxDeals) {
    const payload = await pipedriveV1("GET", "deals", undefined, {
      status: "open",
      start,
      limit: Math.min(500, maxDeals - deals.length),
    });
    const page = Array.isArray(payload.data) ? payload.data as Deal[] : [];
    deals.push(...page);
    const pagination = payload.additional_data?.pagination;
    if (!pagination?.more_items_in_collection || !page.length) break;
    start = Number(pagination.next_start) || start + page.length;
  }
  return deals;
}

function labelIds(deal: Deal): number[] {
  const values: unknown[] = [];
  if (Array.isArray(deal.label_ids)) values.push(...deal.label_ids);
  if (Array.isArray(deal.labels)) values.push(...deal.labels.map((label) => (typeof label === "object" && label ? label.id : label)));
  if (deal.label !== undefined) values.push(deal.label);
  return values
    .flatMap((value) => asString(value).split(","))
    .map((value) => Number(value.trim()))
    .filter(Boolean);
}

function ownerId(deal: Deal): number | null {
  if (typeof deal.owner_id === "number") return deal.owner_id;
  if (deal.owner_id && typeof deal.owner_id === "object") return Number(deal.owner_id.id) || null;
  return null;
}

function ownerAlias(deal: Deal): string {
  const id = ownerId(deal);
  if (id && PIPEDRIVE_OWNER_ALIASES[id]) return PIPEDRIVE_OWNER_ALIASES[id];
  if (deal.owner_id && typeof deal.owner_id === "object") return asString(deal.owner_id.name) || "default";
  return "default";
}

function ownerDisplayName(owner: string): string {
  if (owner === "Rakesh") return "Sai Rakesh";
  if (owner === "Vivekanand") return "Vivekanand";
  return owner;
}

function dealField(deal: Deal, key: string): unknown {
  return deal.custom_fields?.[key] ?? deal[key];
}

function parseMeetingDate(deal: Deal): Date | null {
  const raw = asString(dealField(deal, DEAL_FIELDS.oneOnOneMeetingDateTime));
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function interaktRecipient(rawPhone: string): InteraktRecipient {
  const cleaned = asString(rawPhone).replace(/[^\d+]/g, "");
  const digits = cleaned.replace(/\D/g, "");
  if (!digits) return {};
  if (cleaned.startsWith("+")) return { fullPhoneNumber: digits };
  if (digits.length === 10) return { countryCode: "+91", phoneNumber: digits };
  if (digits.length === 12 && digits.startsWith("91")) return { fullPhoneNumber: digits };
  return { fullPhoneNumber: digits };
}

function formatDateForWhatsApp(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: timezone,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatTimeForWhatsApp(date: Date, timezone: string): string {
  return `${new Intl.DateTimeFormat("en-IN", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date).toUpperCase()} IST`;
}

function activitySubject(meetingIso: string): string {
  return "Owner attendance check sent";
}

async function attendanceCheckAlreadyLogged(dealId: number, meetingIso: string): Promise<boolean> {
  const payload = await pipedriveV1("GET", "activities", undefined, {
    deal_id: dealId,
    done: 1,
    limit: 500,
  });
  const activities = Array.isArray(payload.data) ? payload.data : [];
  return activities.some((activity: any) =>
    asString(activity.subject) === activitySubject(meetingIso) &&
    asString(activity.note).includes(`Meeting: ${meetingIso}`),
  );
}

async function createAttendanceCheckActivity(plan: AttendanceCheckPlan) {
  const now = new Date();
  return await pipedriveV1("POST", "activities", {
    deal_id: plan.deal_id,
    user_id: BEFOREST_ADMIN_USER_ID,
    subject: activitySubject(plan.meeting_datetime),
    type: "task",
    done: 1,
    due_date: now.toISOString().slice(0, 10),
    note: [
      `Asked ${ownerDisplayName(plan.owner)} whether the 1on1 happened.`,
      `Meeting: ${plan.meeting_datetime}`,
    ].join("<br>"),
  });
}

function safeJson(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(/[<>&]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[char] || char));
}

function assertWhatsAppReady(plan: AttendanceCheckPlan) {
  if (!plan.raw_phone_present || (!plan.recipient.fullPhoneNumber && !(plan.recipient.countryCode && plan.recipient.phoneNumber))) {
    throw new Error(`Cannot send owner attendance check for deal ${plan.deal_id}: no usable owner phone.`);
  }
}

async function sendInteraktTemplate(plan: AttendanceCheckPlan) {
  const apiKey = await wmill.getVariable(INTERAKT_API_KEY_PATH);
  if (!apiKey || isPlaceholder(apiKey)) {
    throw new Error(`Interakt API key is missing or still dummy at ${INTERAKT_API_KEY_PATH}.`);
  }
  const baseUrl = (await wmill.getVariable(INTERAKT_BASE_URL_PATH).catch(() => "https://api.interakt.ai")) || "https://api.interakt.ai";
  const authorization = apiKey.toLowerCase().startsWith("basic ") ? apiKey : `Basic ${apiKey}`;
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/v1/public/message/`, {
    method: "POST",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify({
      ...plan.recipient,
      callbackData: plan.callback_data,
      template_category: "utility",
      type: "Template",
      template: {
        name: plan.template_name,
        languageCode: "en",
        bodyValues: plan.body_values,
      },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.result === false) {
    throw new Error(`Interakt owner attendance check failed for deal ${plan.deal_id}: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function buildPlan(
  deal: Deal,
  now: Date,
  timezone: string,
  meetingDurationMinutes: number,
  graceMinutes: number,
  maxLateHours: number,
  includeAlreadyLogged: boolean,
): Promise<AttendanceCheckPlan | null> {
  if (!labelIds(deal).includes(ONE_ON_ONE_PENDING_LABEL_ID)) return null;
  const meeting = parseMeetingDate(deal);
  if (!meeting) return null;

  const eligibleAt = new Date(meeting.getTime() + (meetingDurationMinutes + graceMinutes) * 60_000);
  if (now.getTime() < eligibleAt.getTime()) return null;
  if (now.getTime() - eligibleAt.getTime() > maxLateHours * 60 * 60_000) return null;

  const meetingIso = meeting.toISOString();
  const alreadyLogged = await attendanceCheckAlreadyLogged(deal.id, meetingIso).catch(() => false);
  if (alreadyLogged && !includeAlreadyLogged) return null;

  const owner = ownerAlias(deal);
  const phone = OWNER_PHONE_NUMBERS[owner] || "";
  return {
    deal_id: deal.id,
    deal_title: deal.title,
    owner,
    meeting_datetime: meetingIso,
    template_name: OWNER_ATTENDANCE_TEMPLATE_NAME,
    whatsapp_template_id: OWNER_ATTENDANCE_TEMPLATE_ID,
    recipient: interaktRecipient(phone),
    raw_phone_present: Boolean(phone),
    body_values: [
      ownerDisplayName(owner),
      deal.title,
      formatDateForWhatsApp(meeting, timezone),
      formatTimeForWhatsApp(meeting, timezone),
    ],
    callback_data: `pipedrive_deal:${deal.id}:owner_attendance_check`,
    already_logged: alreadyLogged,
  };
}

export async function main(
  dry_run = true,
  deal_id: number | null = null,
  now_iso = "",
  timezone = DEFAULT_TIMEZONE,
  meeting_duration_minutes = 30,
  grace_minutes = 30,
  max_late_hours = 72,
  max_deals = 500,
  include_already_logged = false,
) {
  const now = now_iso ? new Date(now_iso) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error(`Invalid now_iso: ${now_iso}`);

  const deals = deal_id ? [await getDeal(Number(deal_id))] : await listOpenDeals(max_deals);
  const plans = (await Promise.all(deals.map((deal) =>
    buildPlan(
      deal,
      now,
      asString(timezone) || DEFAULT_TIMEZONE,
      Number(meeting_duration_minutes) || 30,
      Number(grace_minutes) || 30,
      Number(max_late_hours) || 72,
      include_already_logged,
    ),
  ))).filter(Boolean) as AttendanceCheckPlan[];

  if (dry_run) {
    return {
      dry_run: true,
      checked_deals: deals.length,
      planned_count: plans.length,
      plans,
    };
  }

  const sent = [];
  const skipped = [];
  for (const plan of plans) {
    if (plan.already_logged) {
      skipped.push({ ...plan, reason: "already_logged" });
      continue;
    }
    assertWhatsAppReady(plan);
    const whatsapp = await sendInteraktTemplate(plan);
    const activity = await createAttendanceCheckActivity(plan);
    sent.push({ ...plan, whatsapp, activity_id: activity?.data?.id || activity?.id || null });
  }

  return {
    dry_run: false,
    checked_deals: deals.length,
    planned_count: plans.length,
    sent_count: sent.length,
    skipped_count: skipped.length,
    sent,
    skipped,
  };
}
