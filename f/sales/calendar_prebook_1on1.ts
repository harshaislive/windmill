import * as wmill from "windmill-client";

const SERVICE_ACCOUNT_JSON_PATH = "f/sales/calendar_prebook_1on1/google_service_account_json";
const OWNER_CALENDAR_MAP_PATH = "f/sales/calendar_prebook_1on1/owner_calendar_map";
const OWNER_BOOKING_WINDOWS_PATH = "f/sales/calendar_prebook_1on1/owner_booking_windows";
const OWNER_EVENT_TITLE_TEMPLATES_PATH = "f/sales/calendar_prebook_1on1/owner_event_title_templates";
const OWNER_BOOKING_LINK_MAP_PATH = "f/sales/calendar_prebook_1on1/owner_booking_link_map";
const CALENDLY_VIVEK_TOKEN_PATH = "f/sales/calendar_prebook_1on1/calendly_vivek_token";
const CALENDLY_VIVEK_EVENT_TYPE_URI_PATH = "f/sales/calendar_prebook_1on1/calendly_vivek_event_type_uri";
const TIMEZONE_PATH = "f/sales/calendar_prebook_1on1/timezone";
const DURATION_MINUTES_PATH = "f/sales/calendar_prebook_1on1/default_duration_minutes";
const INTERAKT_API_KEY_PATH = "f/sales/calendar_prebook_1on1/interakt_api_key";
const INTERAKT_BASE_URL_PATH = "f/sales/calendar_prebook_1on1/interakt_base_url";
const PIPEDRIVE_VARIABLE_PATH = "f/collectives/zoom_collective_to_pipedrive/pipedrive_api_key";
const DEFAULT_PIPEDRIVE_DOMAIN = "beforest";
const INTERAKT_PREBOOKED_TEMPLATE_NAME = "1on1_fit_with_prebookedcall";
const INTERAKT_PREBOOKED_TEMPLATE_ID = "929183576282877";
const INTERAKT_NO_SLOT_OWNER_TEMPLATE_NAME = "owner_1on1_no_slot_alert";
const INTERAKT_NO_SLOT_OWNER_TEMPLATE_ID = "1279318191033383";
const ONE_ON_ONE_AWAITING_LABEL_ID = 105;
const BEFOREST_ADMIN_USER_ID = 18891506;

const DEAL_FIELDS = {
  oneOnOneMeetingDateTime: "d6fd8c9877d20bfd678ecb37f21e5b33bd2717fd",
  meetingUrl: "c818768b64d54270c74b931b4581082b543c8571",
  meetingReferenceId: "cd1b8c89ded44fccbf04ded59928cc9fc3ae0e50",
  phone: "7f1ebc80670dad0d9f6ea3d5f2585c923395305a",
};

const PIPEDRIVE_OWNER_ALIASES: Record<number, string> = {
  22251956: "Vivekanand",
  13490118: "Rakesh",
};

const OWNER_PHONE_NUMBERS: Record<string, string> = {
  Vivekanand: "+916396252216",
  Rakesh: "+918527494761",
};

const NO_SLOT_LEAD_TEMPLATES: Record<string, { name: string; whatsappTemplateId: string }> = {
  Vivekanand: {
    name: "collective_user_notavailable_resend_1on1_link_vivek",
    whatsappTemplateId: "2681894292197799",
  },
  Rakesh: {
    name: "collective_user_notavailable_resend_1on1_link_rakesh",
    whatsappTemplateId: "901082656114581",
  },
};

type ServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri: string;
};

type BookingWindow = {
  days: number[];
  start: string;
  end: string;
};

type OwnerBookingConfig = {
  timezone?: string;
  windows: BookingWindow[];
};

type BusySlot = {
  start: string;
  end: string;
};

type ProposedSlot = {
  start: Date;
  end: Date;
  source: "calendly" | "google_calendar";
  raw?: unknown;
};

