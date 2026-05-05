import * as wmill from "windmill-client";

const PIPEDRIVE_VARIABLE_PATH = "f/collectives/zoom_collective_to_pipedrive/pipedrive_api_key";
const INTERAKT_API_KEY_PATH = "f/sales/calendar_prebook_1on1/interakt_api_key";
const INTERAKT_BASE_URL_PATH = "f/sales/calendar_prebook_1on1/interakt_base_url";
const DEFAULT_PIPEDRIVE_DOMAIN = "beforest";
const DEFAULT_TIMEZONE = "Asia/Kolkata";
const ONE_ON_ONE_PENDING_LABEL_ID = 106;
const BEFOREST_ADMIN_USER_ID = 18891506;

const DEAL_FIELDS = {
  oneOnOneMeetingDateTime: "d6fd8c9877d20bfd678ecb37f21e5b33bd2717fd",
  meetingUrl: "c818768b64d54270c74b931b4581082b543c8571",
  phone: "7f1ebc80670dad0d9f6ea3d5f2585c923395305a",
};

const PIPEDRIVE_OWNER_ALIASES: Record<number, string> = {
  22251956: "Vivekanand",
  13490118: "Rakesh",
};

const REMINDERS = [
  {
    key: "3d",
    label: "3 days before",
    offsetMinutes: 72 * 60,
    templateName: "collective_1on1_reminder_3days_before",
    whatsappTemplateId: "1068416189695731",
    category: "utility" as const,
    bodyMode: "date_time" as const,
  },
  {
    key: "24h",
    label: "24 hours before",
    offsetMinutes: 24 * 60,
    templateName: "collective_1on1_reminder_24hrs_before",
    whatsappTemplateId: "1448524886960644",
    category: "utility" as const,
    bodyMode: "date_time" as const,
  },
  {
    key: "1h",
    label: "1 hour before",
    offsetMinutes: 60,
    templateName: "collective_1on1_reminder_1hr_before",
    whatsappTemplateId: "996140132850094",
    category: "utility" as const,
    bodyMode: "time" as const,
  },
];

type Deal = {
  id: number;
  title: string;
  status?: string;
  label?: unknown;
  label_ids?: Array<number | string>;
  labels?: Array<{ id?: number | string } | number | string>;
  owner_id?: number | { id?: number; name?: string; email?: string };
  person_id?: number | { id?: number; name?: string; email?: Array<{ value?: string; primary?: boolean }> };
  custom_fields?: Record<string, unknown>;
  [key: string]: unknown;
};

type Person = {
  phones?: Array<{ value?: string; primary?: boolean }>;
  phone?: Array<{ value?: string; primary?: boolean }>;
};

type InteraktRecipient = {
  countryCode?: string;
  phoneNumber?: string;
  fullPhoneNumber?: string;
};

