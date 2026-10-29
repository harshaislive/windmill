import * as wmill from "windmill-client";

const PIPEDRIVE_VARIABLE_PATH = "f/collectives/zoom_collective_to_pipedrive/pipedrive_api_key";
const INTERAKT_API_KEY_PATH = "f/sales/calendar_prebook_1on1/interakt_api_key";
const INTERAKT_BASE_URL_PATH = "f/sales/calendar_prebook_1on1/interakt_base_url";
const TEMPLATE_NAME_PATH = "f/sales/owner_touchbase/template_name";
const MAX_REMINDERS_PATH = "f/sales/owner_touchbase/max_reminders";
const OWNER_PHONE_MAP_PATH = "f/sales/owner_touchbase/owner_phone_map";
const DEFAULT_PIPEDRIVE_DOMAIN = "beforest";
const DEFAULT_TEMPLATE_NAME = "owner_1on1_touchbase_check";
const BEFOREST_ADMIN_USER_ID = 18891506;
const ONE_ON_ONE_TBC_LABEL_ID = 115;
const SENT_ACTIVITY_SUBJECT = "Owner touchbase check sent";
const FAILED_ACTIVITY_SUBJECT = "Owner touchbase WhatsApp failed";
const CONFIRMED_ACTIVITY_SUBJECT = "Owner confirmed lead touched base";
const LIMIT_ACTIVITY_SUBJECT = "Owner touchbase reminder limit reached";

const DEAL_FIELDS = {
  oneOnOneMeetingDateTime: "d6fd8c9877d20bfd678ecb37f21e5b33bd2717fd",
  meetingUrl: "c818768b64d54270c74b931b4581082b543c8571",
  meetingReferenceId: "cd1b8c89ded44fccbf04ded59928cc9fc3ae0e50",
};

const COLLECTIVES_BY_PIPELINE: Record<number, string> = {
  1: "Hammiyala Collective",
  2: "Mumbai Collective",
  3: "Poomaale Collective 2.0",
  4: "Bhopal Collective",
  6: "Hyderabad Collective",
};

const PIPEDRIVE_OWNER_ALIASES: Record<number, string> = {
  22251956: "Vivekanand",
  13490118: "Rakesh",
};

const DEFAULT_OWNER_PHONE_MAP: Record<string, string> = {
  Vivekanand: "+916396252216",
  Rakesh: "+918919151882",
};

type Deal = {
  id: number;
  title: string;
  status?: string;
  pipeline_id?: number | { id?: number };
  label?: unknown;
  label_ids?: Array<number | string>;
  labels?: Array<{ id?: number | string } | number | string>;
  owner_id?: number | { id?: number; name?: string };
  custom_fields?: Record<string, unknown>;
  [key: string]: unknown;
};

type InteraktRecipient = {
  countryCode?: string;
  phoneNumber?: string;
  fullPhoneNumber?: string;
};

type TouchbasePlan = {
  deal_id: number;
  deal_title: string;
  owner_name: string;
  owner_key: string;
  collective: string;
  template_name: string;
  attempt: number;
  max_reminders: number;
  recipient: InteraktRecipient;
  raw_phone_present: boolean;
  body_values: string[];
  callback_data: string;
  manual_message: string;
};