type Deal = {
  id: number;
  title: string;
  pipeline_id?: number;
  custom_fields?: Record<string, unknown>;
  owner_id?: number | { id?: number; name?: string; email?: string };
  person_id?: number | { id?: number; name?: string; email?: Array<{ value?: string; primary?: boolean }> };
};

type Person = {
  id: number;
  name?: string;
  phones?: Array<{ value?: string; primary?: boolean }>;
  phone?: Array<{ value?: string; primary?: boolean }>;
};

type InteraktRecipient = {
  countryCode?: string;
  phoneNumber?: string;
  fullPhoneNumber?: string;
};

type InteraktTemplatePlan = {
  template_name: string;
  whatsapp_template_id?: string;
  template_category: "marketing" | "utility";
  recipient: InteraktRecipient;
  raw_phone_present: boolean;
  body_values: string[];
  button_values?: Record<string, string[]>;
  callback_data: string;
};

class NoSlotAvailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoSlotAvailableError";
  }
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function base64Url(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function signJwt(serviceAccount: ServiceAccount, subject: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/calendar",
    aud: serviceAccount.token_uri || "https://oauth2.googleapis.com/token",
    sub: subject,
    iat: now,
    exp: now + 3600,
  };
  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claim))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64Url(new Uint8Array(signature))}`;
}

async function getAccessToken(serviceAccount: ServiceAccount, subject: string): Promise<string> {
  const assertion = await signJwt(serviceAccount, subject);
  const response = await fetch(serviceAccount.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Google token request failed for ${subject}: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload.access_token;
}

async function pipedriveRequest(method: string, path: string, body?: Record<string, unknown>): Promise<any> {
  const apiToken = await wmill.getVariable(PIPEDRIVE_VARIABLE_PATH);
  const url = new URL(`https://${DEFAULT_PIPEDRIVE_DOMAIN}.pipedrive.com/api/v2/${path}`);
  url.searchParams.set("api_token", apiToken);
  const response = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(`Pipedrive ${method} ${path} failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload.data;
}

async function getDeal(dealId: number): Promise<Deal> {
  return (await pipedriveRequest("GET", `deals/${dealId}`)) as Deal;
}

async function getPerson(personId: number): Promise<Person> {
  return (await pipedriveRequest("GET", `persons/${personId}`)) as Person;
}

async function updateDealCalendarFields(
  dealId: number,
  startIso: string,
  meetingUrl: string,
  meetingReferenceId: string,
) {
  return await pipedriveRequest("PATCH", `deals/${dealId}`, {
    custom_fields: {
      [DEAL_FIELDS.oneOnOneMeetingDateTime]: startIso,
      [DEAL_FIELDS.meetingUrl]: meetingUrl,
      [DEAL_FIELDS.meetingReferenceId]: meetingReferenceId,
    },
  });
}

async function updateDealLabels(dealId: number, labelIds: number[]) {
  return await pipedriveRequest("PATCH", `deals/${dealId}`, {
    label_ids: labelIds,
  });
}

async function createPipedriveNote(dealId: number, content: string) {
  const apiToken = await wmill.getVariable(PIPEDRIVE_VARIABLE_PATH);
  const url = new URL(`https://${DEFAULT_PIPEDRIVE_DOMAIN}.pipedrive.com/api/v1/notes`);
  url.searchParams.set("api_token", apiToken);
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ deal_id: dealId, content }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(`Pipedrive POST notes failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload.data;
}

async function createPipedriveActivity(
  dealId: number,
  subject: string,
  note: string,
  options: {
    userId?: number;
    personId?: number | null;
    type?: string;
    done?: 0 | 1;
    dueDate?: string;
    dueTime?: string;
  } = {},
) {
  const apiToken = await wmill.getVariable(PIPEDRIVE_VARIABLE_PATH);
  const url = new URL(`https://${DEFAULT_PIPEDRIVE_DOMAIN}.pipedrive.com/api/v1/activities`);
  url.searchParams.set("api_token", apiToken);
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      deal_id: dealId,
      subject,
      type: options.type || "task",
      user_id: options.userId ?? BEFOREST_ADMIN_USER_ID,
      ...(options.personId ? { person_id: options.personId } : {}),
      done: options.done ?? 1,
      due_date: options.dueDate || todayInTimezone("Asia/Kolkata"),
      ...(options.dueTime ? { due_time: options.dueTime } : {}),
      note,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(`Pipedrive POST activities failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload.data;
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

function collectiveName(deal: Deal): string {
  const byPipeline: Record<number, string> = {
    1: "Hammiyala Collective",
    2: "Mumbai Collective",
    3: "Poomaale Collective",
    4: "Bhopal Collective",
  };
  const pipelineId = Number(deal.pipeline_id);
  return byPipeline[pipelineId] || "Beforest Collective";
}

function renderTemplate(template: string, deal: Deal): string {
  return template
    .replaceAll("{{deal_title}}", deal.title)
    .replaceAll("{{deal_id}}", String(deal.id));
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

function dealPhone(deal: Deal): string {
  const direct = (deal as Record<string, unknown>)[DEAL_FIELDS.phone];
  return asString(direct || deal.custom_fields?.[DEAL_FIELDS.phone]);
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

function datePartInTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function timePartInTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("hour")}:${get("minute")}`;
}

function pipedriveUtcTimePart(date: Date): string {
  return date.toISOString().slice(11, 16);
}

function todayInTimezone(timezone: string): string {
  return datePartInTimezone(new Date(), timezone);
}

function safeJson(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(/[<>&]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[char] || char));
}