type ReminderPlan = {
  deal_id: number;
  deal_title: string;
  owner: string;
  meeting_datetime: string;
  reminder_key: string;
  reminder_label: string;
  target_at: string;
  template_name: string;
  whatsapp_template_id: string;
  recipient: InteraktRecipient;
  raw_phone_present: boolean;
  body_values: string[];
  already_logged: boolean;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function isPlaceholder(value: string): boolean {
  return !value || /dummy|placeholder|changeme|replace/i.test(value);
}

async function pipedriveV1(method: string, path: string, body?: Record<string, unknown>, query?: Record<string, unknown>) {
  const apiToken = await wmill.getVariable(PIPEDRIVE_VARIABLE_PATH);
  const url = new URL(`https://${DEFAULT_PIPEDRIVE_DOMAIN}.pipedrive.com/api/v1/${path.replace(/^\/+/, "")}`);
  url.searchParams.set("api_token", apiToken);
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

async function pipedriveV2(method: string, path: string, body?: Record<string, unknown>, query?: Record<string, unknown>) {
  const apiToken = await wmill.getVariable(PIPEDRIVE_VARIABLE_PATH);
  const url = new URL(`https://${DEFAULT_PIPEDRIVE_DOMAIN}.pipedrive.com/api/v2/${path.replace(/^\/+/, "")}`);
  url.searchParams.set("api_token", apiToken);
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
    throw new Error(`Pipedrive v2 ${method} ${path} failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload.data;
}

async function getDeal(dealId: number): Promise<Deal> {
  const payload = await pipedriveV1("GET", `deals/${dealId}`);
  return payload.data as Deal;
}

async function getPerson(personId: number): Promise<Person> {
  return (await pipedriveV2("GET", `persons/${personId}`)) as Person;
}

async function listOpenDeals(maxDeals: number): Promise<Deal[]> {
  const deals: Deal[] = [];
  let start = 0;
  const pageLimit = Math.min(500, Math.max(1, maxDeals));

  while (deals.length < maxDeals) {
    const payload = await pipedriveV1("GET", "deals", undefined, {
      status: "open",
      start,
      limit: Math.min(pageLimit, maxDeals - deals.length),
    });
    const pageDeals = Array.isArray(payload.data) ? (payload.data as Deal[]) : [];
    deals.push(...pageDeals);
    const pagination = payload.additional_data?.pagination;
    if (!pagination?.more_items_in_collection || !pageDeals.length) break;
    start = Number(pagination.next_start) || start + pageDeals.length;
  }

  return deals;
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
  const ownerName = asString(deal.owner_name);
  if (/vivek|vivekanand/i.test(ownerName)) return "Vivekanand";
  if (/rakesh|sai/i.test(ownerName)) return "Rakesh";
  if (ownerName) return ownerName;
  return "default";
}

function ownerDisplayName(owner: string): string {
  if (owner === "Rakesh") return "Sai Rakesh";
  if (owner === "Vivekanand") return "Vivekanand";
  return owner;
}

function personId(deal: Deal): number | null {
  if (typeof deal.person_id === "number") return deal.person_id;
  if (deal.person_id && typeof deal.person_id === "object") return Number(deal.person_id.id) || null;
  return null;
}

function primaryPhone(person: Person | null): string {
  const phones = [...(person?.phones || []), ...(person?.phone || [])];
  return asString(phones.find((entry) => entry.primary)?.value || phones[0]?.value);
}

function dealField(deal: Deal, fieldKey: string): unknown {
  return deal.custom_fields?.[fieldKey] ?? deal[fieldKey];
}

function dealPhone(deal: Deal): string {
  return asString(dealField(deal, DEAL_FIELDS.phone));
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

function parseMeetingDate(deal: Deal): Date | null {
  const raw = asString(dealField(deal, DEAL_FIELDS.oneOnOneMeetingDateTime));
  if (!raw) return null;

  const legacyTextDate = parsePipedriveTextDate(raw);
  if (legacyTextDate) return legacyTextDate;

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parsePipedriveTextDate(raw: string): Date | null {
  const match = raw.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})\s+(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!match) return null;

  const months: Record<string, number> = {
    jan: 0,
    january: 0,
    feb: 1,
    february: 1,
    mar: 2,
    march: 2,
    apr: 3,
    april: 3,
    may: 4,
    jun: 5,
    june: 5,
    jul: 6,
    july: 6,
    aug: 7,
    august: 7,
    sep: 8,
    sept: 8,
    september: 8,
    oct: 9,
    october: 9,
    nov: 10,
    november: 10,
    dec: 11,
    december: 11,
  };

  const day = Number(match[1]);
  const month = months[match[2].toLowerCase()];
  const year = Number(match[3]);
  let hour = Number(match[4]);
  const minute = Number(match[5]);
  const meridiem = match[6].toLowerCase();
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (!Number.isFinite(day) || month === undefined || !Number.isFinite(year) || !Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }

  const istOffsetMinutes = 330;
  return new Date(Date.UTC(year, month, day, hour, minute) - istOffsetMinutes * 60_000);
}

function interaktRecipient(rawPhone: string): InteraktRecipient {
  const cleaned = asString(rawPhone).replace(/[^\d+]/g, "");
  if (!cleaned) return {};
  const digits = cleaned.replace(/\D/g, "");
  if (cleaned.startsWith("+")) return { fullPhoneNumber: digits };
  if (digits.length === 10) return { countryCode: "+91", phoneNumber: digits };
  if (digits.length === 12 && digits.startsWith("91")) return { fullPhoneNumber: digits };
  return { fullPhoneNumber: digits };
}

function assertWhatsAppReady(plan: ReminderPlan) {
  if (!plan.raw_phone_present || (!plan.recipient.fullPhoneNumber && !(plan.recipient.countryCode && plan.recipient.phoneNumber))) {
    throw new Error(`Cannot send ${plan.reminder_key} 1on1 reminder for deal ${plan.deal_id}: no usable recipient phone.`);
  }
}

function formatDateTimeForWhatsApp(date: Date, timezone: string): string {
  const datePart = new Intl.DateTimeFormat("en-IN", {
    timeZone: timezone,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
  return `${datePart}, ${formatTimeForWhatsApp(date, timezone)}`;
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

async function reminderAlreadyLogged(dealId: number, reminderKey: string, meetingIso: string): Promise<boolean> {
  const subject = activitySubject(reminderKey, meetingIso);
  const payload = await pipedriveV1("GET", "activities", undefined, {
    deal_id: dealId,
    done: 1,
    limit: 500,
  });
  const activities = Array.isArray(payload.data) ? payload.data : [];
  return activities.some((activity: any) =>
    asString(activity.subject) === subject &&
    asString(activity.note).includes(`Reminder: ${reminderKey}`) &&
    asString(activity.note).includes(`Meeting: ${meetingIso}`),
  );
}

function activitySubject(reminderKey: string, meetingIso: string): string {
  return `1on1 reminder sent - ${reminderKey}`;
}

async function createReminderActivity(plan: ReminderPlan) {
  const now = new Date();
  return await pipedriveV1("POST", "activities", {
    deal_id: plan.deal_id,
    user_id: BEFOREST_ADMIN_USER_ID,
    subject: activitySubject(plan.reminder_key, plan.meeting_datetime),
    type: "task",
    done: 1,
    due_date: now.toISOString().slice(0, 10),
    note: [
      `Sent ${plan.reminder_label} reminder on WhatsApp.`,
      `Reminder: ${plan.reminder_key}`,
      `Meeting: ${plan.meeting_datetime}`,
    ].join("<br>"),
  });
}

function safeJson(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(/[<>&]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[char] || char));
}

async function buildReminderPlans(
  deal: Deal,
  now: Date,
  timezone: string,
  maxLateMinutes: number,
  includeAlreadyLogged: boolean,
): Promise<ReminderPlan[]> {
  const meeting = parseMeetingDate(deal);
  if (!meeting || meeting.getTime() <= now.getTime()) return [];
  if (!labelIds(deal).includes(ONE_ON_ONE_PENDING_LABEL_ID)) return [];

  const pid = personId(deal);
  const person = pid ? await getPerson(pid).catch(() => null) : null;
  const phone = primaryPhone(person) || dealPhone(deal);
  const owner = ownerAlias(deal);
  const meetingIso = meeting.toISOString();
  const plans: ReminderPlan[] = [];

  for (const reminder of REMINDERS) {
    const targetAt = new Date(meeting.getTime() - reminder.offsetMinutes * 60_000);
    const lateByMinutes = (now.getTime() - targetAt.getTime()) / 60_000;
    if (lateByMinutes < 0 || lateByMinutes > maxLateMinutes) continue;

    const alreadyLogged = await reminderAlreadyLogged(deal.id, reminder.key, meetingIso).catch(() => false);
    if (alreadyLogged && !includeAlreadyLogged) continue;

    const meetingDate = formatDateForWhatsApp(meeting, timezone);
    const meetingTime = formatTimeForWhatsApp(meeting, timezone);
    const bodyValues =
      reminder.bodyMode === "time"
        ? [deal.title, ownerDisplayName(owner), meetingTime]
        : [deal.title, ownerDisplayName(owner), meetingDate, meetingTime];

    plans.push({
      deal_id: deal.id,
      deal_title: deal.title,
      owner,
      meeting_datetime: meetingIso,
      reminder_key: reminder.key,
      reminder_label: reminder.label,
      target_at: targetAt.toISOString(),
      template_name: reminder.templateName,
      whatsapp_template_id: reminder.whatsappTemplateId,
      recipient: interaktRecipient(phone),
      raw_phone_present: Boolean(phone),
      body_values: bodyValues,
      already_logged: alreadyLogged,
    });
  }

  return plans;
}

async function sendInteraktTemplate(plan: ReminderPlan) {
  const apiKey = await wmill.getVariable(INTERAKT_API_KEY_PATH);
  if (!apiKey || isPlaceholder(apiKey)) {
    throw new Error(`Interakt API key is missing or still dummy at ${INTERAKT_API_KEY_PATH}.`);
  }

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
      callbackData: `pipedrive_deal:${plan.deal_id}:1on1_reminder:${plan.reminder_key}`,
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
    throw new Error(`Interakt 1on1 reminder send failed for deal ${plan.deal_id}: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

export async function main(
  dry_run = true,
  deal_id: number | null = null,
  now_iso = "",
  timezone = DEFAULT_TIMEZONE,
  max_late_minutes = 60,
  max_deals = 500,
  include_already_logged = false,
) {
  const now = now_iso ? new Date(now_iso) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error(`Invalid now_iso: ${now_iso}`);
  const activeTimezone = asString(timezone) || DEFAULT_TIMEZONE;

  const deals = deal_id ? [await getDeal(Number(deal_id))] : await listOpenDeals(max_deals);
  const plans: ReminderPlan[] = [];
  for (const deal of deals) {
    plans.push(...(await buildReminderPlans(deal, now, activeTimezone, max_late_minutes, include_already_logged)));
  }

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
    const activity = await createReminderActivity(plan);
    sent.push({
      ...plan,
      whatsapp,
      activity_id: activity?.data?.id || activity?.id || null,
    });
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