function asString(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(asString(value));
  return Number.isFinite(parsed) ? parsed : null;
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

function pipelineId(deal: Deal): number | null {
  if (deal.pipeline_id && typeof deal.pipeline_id === "object") return asNumber(deal.pipeline_id.id);
  return asNumber(deal.pipeline_id);
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

function ownerKey(deal: Deal): string {
  const owner = deal.owner_id;
  const id = typeof owner === "number" ? owner : asNumber(owner && typeof owner === "object" ? owner.id : null);
  if (id && PIPEDRIVE_OWNER_ALIASES[id]) return PIPEDRIVE_OWNER_ALIASES[id];
  if (owner && typeof owner === "object") return asString(owner.name) || "default";
  return "default";
}

function ownerDisplayName(owner: string): string {
  if (owner === "Vivekanand") return "Vivekanand";
  if (owner === "Rakesh") return "Rakesh";
  return owner || "there";
}

function dealField(deal: Deal, key: string): string {
  return asString(deal.custom_fields?.[key] ?? deal[key]);
}

function hasMeetingInfo(deal: Deal): boolean {
  return Boolean(
    dealField(deal, DEAL_FIELDS.oneOnOneMeetingDateTime) ||
      dealField(deal, DEAL_FIELDS.meetingUrl) ||
      dealField(deal, DEAL_FIELDS.meetingReferenceId)
  );
}

function firstName(value: string): string {
  return asString(value).split(/\s+/, 1)[0] || "there";
}

function interaktRecipient(rawPhone: string): InteraktRecipient {
  const cleaned = asString(rawPhone).replace(/[^\d+]/g, "");
  const digits = cleaned.replace(/\D/g, "");
  if (!digits) return {};
  if (cleaned.startsWith("+")) return { fullPhoneNumber: digits };
  if (digits.length === 10) return { countryCode: "+91", phoneNumber: digits };
  if (digits.length === 11 && digits.startsWith("0")) return { countryCode: "+91", phoneNumber: digits.slice(1) };
  if (digits.length === 12 && digits.startsWith("91")) return { fullPhoneNumber: digits };
  return { fullPhoneNumber: digits };
}

async function ownerPhoneMap(): Promise<Record<string, string>> {
  const raw = await wmill.getVariable(OWNER_PHONE_MAP_PATH).catch(() => "");
  if (!raw) return DEFAULT_OWNER_PHONE_MAP;
  try {
    return { ...DEFAULT_OWNER_PHONE_MAP, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_OWNER_PHONE_MAP;
  }
}

async function templateName() {
  return asString(await wmill.getVariable(TEMPLATE_NAME_PATH).catch(() => "")) || DEFAULT_TEMPLATE_NAME;
}

async function maxReminders() {
  const configured = Number(await wmill.getVariable(MAX_REMINDERS_PATH).catch(() => "3"));
  return Number.isFinite(configured) && configured > 0 ? configured : 3;
}

async function dealActivities(dealId: number) {
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

function stopReason(deal: Deal, activities: any[], attempt: number, max: number): string {
  if (asString(deal.status).toLowerCase() && asString(deal.status).toLowerCase() !== "open") return "deal_not_open";
  if (!labelIds(deal).includes(ONE_ON_ONE_TBC_LABEL_ID)) return "deal_no_longer_1on1_tbc";
  if (hasMeetingInfo(deal)) return "meeting_already_present";
  if (hasActivity(activities, CONFIRMED_ACTIVITY_SUBJECT)) return "owner_already_confirmed_touchbase";
  if (hasActivity(activities, SENT_ACTIVITY_SUBJECT, attempt)) return "attempt_already_sent";
  if (attempt > max) return "max_reminders_reached";
  return "";
}

function manualMessage(plan: Pick<TouchbasePlan, "owner_name" | "deal_title" | "collective" | "body_values">) {
  return [
    `Hi ${plan.owner_name},`,
    "",
    `Has ${plan.deal_title} for ${plan.collective} been touched base with?`,
    "",
    `Deal: ${plan.body_values[3]}`,
    "",
    "Please confirm.",
  ].join("\n");
}

function buildDealLink(dealId: number) {
  return `https://${DEFAULT_PIPEDRIVE_DOMAIN}.pipedrive.com/deal/${dealId}`;
}

async function buildPlan(deal: Deal, attempt: number, max: number): Promise<TouchbasePlan> {
  const owner = ownerKey(deal);
  const ownerName = ownerDisplayName(owner);
  const phones = await ownerPhoneMap();
  const phone = asString(phones[owner] || phones[ownerName] || phones.default);
  const collective = COLLECTIVES_BY_PIPELINE[pipelineId(deal) || 0] || "the Beforest Collective";
  const dealLink = buildDealLink(deal.id);
  const bodyValues = [ownerName, firstName(deal.title), collective, dealLink];
  const basePlan = {
    owner_name: ownerName,
    deal_title: firstName(deal.title),
    collective,
    body_values: bodyValues,
  };
  return {
    deal_id: deal.id,
    deal_title: deal.title,
    owner_name: ownerName,
    owner_key: owner,
    collective,
    template_name: await templateName(),
    attempt,
    max_reminders: max,
    recipient: interaktRecipient(phone),
    raw_phone_present: Boolean(phone),
    body_values: bodyValues,
    callback_data: `pipedrive_deal:${deal.id}:owner_touchbase_check:${attempt}`,
    manual_message: manualMessage(basePlan),
  };
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

async function logLimitReached(dealId: number, attempt: number, max: number) {
  return await createActivity(
    dealId,
    LIMIT_ACTIVITY_SUBJECT,
    [
      "Owner touchbase reminder limit reached.",
      `Attempt requested: ${attempt}`,
      `Max reminders: ${max}`,
      "No further automatic owner touchbase checks will be sent.",
    ].join("<br>"),
    0,
  );
}

function assertWhatsAppReady(plan: TouchbasePlan) {
  if (!plan.raw_phone_present || (!plan.recipient.fullPhoneNumber && !(plan.recipient.countryCode && plan.recipient.phoneNumber))) {
    throw new Error(`Cannot send owner touchbase check for deal ${plan.deal_id}: no usable owner phone.`);
  }
}

async function sendInteraktTemplate(plan: TouchbasePlan) {
  const apiKey = await wmill.getVariable(INTERAKT_API_KEY_PATH);
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
    throw new Error(`Interakt owner touchbase check failed for deal ${plan.deal_id}: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function logSent(plan: TouchbasePlan, whatsapp: unknown) {
  return await createActivity(
    plan.deal_id,
    SENT_ACTIVITY_SUBJECT,
    [
      "Sent owner touchbase check on WhatsApp.",
      `Owner: ${escapeHtml(plan.owner_name)}`,
      `Collective: ${escapeHtml(plan.collective)}`,
      `Template: ${escapeHtml(plan.template_name)}`,
      `Attempt: ${plan.attempt}`,
      "",
      "<strong>Message sent</strong>",
      `<pre>${escapeHtml(plan.manual_message)}</pre>`,
      "",
      "<strong>Interakt response</strong>",
      `<pre>${escapeHtml(JSON.stringify(whatsapp, null, 2)).slice(0, 2500)}</pre>`,
    ].join("<br>"),
    1,
  );
}

async function logFailure(plan: TouchbasePlan, reason: string) {
  return await createActivity(
    plan.deal_id,
    FAILED_ACTIVITY_SUBJECT,
    [
      "Owner touchbase check WhatsApp failed. Please send this manually.",
      `Reason: ${escapeHtml(reason)}`,
      `Owner: ${escapeHtml(plan.owner_name)}`,
      `Collective: ${escapeHtml(plan.collective)}`,
      `Template: ${escapeHtml(plan.template_name)}`,
      `Attempt: ${plan.attempt}`,
      "",
      "<strong>Copy-paste message</strong>",
      `<pre>${escapeHtml(plan.manual_message)}</pre>`,
    ].join("<br>"),
    0,
  );
}

export async function main(deal_id: number, attempt = 1, dry_run = false) {
  const dealId = Number(deal_id);
  const attemptNumber = Number(attempt) || 1;
  if (!Number.isFinite(dealId) || dealId <= 0) throw new Error("deal_id is required.");

  const deal = await pipedriveV2("GET", `deals/${dealId}`).catch(() => null) as Deal | null;
  if (!deal) return { status: "skipped", reason: "deal_not_found", deal_id: dealId, dry_run };
  const activities = await dealActivities(dealId);
  const max = await maxReminders();
  const reason = stopReason(deal, activities, attemptNumber, max);
  if (reason === "max_reminders_reached" && !dry_run && !hasActivity(activities, LIMIT_ACTIVITY_SUBJECT)) {
    const activity = await logLimitReached(dealId, attemptNumber, max);
    return { status: "stopped", reason, deal_id: dealId, activity_id: Number(activity?.id) || null, dry_run };
  }
  if (reason) return { status: "skipped", reason, deal_id: dealId, attempt: attemptNumber, dry_run };

  const plan = await buildPlan(deal, attemptNumber, max);
  if (dry_run) return { dry_run: true, status: "would_send", plan };

  try {
    assertWhatsAppReady(plan);
    const whatsapp = await sendInteraktTemplate(plan);
    const activity = await logSent(plan, whatsapp);
    return {
      dry_run: false,
      status: "sent",
      deal_id: dealId,
      attempt: attemptNumber,
      whatsapp_response: whatsapp,
      activity_id: Number(activity?.id) || null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const activity = await logFailure(plan, message);
    return {
      dry_run: false,
      status: "failed_manual_task_created",
      deal_id: dealId,
      attempt: attemptNumber,
      error: message,
      activity_id: Number(activity?.id) || null,
    };
  }
}