async function buildWhatsAppPlan(deal: Deal, owner: string, start: Date, timezone: string) {
  const pid = personId(deal);
  const person = pid ? await getPerson(pid).catch(() => null) : null;
  const phone = primaryPhone(person) || dealPhone(deal);
  const recipient = interaktRecipient(phone);
  const bodyValues = [
    deal.title,
    collectiveName(deal),
    ownerDisplayName(owner),
    formatDateForWhatsApp(start, timezone),
    formatTimeForWhatsApp(start, timezone),
  ];

  return {
    template_name: INTERAKT_PREBOOKED_TEMPLATE_NAME,
    whatsapp_template_id: INTERAKT_PREBOOKED_TEMPLATE_ID,
    template_category: "marketing" as const,
    recipient,
    raw_phone_present: Boolean(phone),
    body_values: bodyValues,
    callback_data: `pipedrive_deal:${deal.id}:1on1_prebooked`,
  };
}

async function buildNoSlotLeadWhatsAppPlan(deal: Deal, owner: string, bookingLinks: Record<string, string>) {
  const template = NO_SLOT_LEAD_TEMPLATES[owner];
  const bookingLink = asString(bookingLinks[owner] || bookingLinks.default);
  if (!template || !bookingLink || isPlaceholder(bookingLink)) return null;

  const pid = personId(deal);
  const person = pid ? await getPerson(pid).catch(() => null) : null;
  const phone = primaryPhone(person) || dealPhone(deal);

  return {
    template_name: template.name,
    whatsapp_template_id: template.whatsappTemplateId,
    template_category: "marketing" as const,
    recipient: interaktRecipient(phone),
    raw_phone_present: Boolean(phone),
    body_values: [],
    button_values: { "1": [bookingLink] },
    callback_data: `pipedrive_deal:${deal.id}:1on1_no_slot_booking_link`,
  };
}

function buildOwnerNoSlotAlertPlan(
  deal: Deal,
  owner: string,
  collective: string,
  calendarEmail: string,
  searchDays: number,
) {
  const phone = OWNER_PHONE_NUMBERS[owner];
  if (!phone) return null;
  return {
    template_name: INTERAKT_NO_SLOT_OWNER_TEMPLATE_NAME,
    whatsapp_template_id: INTERAKT_NO_SLOT_OWNER_TEMPLATE_ID,
    template_category: "utility" as const,
    recipient: interaktRecipient(phone),
    raw_phone_present: Boolean(phone),
    body_values: [
      ownerDisplayName(owner),
      deal.title,
      collective,
      String(searchDays),
      String(deal.id),
      calendarEmail,
    ],
    callback_data: `pipedrive_deal:${deal.id}:owner_no_slot_alert`,
  };
}

