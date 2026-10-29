import * as wmill from "windmill-client";


type PipedriveUsageLogArgs = {
  method: string;
  rawEndpoint: string;
  statusCode?: number;
  success: boolean;
  durationMs?: number;
  rateLimitRemaining?: number;
  rateLimitReset?: string;
  retryAfter?: string;
  errorMessage?: string;
  requestFingerprint?: string;
};

async function logPipedriveApiUsage(_args: PipedriveUsageLogArgs) {
  return;
}

function pipedriveRateLimitRemaining(response: Response): number | undefined {
  const value = Number(response.headers.get("x-ratelimit-remaining") || response.headers.get("x-rate-limit-remaining"));
  return Number.isFinite(value) ? value : undefined;
}

function pipedriveEndpointForLog(url: URL): string {
  return url.pathname;
}

const SERVICE_ACCOUNT_JSON_PATH = "f/sales/calendar_prebook_1on1/google_service_account_json";
const OWNER_CALENDAR_MAP_PATH = "f/sales/calendar_prebook_1on1/owner_calendar_map";
const OWNER_BOOKING_LINK_MAP_PATH = "f/sales/calendar_prebook_1on1/owner_booking_link_map";
const INTERAKT_API_KEY_PATH = "f/sales/calendar_prebook_1on1/interakt_api_key";
const INTERAKT_BASE_URL_PATH = "f/sales/calendar_prebook_1on1/interakt_base_url";
const PIPEDRIVE_VARIABLE_PATH = "f/collectives/zoom_collective_to_pipedrive/pipedrive_api_key";
const DEFAULT_PIPEDRIVE_DOMAIN = "beforest";
const ONE_ON_ONE_AWAITING_LABEL_ID = 105;
const ONE_ON_ONE_PENDING_LABEL_ID = 106;
const ONE_ON_ONE_TBC_LABEL_ID = 115;
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

const RESCHEDULE_LEAD_TEMPLATES: Record<string, { name: string; whatsappTemplateId: string }> = {
  Vivekanand: {
    name: "collective_user_notavailable_resend_1on1_link_vivek",
    whatsappTemplateId: "2681894292197799",
  },
};

type ServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri: string;
};

type Deal = {
  id: number;
  title: string;
  custom_fields?: Record<string, unknown>;
  label_ids?: number[];
  labels?: Array<{ id?: number }>;
  owner_id?: number | { id?: number; name?: string; email?: string };
  person_id?: number | { id?: number; name?: string; email?: Array<{ value?: string; primary?: boolean }> };
};

type Person = {
  id: number;
  name?: string;
  phones?: Array<{ value?: string; primary?: boolean }>;
  phone?: Array<{ value?: string; primary?: boolean }>;
};

type CalendarEventRef = {
  calendarEmail: string | null;
  eventId: string | null;
  source: "pipedrive_field" | "calendar_search" | "none";
};

type PipedriveActivity = {
  id?: number;
  subject?: string;
  type?: string;
  note?: string;
  done?: boolean;
};

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
  const signingInput = `${base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64Url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/calendar",
    aud: serviceAccount.token_uri || "https://oauth2.googleapis.com/token",
    sub: subject,
    iat: now,
    exp: now + 3600,
  }))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64Url(new Uint8Array(signature))}`;
}

