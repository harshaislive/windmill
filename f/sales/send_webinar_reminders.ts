import * as wmill from "windmill-client";

const PIPEDRIVE_VARIABLE_PATH = "f/collectives/zoom_collective_to_pipedrive/pipedrive_api_key";
const INTERAKT_API_KEY_PATH = "f/sales/calendar_prebook_1on1/interakt_api_key";
const INTERAKT_BASE_URL_PATH = "f/sales/calendar_prebook_1on1/interakt_base_url";
const DEFAULT_PIPEDRIVE_DOMAIN = "beforest";
const DEFAULT_TIMEZONE = "Asia/Kolkata";
const SCHEDULED_WEBINAR_PENDING_LABEL_ID = 111;
const BEFOREST_ADMIN_USER_ID = 18891506;

const DEAL_FIELDS = {
  meetingUrl: "c818768b64d54270c74b931b4581082b543c8571",
  phone: "7f1ebc80670dad0d9f6ea3d5f2585c923395305a",
};

const WEBINAR_REMINDERS = [
  {
    key: "3d",
    label: "3 days before",
    offsetMinutes: 72 * 60,
    templateName: "collective_webinar_reminder_3days_before",
    whatsappTemplateId: "844830038419458",
    bodyMode: "name_collective" as const,
  },
  {
    key: "24h",
    label: "24 hours before",
    offsetMinutes: 24 * 60,
    templateName: "collective_webinar_reminder_24hrs_before",
    whatsappTemplateId: "1985750315304190",
    bodyMode: "name_collective" as const,
  },
  {
    key: "1h",
    label: "1 hour before",
    offsetMinutes: 60,
    templateName: "collective_webinar_reminder_1hr_before",
    whatsappTemplateId: "1413104447035444",
    bodyMode: "collective_link" as const,
  },
];

type Deal = {
  id: number;
  title: string;
  label?: unknown;
  label_ids?: Array<number | string>;
  labels?: Array<{ id?: number | string } | number | string>;
  pipeline_id?: number;
  person_id?: number | { id?: number };
  custom_fields?: Record<string, unknown>;
  [key: string]: unknown;
};

type Person = {
  phones?: Array<{ value?: string; primary?: boolean }>;
  phone?: Array<{ value?: string; primary?: boolean }>;
};

type Activity = {
  id: number;
  subject?: string;
  due_date?: string;
  due_time?: string;
  note?: string;
  done?: boolean | number;
};

type InteraktRecipient = {
  countryCode?: string;
  phoneNumber?: string;
  fullPhoneNumber?: string;
};

type WebinarReminderPlan = {
  deal_id: number;
  deal_title: string;
  activity_id: number;
  collective: string;
  webinar_datetime: string;
  access_link: string;
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

async function pipedriveV2(method: string, path: string, body?: Record<string, unknown>, query?: Record<string, unknown>) {
  const url = new URL(`https://${DEFAULT_PIPEDRIVE_DOMAIN}.pipedrive.com/api/v2/${path.replace(/^\/+/, "")}`);
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
    throw new Error(`Pipedrive v2 ${method} ${path} failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload.data;
}

async function getDeal(dealId: number): Promise<Deal> {
  const payload = await pipedriveV1("GET", `deals/${dealId}`);
  return payload.data as Deal;
}

async function getPerson(personId: number): Promise<Person> {
  return await pipedriveV2("GET", `persons/${personId}`) as Person;
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

async function getDealActivities(dealId: number): Promise<Activity[]> {
  const payload = await pipedriveV1("GET", "activities", undefined, {
    deal_id: dealId,
    done: 0,
    limit: 500,
  });
  return Array.isArray(payload.data) ? payload.data as Activity[] : [];
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

function collectiveName(deal: Deal, activity?: Activity): string {
  const pipelineMap: Record<number, string> = {
    1: "Hammiyala Collective",
    2: "Mumbai Collective",
    3: "Poomaale Collective",
    4: "Bhopal Collective",
  };
  const fromPipeline = pipelineMap[Number(deal.pipeline_id)];
  if (fromPipeline) return fromPipeline;
  const subject = asString(activity?.subject);
  const match = subject.match(/(.+?)\s+Collective\s+Webinar/i);
  return match?.[1] ? `${match[1].trim()} Collective` : "Beforest Collective";
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

function parseActivityDate(activity: Activity): Date | null {
  const dueDate = asString(activity.due_date);
  if (!dueDate) return null;
  const dueTime = asString(activity.due_time || "00:00:00");
  const parsed = new Date(`${dueDate}T${dueTime.replace(/Z$/, "")}+00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isWebinarActivity(activity: Activity): boolean {
  return /collective webinar/i.test(asString(activity.subject));
}

function extractAccessLink(deal: Deal, activity: Activity): string {
  const direct = asString(dealField(deal, DEAL_FIELDS.meetingUrl));
  if (direct) return direct;
  const note = asString(activity.note);
  const match = note.match(/https?:\/\/\S+/);
  return match?.[0] ? match[0].replace(/[)\].,]+$/, "") : "";
}

function activitySubject(plan: Pick<WebinarReminderPlan, "reminder_key" | "webinar_datetime" | "activity_id">): string {
  return `Webinar reminder sent - ${plan.reminder_key}`;
}

async function reminderAlreadyLogged(plan: Pick<WebinarReminderPlan, "deal_id" | "reminder_key" | "webinar_datetime" | "activity_id">): Promise<boolean> {
  const payload = await pipedriveV1("GET", "activities", undefined, {
    deal_id: plan.deal_id,
    done: 1,
    limit: 500,
  });
  const activities = Array.isArray(payload.data) ? payload.data : [];
  return activities.some((activity: any) =>
    asString(activity.subject) === activitySubject(plan) &&
    asString(activity.note).includes(`Webinar activity: ${plan.activity_id}`) &&
    asString(activity.note).includes(`Webinar: ${plan.webinar_datetime}`),
  );
}

async function createReminderActivity(plan: WebinarReminderPlan) {
  const now = new Date();
  return await pipedriveV1("POST", "activities", {
    deal_id: plan.deal_id,
    user_id: BEFOREST_ADMIN_USER_ID,
    subject: activitySubject(plan),
    type: "task",
    done: 1,
    due_date: now.toISOString().slice(0, 10),
    note: [
      `Sent ${plan.reminder_label} webinar reminder on WhatsApp.`,
      `Webinar activity: ${plan.activity_id}`,
      `Webinar: ${plan.webinar_datetime}`,
    ].join("<br>"),
  });
}

function safeJson(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(/[<>&]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[char] || char));
}