function assertWhatsAppReady(plan: InteraktTemplatePlan) {
  if (!plan.raw_phone_present || (!plan.recipient.fullPhoneNumber && !(plan.recipient.countryCode && plan.recipient.phoneNumber))) {
    throw new Error(`Cannot send Interakt prebooked 1on1 message: no usable phone found for deal recipient.`);
  }
}

async function assertInteraktConfigured() {
  const apiKey = await wmill.getVariable(INTERAKT_API_KEY_PATH);
  if (!apiKey || isPlaceholder(apiKey)) {
    throw new Error(`Interakt API key is missing or still dummy at ${INTERAKT_API_KEY_PATH}.`);
  }
  await wmill.getVariable(INTERAKT_BASE_URL_PATH).catch(() => "https://api.interakt.ai");
}

async function sendInteraktTemplate(plan: InteraktTemplatePlan) {
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
      callbackData: plan.callback_data,
      template_category: plan.template_category,
      type: "Template",
      template: {
        name: plan.template_name,
        languageCode: "en",
        bodyValues: plan.body_values,
        ...(plan.button_values ? { buttonValues: plan.button_values } : {}),
      },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.result === false) {
    throw new Error(`Interakt prebooked 1on1 send failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function sendPrebookedWhatsApp(plan: Awaited<ReturnType<typeof buildWhatsAppPlan>>) {
  return await sendInteraktTemplate(plan);
}

async function sendOptionalInteraktTemplate(plan: InteraktTemplatePlan | null) {
  if (!plan) return { sent: false, skipped: true, reason: "missing_plan" };
  try {
    assertWhatsAppReady(plan);
    const response = await sendInteraktTemplate(plan);
    return { sent: true, skipped: false, response };
  } catch (error) {
    return {
      sent: false,
      skipped: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function parseTime(value: string): { hour: number; minute: number } {
  const [hour, minute] = value.split(":").map((part) => Number(part));
  return { hour, minute: minute || 0 };
}

function istDateParts(date: Date): { year: number; month: number; day: number; weekday: number } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: weekdayMap[parts.weekday] ?? 0,
  };
}

function dateFromIstParts(year: number, month: number, day: number, hour: number, minute: number): Date {
  return new Date(Date.UTC(year, month - 1, day, hour - 5, minute - 30, 0, 0));
}

function addIstDays(parts: { year: number; month: number; day: number }, days: number) {
  const noonUtc = dateFromIstParts(parts.year, parts.month, parts.day, 12, 0);
  return istDateParts(new Date(noonUtc.getTime() + days * 24 * 60 * 60 * 1000));
}

function overlapsBusy(start: Date, end: Date, busy: BusySlot[]): boolean {
  return busy.some((slot) => {
    const busyStart = new Date(slot.start);
    const busyEnd = new Date(slot.end);
    return start < busyEnd && end > busyStart;
  });
}

async function freeBusy(calendarEmail: string, accessToken: string, timeMin: Date, timeMax: Date, timezone: string) {
  const response = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      timeZone: timezone,
      items: [{ id: calendarEmail }],
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Google freeBusy failed for ${calendarEmail}: ${response.status} ${JSON.stringify(payload)}`);
  }
  return (payload.calendars?.[calendarEmail]?.busy || []) as BusySlot[];
}

function isPlaceholder(value: string): boolean {
  const normalized = value.toLowerCase();
  return !normalized || normalized.startsWith("dummy") || normalized === "changeme";
}