async function getAccessToken(serviceAccount: ServiceAccount, subject: string): Promise<string> {
  const response = await fetch(serviceAccount.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: await signJwt(serviceAccount, subject),
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Google token request failed for ${subject}: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload.access_token;
}

async function pipedriveToken() {
  return await wmill.getVariable(PIPEDRIVE_VARIABLE_PATH);
}

async function pipedriveV2(method: string, path: string, body?: Record<string, unknown>): Promise<any> {
  const url = new URL(`https://${DEFAULT_PIPEDRIVE_DOMAIN}.pipedrive.com/api/v2/${path}`);
  url.searchParams.set("api_token", await pipedriveToken());
  const startedAt = Date.now();
  const response = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  await logPipedriveApiUsage({
    method,
    rawEndpoint: pipedriveEndpointForLog(url),
    statusCode: response.status,
    success: response.ok && payload?.success !== false,
    durationMs: Date.now() - startedAt,
    rateLimitRemaining: pipedriveRateLimitRemaining(response),
    rateLimitReset: response.headers.get("x-ratelimit-reset") || response.headers.get("x-rate-limit-reset") || "",
    retryAfter: response.headers.get("retry-after") || "",
    errorMessage: response.ok && payload?.success !== false ? "" : JSON.stringify(payload).slice(0, 800),
    requestFingerprint: method.toUpperCase() + " " + pipedriveEndpointForLog(url),
  });
  if (!response.ok || payload?.success === false) {
    throw new Error(`Pipedrive v2 ${method} ${path} failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload.data;
}

async function pipedriveV1(method: string, path: string, body?: Record<string, unknown>): Promise<any> {
  const url = new URL(`https://${DEFAULT_PIPEDRIVE_DOMAIN}.pipedrive.com/api/v1/${path}`);
  url.searchParams.set("api_token", await pipedriveToken());
  const startedAt = Date.now();
  const response = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  await logPipedriveApiUsage({
    method,
    rawEndpoint: pipedriveEndpointForLog(url),
    statusCode: response.status,
    success: response.ok && payload?.success !== false,
    durationMs: Date.now() - startedAt,
    rateLimitRemaining: pipedriveRateLimitRemaining(response),
    rateLimitReset: response.headers.get("x-ratelimit-reset") || response.headers.get("x-rate-limit-reset") || "",
    retryAfter: response.headers.get("retry-after") || "",
    errorMessage: response.ok && payload?.success !== false ? "" : JSON.stringify(payload).slice(0, 800),
    requestFingerprint: method.toUpperCase() + " " + pipedriveEndpointForLog(url),
  });
  if (!response.ok || payload?.success === false) {
    throw new Error(`Pipedrive v1 ${method} ${path} failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload.data;
}

async function getDeal(dealId: number): Promise<Deal> {
  return (await pipedriveV2("GET", `deals/${dealId}`)) as Deal;
}

async function getPerson(personId: number): Promise<Person> {
  return (await pipedriveV2("GET", `persons/${personId}`)) as Person;
}

function dealField(deal: Deal, key: string) {
  return (deal as Record<string, unknown>)[key] ?? deal.custom_fields?.[key];
}

function labelIds(deal: Deal): number[] {
  return [
    ...(Array.isArray(deal.label_ids) ? deal.label_ids.map(Number) : []),
    ...(Array.isArray(deal.labels) ? deal.labels.map((label) => Number(label.id)).filter(Boolean) : []),
  ];
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

function leadFacingHostName(owner: string): string {
  if (owner === "Rakesh") return "one of our team members";
  return ownerDisplayName(owner);
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

function interaktRecipient(rawPhone: string) {
  const cleaned = asString(rawPhone).replace(/[^\d+]/g, "");
  const digits = cleaned.replace(/\D/g, "");
  if (!digits) return {};
  if (cleaned.startsWith("+")) return { fullPhoneNumber: digits };
  if (digits.length === 10) return { countryCode: "+91", phoneNumber: digits };
  if (digits.length === 12 && digits.startsWith("91")) return { fullPhoneNumber: digits };
  return { fullPhoneNumber: digits };
}

function parseDealId(route: Record<string, unknown>): number | null {
  const explicit = Number(route?.deal_id);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const text = [route?.callback_data, route?.button_text].map(asString).join(" ");
  const match = text.match(/pipedrive_deal:(\d+)/i) ?? text.match(/deal[_\s-]?id[:=]\s*(\d+)/i);
  return match?.[1] ? Number(match[1]) : null;
}

async function searchDealsByPhone(phone: string): Promise<number[]> {
  const digits = asString(phone).replace(/\D/g, "");
  if (digits.length < 10) return [];
  const term = digits.slice(-10);
  const people = await pipedriveV1("GET", `persons/search?term=${encodeURIComponent(term)}&fields=phone&exact_match=false&limit=10`)
    .catch(() => null);
  const ids = new Set<number>();
  for (const item of people?.items || []) {
    const personIdValue = Number(item?.item?.id || item?.id);
    if (!personIdValue) continue;
    const deals = await pipedriveV1("GET", `persons/${personIdValue}/deals?status=open`).catch(() => []);
    for (const deal of deals || []) {
      const id = Number(deal?.id);
      if (id) ids.add(id);
    }
  }
  return [...ids];
}

async function searchDealsByTitle(title: string): Promise<number[]> {
  if (!asString(title)) return [];
  const result = await pipedriveV2("GET", `deals/search?term=${encodeURIComponent(title)}&fields=title&exact_match=true&limit=10`)
    .catch(() => null);
  return (result?.items || [])
    .map((item: any) => Number(item?.item?.id || item?.id))
    .filter((id: number) => Number.isFinite(id) && id > 0);
}

async function resolveDeal(route: Record<string, unknown>): Promise<{ deal: Deal | null; method: string; candidates: number[] }> {
  const directId = parseDealId(route);
  if (directId) return { deal: await getDeal(directId), method: "callback_deal_id", candidates: [directId] };

  const phoneIds = await searchDealsByPhone(asString(route?.phone));
  const titleIds = await searchDealsByTitle(asString(route?.deal_hint_title));
  const candidates = [...new Set([...phoneIds, ...titleIds])];
  const deals = await Promise.all(candidates.map((id) => getDeal(id).catch(() => null)));
  const openDeals = deals.filter(Boolean) as Deal[];
  const preferred = openDeals.find((deal) => {
    const labels = labelIds(deal);
    return (
      Boolean(dealField(deal, DEAL_FIELDS.meetingReferenceId)) ||
      Boolean(dealField(deal, DEAL_FIELDS.oneOnOneMeetingDateTime)) ||
      labels.includes(ONE_ON_ONE_TBC_LABEL_ID) ||
      labels.includes(ONE_ON_ONE_PENDING_LABEL_ID)
    );
  }) || openDeals[0] || null;
  return { deal: preferred, method: phoneIds.length ? "phone_search" : titleIds.length ? "title_search" : "unresolved", candidates };
}

function parseCalendarRef(raw: string): CalendarEventRef {
  if (!raw) return { calendarEmail: null, eventId: null, source: "none" };
  const prefixed = raw.match(/^google_calendar:([^:]+):(.+)$/);
  if (prefixed) return { calendarEmail: prefixed[1], eventId: prefixed[2], source: "pipedrive_field" };
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.event_id || parsed?.eventId) {
      return {
        calendarEmail: parsed.calendar_email || parsed.calendarEmail || null,
        eventId: parsed.event_id || parsed.eventId,
        source: "pipedrive_field",
      };
    }
  } catch {
    // Raw event IDs from older experiments are acceptable.
  }
  return { calendarEmail: null, eventId: raw, source: "pipedrive_field" };
}

async function findCalendarEvent(
  deal: Deal,
  calendarEmail: string,
  accessToken: string,
): Promise<CalendarEventRef> {
  const direct = parseCalendarRef(asString(dealField(deal, DEAL_FIELDS.meetingReferenceId)));
  if (direct.eventId) return { ...direct, calendarEmail: direct.calendarEmail || calendarEmail };

  const meetingDate = asString(dealField(deal, DEAL_FIELDS.oneOnOneMeetingDateTime));
  const center = meetingDate ? new Date(meetingDate) : new Date();
  const timeMin = new Date(center.getTime() - 14 * 24 * 60 * 60 * 1000);
  const timeMax = new Date(center.getTime() + 45 * 24 * 60 * 60 * 1000);
  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarEmail)}/events`);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("showDeleted", "false");
  url.searchParams.set("timeMin", timeMin.toISOString());
  url.searchParams.set("timeMax", timeMax.toISOString());
  url.searchParams.set("q", `Pipedrive deal: ${deal.id}`);
  const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Google event search failed for ${calendarEmail}: ${response.status} ${JSON.stringify(payload)}`);
  }
  const event = (payload.items || []).find((item: any) => {
    const text = `${item.summary || ""}\n${item.description || ""}`;
    return item.status !== "cancelled" && (text.includes(`Pipedrive deal: ${deal.id}`) || text.includes(`| ${deal.id}`));
  });
  return event?.id
    ? { calendarEmail, eventId: event.id, source: "calendar_search" }
    : { calendarEmail, eventId: null, source: "none" };
}

async function cancelCalendarEvent(ref: CalendarEventRef, accessToken: string, dryRun: boolean) {
  if (!ref.calendarEmail || !ref.eventId) return { canceled: false, reason: "event_not_found", ref };
  if (dryRun) return { canceled: false, dry_run: true, planned_event_id: ref.eventId, calendar: ref.calendarEmail, ref_source: ref.source };

  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(ref.calendarEmail)}/events/${encodeURIComponent(ref.eventId)}`);
  url.searchParams.set("sendUpdates", "none");
  const response = await fetch(url, { method: "DELETE", headers: { authorization: `Bearer ${accessToken}` } });
  if (response.status === 404 || response.status === 410) {
    return { canceled: false, already_missing: true, event_id: ref.eventId, calendar: ref.calendarEmail };
  }
  if (!response.ok) {
    const payload = await response.text().catch(() => "");
    throw new Error(`Google event cancel failed: ${response.status} ${payload}`);
  }
  return { canceled: true, event_id: ref.eventId, calendar: ref.calendarEmail, ref_source: ref.source };
}

async function updateDealForReschedule(dealId: number) {
  return await pipedriveV2("PATCH", `deals/${dealId}`, {
    label_ids: [ONE_ON_ONE_AWAITING_LABEL_ID],
    custom_fields: {
      [DEAL_FIELDS.oneOnOneMeetingDateTime]: null,
      [DEAL_FIELDS.meetingUrl]: null,
      [DEAL_FIELDS.meetingReferenceId]: null,
    },
  });
}

async function createPipedriveNote(dealId: number, content: string) {
  return await pipedriveV1("POST", "notes", { deal_id: dealId, content });
}

async function getOpenOneOnOneActivities(deal: Deal): Promise<PipedriveActivity[]> {
  const activities = await pipedriveV1("GET", `deals/${deal.id}/activities?done=0`).catch(() => []);
  const dealTitle = asString(deal.title).toLowerCase();
  return (activities || []).filter((activity: PipedriveActivity) => {
    const subject = asString(activity.subject).toLowerCase();
    const note = asString(activity.note).toLowerCase();
    return (
      subject.startsWith("1-on-1 call with ") &&
      (!dealTitle || subject.includes(dealTitle)) &&
      (asString(activity.type) === "meeting" || note.includes("prebooked with"))
    );
  });
}

async function closeStaleOneOnOneActivities(deal: Deal, dryRun: boolean) {
  const activities = await getOpenOneOnOneActivities(deal);
  if (dryRun) {
    return {
      dry_run: true,
      planned_activity_ids: activities.map((activity) => Number(activity.id)).filter(Boolean),
    };
  }

  const closed = [];
  for (const activity of activities) {
    const activityId = Number(activity.id);
    if (!activityId) continue;
    const updated = await pipedriveV1("PUT", `activities/${activityId}`, {
      done: 1,
      subject: "Cancelled 1-on-1 call",
      note: "Lead asked to reschedule. This old prebooked slot is no longer active.",
    });
    closed.push({ id: activityId, subject: updated?.subject || "Cancelled 1-on-1 call" });
  }
  return { dry_run: false, closed_activity_ids: closed.map((activity) => activity.id), closed };
}

async function createPipedriveActivity(
  dealId: number,
  subject: string,
  note: string,
  options: { personId?: number | null; done?: 0 | 1 } = {},
) {
  return await pipedriveV1("POST", "activities", {
    deal_id: dealId,
    ...(options.personId ? { person_id: options.personId } : {}),
    user_id: BEFOREST_ADMIN_USER_ID,
    subject,
    type: "task",
    done: options.done ?? 1,
    due_date: todayInTimezone("Asia/Kolkata"),
    note,
  });
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

function safeJson(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(/[<>&]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[char] || char));
}

function escapeHtml(value: string): string {
  return value.replace(/[<>&]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[char] || char));
}

async function buildReschedulePlan(deal: Deal, owner: string, bookingLinks: Record<string, string>) {
  const template = RESCHEDULE_LEAD_TEMPLATES[owner];
  const bookingLink = asString(bookingLinks[owner] || bookingLinks.default);
  const pid = personId(deal);
  const person = pid ? await getPerson(pid).catch(() => null) : null;
  const phone = primaryPhone(person) || asString(dealField(deal, DEAL_FIELDS.phone));
  if (!template || !bookingLink) return null;
  return {
    template_name: template.name,
    whatsapp_template_id: template.whatsappTemplateId,
    template_category: "marketing" as const,
    recipient: interaktRecipient(phone),
    raw_phone_present: Boolean(phone),
    body_values: [] as string[],
    button_values: { "1": [bookingLink] },
    booking_link: bookingLink,
    callback_data: `pipedrive_deal:${deal.id}:1on1_reschedule_booking_link`,
  };
}

function manualRescheduleMessage(deal: Deal, owner: string, plan: NonNullable<Awaited<ReturnType<typeof buildReschedulePlan>>>) {
  return [
    `Hi ${deal.title},`,
    "",
    "No worries, we have cancelled the earlier pre-booked call.",
    "",
    `Please choose a fresh 1-on-1 slot with ${leadFacingHostName(owner)} here:`,
    plan.booking_link,
    "",
    "Please book this as soon as possible so we can hold a convenient slot for you.",
  ].join("\n");
}

async function createManualWhatsAppFailureActivity(
  deal: Deal,
  owner: string,
  plan: NonNullable<Awaited<ReturnType<typeof buildReschedulePlan>>> | null,
  reason: string,
  fallbackBookingLink = "",
) {
  const manualMessage = plan
    ? manualRescheduleMessage(deal, owner, plan)
    : [
        `Hi ${deal.title},`,
        "",
        "We have cancelled the earlier pre-booked call.",
        fallbackBookingLink
          ? `Please choose a fresh 1-on-1 slot with ${leadFacingHostName(owner)} here:\n${fallbackBookingLink}`
          : "Please reply here and we will help you book a fresh 1-on-1 slot.",
      ].join("\n");
  return await createPipedriveActivity(
    deal.id,
    "WhatsApp failed - send manually",
    [
      "Reschedule acknowledgement WhatsApp failed. Please send this manually from WhatsApp Web.",
      `Reason: ${escapeHtml(reason)}`,
      plan?.template_name ? `Template: ${escapeHtml(plan.template_name)}` : "",
      "",
      "<strong>Copy-paste message</strong>",
      `<pre>${escapeHtml(manualMessage)}</pre>`,
      "<strong>Manual steps</strong>",
      "1. Open the lead in WhatsApp Web.",
      "2. Paste and send the message above.",
      "3. Confirm the old calendar invite is cancelled.",
      "4. Mark this Pipedrive activity as done after sending.",
    ].filter(Boolean).join("<br>"),
    { personId: personId(deal), done: 0 },
  );
}

async function sendInteraktTemplate(plan: NonNullable<Awaited<ReturnType<typeof buildReschedulePlan>>>) {
  if (!plan.raw_phone_present || (!("fullPhoneNumber" in plan.recipient) && !("phoneNumber" in plan.recipient))) {
    return { sent: false, skipped: true, reason: "missing_lead_phone" };
  }
  const apiKey = await wmill.getVariable(INTERAKT_API_KEY_PATH);
  const baseUrl = (await wmill.getVariable(INTERAKT_BASE_URL_PATH).catch(() => "https://api.interakt.ai")) || "https://api.interakt.ai";
  const authorization = apiKey.toLowerCase().startsWith("basic ") ? apiKey : `Basic ${apiKey}`;
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/v1/public/message/`, {
    method: "POST",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify({
      ...plan.recipient,
      callbackData: plan.callback_data,
      template_category: plan.template_category,
      type: "Template",
      template: {
        name: plan.template_name,
        languageCode: "en",
        bodyValues: plan.body_values,
        buttonValues: plan.button_values,
      },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.result === false) {
    throw new Error(`Interakt reschedule acknowledgement failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return { sent: true, response: payload };
}

function alreadyProcessed(deal: Deal) {
  const labels = labelIds(deal);
  return (
    labels.includes(ONE_ON_ONE_AWAITING_LABEL_ID) &&
    !asString(dealField(deal, DEAL_FIELDS.oneOnOneMeetingDateTime)) &&
    !asString(dealField(deal, DEAL_FIELDS.meetingReferenceId))
  );
}

export async function main(route: Record<string, unknown>, dry_run = false) {
  const resolved = await resolveDeal(route || {});
  if (!resolved.deal) {
    return {
      handled: false,
      action: "reschedule_requested",
      status: "needs_manual_deal_resolution",
      dry_run,
      resolution_method: resolved.method,
      candidate_deal_ids: resolved.candidates,
      phone: route?.phone ?? null,
      deal_hint_title: route?.deal_hint_title ?? null,
    };
  }

  const deal = resolved.deal;
  const owner = ownerAlias(deal);
  const ownerMap = JSON.parse(await wmill.getVariable(OWNER_CALENDAR_MAP_PATH)) as Record<string, string>;
  const bookingLinks = JSON.parse(await wmill.getVariable(OWNER_BOOKING_LINK_MAP_PATH).catch(() => "{}")) as Record<string, string>;
  const calendarEmail = ownerMap[owner] || ownerMap.default;
  if (!calendarEmail) throw new Error(`No owner calendar configured for ${owner}.`);

  const staleCallActivities = await closeStaleOneOnOneActivities(deal, dry_run);
  const ownerBookingLink = asString(bookingLinks[owner] || "");
  const repeatedManualPlan = await buildReschedulePlan(deal, owner, bookingLinks);

  if (alreadyProcessed(deal)) {
    const repeatedManualActivity = dry_run
      ? null
      : await createManualWhatsAppFailureActivity(
          deal,
          owner,
          repeatedManualPlan,
          repeatedManualPlan ? "Repeated reschedule request after deal was already awaiting." : "Repeated reschedule request; no approved booking-link template is available.",
          ownerBookingLink,
        );
    return {
      handled: true,
      action: "reschedule_requested",
      status: "already_processed",
      deal_id: deal.id,
      owner,
      label_id: ONE_ON_ONE_AWAITING_LABEL_ID,
      stale_call_activities: staleCallActivities,
      manual_whatsapp_activity_id: Number((repeatedManualActivity as any)?.id || (repeatedManualActivity as any)?.data?.id) || null,
      manual_task_planned: dry_run,
      manual_booking_link_present: Boolean(ownerBookingLink),
      whatsapp: repeatedManualPlan,
      dry_run,
    };
  }

  const serviceAccount = JSON.parse(await wmill.getVariable(SERVICE_ACCOUNT_JSON_PATH)) as ServiceAccount;
  const accessToken = await getAccessToken(serviceAccount, calendarEmail);
  const eventRef = await findCalendarEvent(deal, calendarEmail, accessToken);
  const cancelResult = await cancelCalendarEvent(eventRef, accessToken, dry_run);
  const whatsappPlan = await buildReschedulePlan(deal, owner, bookingLinks);
  const noteContent = [
    "<strong>1on1 reschedule requested from WhatsApp</strong>",
    `Deal: ${deal.id} - ${deal.title}`,
    `Owner: ${ownerDisplayName(owner)}`,
    `Previous calendar event: ${eventRef.eventId || "not found"}`,
    `Calendar cancel result: ${JSON.stringify(cancelResult)}`,
    `New booking link template: ${whatsappPlan?.template_name || "not sent"}`,
  ].join("<br>");

  if (dry_run) {
    return {
      handled: true,
      action: "reschedule_requested",
      status: "dry_run_ready",
      deal_id: deal.id,
      deal_title: deal.title,
      owner,
      calendar: calendarEmail,
      resolution_method: resolved.method,
      candidate_deal_ids: resolved.candidates,
      event_ref: eventRef,
      cancel_plan: cancelResult,
      pipedrive_update: {
        label_ids: [ONE_ON_ONE_AWAITING_LABEL_ID],
        clear_fields: Object.values(DEAL_FIELDS).filter((field) => field !== DEAL_FIELDS.phone),
      },
      stale_call_activities: staleCallActivities,
      whatsapp: whatsappPlan,
      note_preview: noteContent,
    };
  }

  await updateDealForReschedule(deal.id);
  const note = await createPipedriveNote(deal.id, noteContent);
  let whatsappResult: any = whatsappPlan ? null : { sent: false, skipped: true, reason: "missing_template_or_booking_link" };
  let manualWhatsAppActivity: any = null;
  if (whatsappPlan) {
    try {
      whatsappResult = await sendInteraktTemplate(whatsappPlan);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      whatsappResult = { sent: false, failed: true, reason };
      manualWhatsAppActivity = await createManualWhatsAppFailureActivity(deal, owner, whatsappPlan, reason, ownerBookingLink);
    }
  } else {
    manualWhatsAppActivity = await createManualWhatsAppFailureActivity(deal, owner, whatsappPlan, "Missing template or owner booking link.", ownerBookingLink);
  }
  const calendarAudit = await createPipedriveActivity(
    deal.id,
    cancelResult.canceled
      ? "Call cancelled for reschedule"
      : "Reschedule requested",
    [
      "Lead asked to reschedule on WhatsApp.",
      cancelResult.canceled ? "Old calendar invite was cancelled." : "No matching calendar invite was found to cancel.",
      `Owner: ${ownerDisplayName(owner)}`,
    ].join("<br>"),
    { personId: personId(deal) },
  );
  const whatsappAudit = (whatsappResult as any)?.sent
    ? await createPipedriveActivity(
        deal.id,
        "Booking link sent on WhatsApp",
        [
          "Sent the owner booking link for a fresh 1on1 slot.",
          `Owner: ${ownerDisplayName(owner)}`,
          `Template: ${whatsappPlan?.template_name || "not available"}`,
          "",
          "<strong>Message sent</strong>",
          `<pre>${escapeHtml(whatsappPlan ? manualRescheduleMessage(deal, owner, whatsappPlan) : `Hi ${deal.title},\n\nPlease reply here and we will help you book a fresh 1-on-1 slot.`)}</pre>`,
        ].join("<br>"),
        { personId: personId(deal) },
      )
    : null;

  return {
    handled: true,
    action: "reschedule_requested",
    status: "completed",
    deal_id: deal.id,
    owner,
    label_id: ONE_ON_ONE_AWAITING_LABEL_ID,
    calendar_cancel: cancelResult,
    stale_call_activities: staleCallActivities,
    note_id: Number(note?.id) || null,
    calendar_audit_activity_id: Number((calendarAudit as any)?.id || (calendarAudit as any)?.data?.id) || null,
    whatsapp_audit_activity_id: Number((whatsappAudit as any)?.id || (whatsappAudit as any)?.data?.id) || null,
    manual_whatsapp_activity_id: Number((manualWhatsAppActivity as any)?.id || (manualWhatsAppActivity as any)?.data?.id) || null,
    whatsapp_sent: Boolean((whatsappResult as any)?.sent),
    whatsapp_result: whatsappResult,
    dry_run: false,
  };
}