function assertWhatsAppReady(plan: WebinarReminderPlan) {
  if (!plan.raw_phone_present || (!plan.recipient.fullPhoneNumber && !(plan.recipient.countryCode && plan.recipient.phoneNumber))) {
    throw new Error(`Cannot send webinar reminder ${plan.reminder_key} for deal ${plan.deal_id}: no usable recipient phone.`);
  }
  if (plan.reminder_key === "1h" && !plan.access_link) {
    throw new Error(`Cannot send 1h webinar reminder for deal ${plan.deal_id}: missing Zoom/access link.`);
  }
}

async function sendInteraktTemplate(plan: WebinarReminderPlan) {
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
      callbackData: `pipedrive_deal:${plan.deal_id}:webinar_reminder:${plan.reminder_key}`,
      template_category: "marketing",
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
    throw new Error(`Interakt webinar reminder failed for deal ${plan.deal_id}: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function buildPlansForDeal(
  deal: Deal,
  now: Date,
  maxLateMinutes: number,
  includeAlreadyLogged: boolean,
): Promise<WebinarReminderPlan[]> {
  if (!labelIds(deal).includes(SCHEDULED_WEBINAR_PENDING_LABEL_ID)) return [];
  const activities = (await getDealActivities(deal.id)).filter(isWebinarActivity);
  const pid = personId(deal);
  const person = pid ? await getPerson(pid).catch(() => null) : null;
  const phone = primaryPhone(person) || dealPhone(deal);
  const plans: WebinarReminderPlan[] = [];

  for (const activity of activities) {
    const webinarAt = parseActivityDate(activity);
    if (!webinarAt || webinarAt.getTime() <= now.getTime()) continue;
    const webinarIso = webinarAt.toISOString();
    const collective = collectiveName(deal, activity);
    const accessLink = extractAccessLink(deal, activity);

    for (const reminder of WEBINAR_REMINDERS) {
      const targetAt = new Date(webinarAt.getTime() - reminder.offsetMinutes * 60_000);
      const lateByMinutes = (now.getTime() - targetAt.getTime()) / 60_000;
      if (lateByMinutes < 0 || lateByMinutes > maxLateMinutes) continue;

      const basePlan = {
        deal_id: deal.id,
        deal_title: deal.title,
        activity_id: Number(activity.id),
        collective,
        webinar_datetime: webinarIso,
        access_link: accessLink,
        reminder_key: reminder.key,
        reminder_label: reminder.label,
        target_at: targetAt.toISOString(),
        template_name: reminder.templateName,
        whatsapp_template_id: reminder.whatsappTemplateId,
        recipient: interaktRecipient(phone),
        raw_phone_present: Boolean(phone),
        body_values: reminder.bodyMode === "collective_link"
          ? [collective, accessLink]
          : [deal.title, collective],
        already_logged: false,
      };
      const alreadyLogged = await reminderAlreadyLogged(basePlan).catch(() => false);
      if (alreadyLogged && !includeAlreadyLogged) continue;
      plans.push({ ...basePlan, already_logged: alreadyLogged });
    }
  }

  return plans;
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
  if (!timezone) timezone = DEFAULT_TIMEZONE;

  const deals = deal_id ? [await getDeal(Number(deal_id))] : await listOpenDeals(max_deals);
  const plans: WebinarReminderPlan[] = [];
  for (const deal of deals) {
    plans.push(...(await buildPlansForDeal(deal, now, Number(max_late_minutes) || 60, include_already_logged)));
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