async function getCalendlyAvailableSlot(
  token: string,
  eventTypeUri: string,
  durationMinutes: number,
  searchDays: number,
): Promise<ProposedSlot> {
  if (isPlaceholder(token)) {
    throw new Error(`Calendly token is missing or still set to a dummy value at ${CALENDLY_VIVEK_TOKEN_PATH}.`);
  }
  if (!eventTypeUri) {
    throw new Error(`Calendly event type URI is missing at ${CALENDLY_VIVEK_EVENT_TYPE_URI_PATH}.`);
  }

  const start = new Date();
  start.setUTCDate(start.getUTCDate() + 1);
  start.setUTCHours(0, 0, 0, 0);

  // Calendly available-times endpoint supports a maximum 7-day range per request.
  for (let offset = 0; offset < searchDays; offset += 7) {
    const rangeStart = new Date(start.getTime() + offset * 24 * 60 * 60 * 1000);
    const rangeEnd = new Date(rangeStart.getTime() + Math.min(7, searchDays - offset) * 24 * 60 * 60 * 1000);
    const url = new URL("https://api.calendly.com/event_type_available_times");
    url.searchParams.set("event_type", eventTypeUri);
    url.searchParams.set("start_time", rangeStart.toISOString());
    url.searchParams.set("end_time", rangeEnd.toISOString());

    const response = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`Calendly availability failed: ${response.status} ${JSON.stringify(payload)}`);
    }

    const first = payload.collection?.find((slot: any) => slot.status === "available" || !slot.status);
    if (first?.start_time) {
      const slotStart = new Date(first.start_time);
      return {
        start: slotStart,
        end: new Date(slotStart.getTime() + durationMinutes * 60 * 1000),
        source: "calendly",
        raw: first,
      };
    }
  }

  throw new NoSlotAvailableError(`No Calendly slot found in the next ${searchDays} days.`);
}

function findNextSlot(
  windows: BookingWindow[],
  busy: BusySlot[],
  durationMinutes: number,
  searchDays: number,
): ProposedSlot | null {
  const todayIst = istDateParts(new Date());
  for (let offset = 1; offset <= searchDays; offset += 1) {
    const parts = addIstDays(todayIst, offset);
    for (const window of windows) {
      if (!window.days.includes(parts.weekday)) continue;
      const startTime = parseTime(window.start);
      const endTime = parseTime(window.end);
      let cursor = dateFromIstParts(parts.year, parts.month, parts.day, startTime.hour, startTime.minute);
      const windowEnd = dateFromIstParts(parts.year, parts.month, parts.day, endTime.hour, endTime.minute);
      while (cursor.getTime() + durationMinutes * 60 * 1000 <= windowEnd.getTime()) {
        const end = new Date(cursor.getTime() + durationMinutes * 60 * 1000);
        if (!overlapsBusy(cursor, end, busy)) return { start: cursor, end, source: "google_calendar", raw: window };
        cursor = new Date(cursor.getTime() + durationMinutes * 60 * 1000);
      }
    }
  }
  return null;
}

function eventBody(summary: string, deal: Deal, start: Date, end: Date, timezone: string, createGoogleMeet: boolean) {
  const body: Record<string, unknown> = {
    summary,
    description: `Pipedrive deal: ${deal.id}`,
    start: { dateTime: start.toISOString(), timeZone: timezone },
    end: { dateTime: end.toISOString(), timeZone: timezone },
  };
  if (createGoogleMeet) {
    body.conferenceData = {
      createRequest: {
        requestId: `pipedrive-${deal.id}-${start.getTime()}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }
  return body;
}

function noSlotNoteContent(
  deal: Deal,
  owner: string,
  calendarEmail: string,
  searchDays: number,
  reason: string,
  leadPlan: InteraktTemplatePlan | null,
  ownerPlan: InteraktTemplatePlan | null,
): string {
  const lines = [
    `<strong>1on1 auto-prebook fallback</strong>`,
    `Result: No available slot found; deal moved to 1on1 - Awaiting.`,
    `Deal: ${deal.id} - ${deal.title}`,
    `Collective: ${collectiveName(deal)}`,
    `Owner: ${ownerDisplayName(owner)}`,
    `Calendar checked: ${calendarEmail}`,
    `Search window: ${searchDays} days`,
    `Reason: ${reason}`,
    `Lead WhatsApp template: ${leadPlan?.template_name || "not sent - missing owner booking link or lead phone"}`,
    `Owner alert template: ${ownerPlan?.template_name || "not sent - missing owner phone"}`,
    `Deal URL: https://${DEFAULT_PIPEDRIVE_DOMAIN}.pipedrive.com/deal/${deal.id}`,
  ];
  return lines.join("<br>");
}

async function createCalendarEvent(
  calendarEmail: string,
  accessToken: string,
  summary: string,
  deal: Deal,
  start: Date,
  end: Date,
  timezone: string,
  createGoogleMeet: boolean,
) {
  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarEmail)}/events`);
  if (createGoogleMeet) url.searchParams.set("conferenceDataVersion", "1");
  url.searchParams.set("sendUpdates", "none");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(eventBody(summary, deal, start, end, timezone, createGoogleMeet)),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Google event create failed for ${calendarEmail}: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function handleNoSlotFallback(
  deal: Deal,
  owner: string,
  calendarEmail: string,
  searchDays: number,
  reason: string,
  bookingLinks: Record<string, string>,
  dryRun: boolean,
  sendWhatsapp: boolean,
) {
  const leadPlan = sendWhatsapp ? await buildNoSlotLeadWhatsAppPlan(deal, owner, bookingLinks) : null;
  const ownerPlan = sendWhatsapp
    ? buildOwnerNoSlotAlertPlan(deal, owner, collectiveName(deal), calendarEmail, searchDays)
    : null;
  const noteContent = noSlotNoteContent(deal, owner, calendarEmail, searchDays, reason, leadPlan, ownerPlan);

  if (dryRun) {
    return {
      dry_run: true,
      action: "no_slot_fallback",
      deal_id: deal.id,
      deal_title: deal.title,
      owner,
      calendar: calendarEmail,
      label_id: ONE_ON_ONE_AWAITING_LABEL_ID,
      no_slot_reason: reason,
      lead_whatsapp: leadPlan,
      owner_whatsapp: ownerPlan,
      note_preview: noteContent,
    };
  }

  await updateDealLabels(deal.id, [ONE_ON_ONE_AWAITING_LABEL_ID]);
  const note = await createPipedriveNote(deal.id, noteContent);
  const leadResult = await sendOptionalInteraktTemplate(leadPlan);
  const ownerResult = await sendOptionalInteraktTemplate(ownerPlan);
  const leadAudit = leadResult.sent
    ? await createPipedriveActivity(
        deal.id,
        "Booking link sent on WhatsApp",
        [
          `No slot was free, so we sent ${ownerDisplayName(owner)}'s booking link.`,
          `Reason: ${reason}`,
        ].join("<br>"),
        { personId: personId(deal) },
      )
    : null;
  const ownerAudit = ownerResult.sent
    ? await createPipedriveActivity(
        deal.id,
        "Owner alerted: no 1on1 slot",
        [
          `No prebook slot was available for ${deal.title}.`,
          `${ownerDisplayName(owner)} was asked to help.`,
        ].join("<br>"),
      )
    : null;

  return {
    dry_run: false,
    action: "no_slot_fallback",
    deal_id: deal.id,
    owner,
    calendar: calendarEmail,
    label_id: ONE_ON_ONE_AWAITING_LABEL_ID,
    note_id: Number(note?.id) || null,
    lead_whatsapp_sent: leadResult.sent,
    owner_whatsapp_sent: ownerResult.sent,
    lead_audit_activity_id: Number(leadAudit?.id) || null,
    owner_audit_activity_id: Number(ownerAudit?.id) || null,
    lead_whatsapp_result: leadResult,
    owner_whatsapp_result: ownerResult,
    no_slot_reason: reason,
  };
}

export async function main(
  deal_id: number,
  dry_run = true,
  search_days = 14,
  create_google_meet = true,
  send_whatsapp = true,
  force_no_slot = false,
) {
  if (!deal_id) throw new Error("deal_id is required.");

  const [
    rawServiceAccount,
    rawOwnerMap,
    rawWindows,
    rawTitleTemplates,
    rawBookingLinks,
    rawTimezone,
    rawDuration,
    calendlyVivekToken,
    calendlyVivekEventTypeUri,
  ] = await Promise.all([
    wmill.getVariable(SERVICE_ACCOUNT_JSON_PATH),
    wmill.getVariable(OWNER_CALENDAR_MAP_PATH),
    wmill.getVariable(OWNER_BOOKING_WINDOWS_PATH),
    wmill.getVariable(OWNER_EVENT_TITLE_TEMPLATES_PATH),
    wmill.getVariable(OWNER_BOOKING_LINK_MAP_PATH).catch(() => "{}"),
    wmill.getVariable(TIMEZONE_PATH).catch(() => "Asia/Kolkata"),
    wmill.getVariable(DURATION_MINUTES_PATH).catch(() => "30"),
    wmill.getVariable(CALENDLY_VIVEK_TOKEN_PATH).catch(() => ""),
    wmill.getVariable(CALENDLY_VIVEK_EVENT_TYPE_URI_PATH).catch(() => ""),
  ]);

  const serviceAccount = JSON.parse(rawServiceAccount) as ServiceAccount;
  const ownerMap = JSON.parse(rawOwnerMap) as Record<string, string>;
  const bookingWindows = JSON.parse(rawWindows) as Record<string, OwnerBookingConfig>;
  const titleTemplates = JSON.parse(rawTitleTemplates) as Record<string, string>;
  const bookingLinks = JSON.parse(rawBookingLinks || "{}") as Record<string, string>;
  const defaultTimezone = rawTimezone || "Asia/Kolkata";
  const durationMinutes = Number(rawDuration) || 30;

  const deal = await getDeal(Number(deal_id));
  const owner = ownerAlias(deal);
  const calendarEmail = ownerMap[owner] || ownerMap.default;
  if (!calendarEmail) throw new Error(`No calendar configured for owner ${owner}.`);

  const ownerConfig = bookingWindows[owner] || bookingWindows.default;
  if (!ownerConfig?.windows?.length) throw new Error(`No booking windows configured for owner ${owner}.`);
  const timezone = ownerConfig.timezone || defaultTimezone;

  const now = new Date();
  const accessToken = await getAccessToken(serviceAccount, calendarEmail);
  let busy: BusySlot[] = [];
  let slot: ProposedSlot | null = null;
  let noSlotReason = "";

  if (force_no_slot) {
    noSlotReason = "Forced no-slot fallback for dry-run/test.";
  } else {
    try {
      if (owner === "Vivekanand") {
        slot = await getCalendlyAvailableSlot(
          calendlyVivekToken,
          calendlyVivekEventTypeUri,
          durationMinutes,
          search_days,
        );
      } else {
        busy = await freeBusy(
          calendarEmail,
          accessToken,
          now,
          new Date(now.getTime() + (search_days + 2) * 24 * 60 * 60 * 1000),
          timezone,
        );
        slot = findNextSlot(ownerConfig.windows, busy, durationMinutes, search_days);
        if (!slot) {
          noSlotReason = `No free ${durationMinutes} minute slot found for ${owner} in the next ${search_days} days.`;
        }
      }
    } catch (error) {
      if (error instanceof NoSlotAvailableError) {
        noSlotReason = error.message;
      } else {
        throw error;
      }
    }
  }

  if (!slot) {
    return await handleNoSlotFallback(
      deal,
      owner,
      calendarEmail,
      search_days,
      noSlotReason || `No free ${durationMinutes} minute slot found.`,
      bookingLinks,
      dry_run,
      send_whatsapp,
    );
  }

  const summary = renderTemplate(titleTemplates[owner] || titleTemplates.default || "Beforest Collectives 1-1", deal);
  const whatsappPlan = send_whatsapp ? await buildWhatsAppPlan(deal, owner, slot.start, timezone) : null;
  if (whatsappPlan) assertWhatsAppReady(whatsappPlan);
  if (whatsappPlan && !dry_run) await assertInteraktConfigured();

  if (dry_run) {
    return {
      dry_run: true,
      deal_id: deal.id,
      deal_title: deal.title,
      owner,
      calendar: calendarEmail,
      duration_minutes: durationMinutes,
      timezone,
      event_title: summary,
      proposed_start: slot.start.toISOString(),
      proposed_end: slot.end.toISOString(),
      slot_source: slot.source,
      busy_count: busy.length,
      create_google_meet,
      send_whatsapp,
      whatsapp: whatsappPlan,
      planned_meeting_reference_id: `google_calendar:${calendarEmail}:<event_id>`,
    };
  }

  const event = await createCalendarEvent(
    calendarEmail,
    accessToken,
    summary,
    deal,
    slot.start,
    slot.end,
    timezone,
    create_google_meet,
  );
  const meetingUrl = asString(event.hangoutLink || event.htmlLink);
  const meetingReferenceId = `google_calendar:${calendarEmail}:${event.id}`;
  await updateDealCalendarFields(deal.id, slot.start.toISOString(), meetingUrl, meetingReferenceId);
  const whatsappResult = whatsappPlan ? await sendPrebookedWhatsApp(whatsappPlan) : null;
  const scheduledActivity = await createPipedriveActivity(
    deal.id,
    `1-on-1 call with ${deal.title}`,
    [
      `Prebooked with ${ownerDisplayName(owner)}.`,
      `When: ${datePartInTimezone(slot.start, timezone)} ${timePartInTimezone(slot.start, timezone)} IST`,
      `Meeting link: ${meetingUrl || "not available yet"}`,
    ].join("<br>"),
    {
      userId: ownerId(deal) || BEFOREST_ADMIN_USER_ID,
      personId: personId(deal),
      type: "meeting",
      done: 0,
      dueDate: datePartInTimezone(slot.start, timezone),
      dueTime: pipedriveUtcTimePart(slot.start),
    },
  );
  const calendarAudit = await createPipedriveActivity(
    deal.id,
    "Calendar invite created",
    [
      `Prebooked a 1on1 with ${ownerDisplayName(owner)}.`,
      `When: ${datePartInTimezone(slot.start, timezone)} ${timePartInTimezone(slot.start, timezone)} IST`,
      `Meeting link: ${meetingUrl || "not available yet"}`,
    ].join("<br>"),
  );
  const whatsappAudit = whatsappResult
    ? await createPipedriveActivity(
        deal.id,
        "Prebooked call message sent",
        [
          "Sent WhatsApp with the call details and reschedule button.",
          `Owner: ${ownerDisplayName(owner)}`,
          `When: ${datePartInTimezone(slot.start, timezone)} ${timePartInTimezone(slot.start, timezone)} IST`,
        ].join("<br>"),
        { personId: personId(deal) },
      )
    : null;

  return {
    dry_run: false,
    deal_id: deal.id,
    owner,
    calendar: calendarEmail,
    event_id: event.id,
    event_title: summary,
    start: slot.start.toISOString(),
    end: slot.end.toISOString(),
    slot_source: slot.source,
    meeting_url: meetingUrl,
    meeting_reference_id: meetingReferenceId,
    whatsapp_sent: Boolean(whatsappResult),
    whatsapp_template: whatsappPlan?.template_name || null,
    scheduled_activity_id: Number(scheduledActivity?.id) || null,
    calendar_audit_activity_id: Number(calendarAudit?.id) || null,
    whatsapp_audit_activity_id: Number(whatsappAudit?.id) || null,
  };
}
