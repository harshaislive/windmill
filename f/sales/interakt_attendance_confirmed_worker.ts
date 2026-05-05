import * as wmill from "windmill-client";

const SERVICE_ACCOUNT_JSON_PATH = "f/sales/calendar_prebook_1on1/google_service_account_json";
const OWNER_CALENDAR_MAP_PATH = "f/sales/calendar_prebook_1on1/owner_calendar_map";
const INTERAKT_API_KEY_PATH = "f/sales/calendar_prebook_1on1/interakt_api_key";
const INTERAKT_BASE_URL_PATH = "f/sales/calendar_prebook_1on1/interakt_base_url";
const PIPEDRIVE_VARIABLE_PATH = "f/collectives/zoom_collective_to_pipedrive/pipedrive_api_key";
const DEFAULT_PIPEDRIVE_DOMAIN = "beforest";
const ONE_ON_ONE_PENDING_LABEL_ID = 106;
const ONE_ON_ONE_TBC_LABEL_ID = 115;
const ATTENDANCE_TEMPLATE_NAME = "attendance_confirmation_1on1";
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

type ServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri: string;
};

type CalendarEventRef = {
  calendarEmail: string | null;
  eventId: string | null;
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

async function pipedriveV1(method: string, path: string, body?: Record<string, unknown>): Promise<any> {
  const url = new URL(`https://${DEFAULT_PIPEDRIVE_DOMAIN}.pipedrive.com/api/v1/${path}`);
  url.searchParams.set("api_token", await pipedriveToken());
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

function parseCalendarRef(raw: string): CalendarEventRef {
  if (!raw) return { calendarEmail: null, eventId: null };
  const prefixed = raw.match(/^google_calendar:([^:]+):(.+)$/);
  if (prefixed) return { calendarEmail: prefixed[1], eventId: prefixed[2] };
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.event_id || parsed?.eventId) {
      return {
        calendarEmail: parsed.calendar_email || parsed.calendarEmail || null,
        eventId: parsed.event_id || parsed.eventId,
      };
    }
  } catch {
    // Raw event IDs are acceptable.
  }
  return { calendarEmail: null, eventId: raw };
}

async function getCalendarEventFallback(deal: Deal, owner: string) {
  const ref = parseCalendarRef(asString(dealField(deal, DEAL_FIELDS.meetingReferenceId)));
  const ownerMap = JSON.parse(await wmill.getVariable(OWNER_CALENDAR_MAP_PATH)) as Record<string, string>;
  const calendarEmail = ref.calendarEmail || ownerMap[owner] || ownerMap.default;
  if (!calendarEmail || !ref.eventId) return null;

  const serviceAccount = JSON.parse(await wmill.getVariable(SERVICE_ACCOUNT_JSON_PATH)) as ServiceAccount;
  const accessToken = await getAccessToken(serviceAccount, calendarEmail);
  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarEmail)}/events/${encodeURIComponent(ref.eventId)}`);
  const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  if (response.status === 404 || response.status === 410) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Google event fetch failed for ${calendarEmail}: ${response.status} ${JSON.stringify(payload)}`);
  }
  return {
    calendar: calendarEmail,
    event_id: ref.eventId,
    start: payload.start?.dateTime || payload.start?.date || null,
    meeting_url: payload.hangoutLink || payload.htmlLink || null,
  };
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
      labels.includes(ONE_ON_ONE_TBC_LABEL_ID)
    );
  }) || openDeals[0] || null;
  return { deal: preferred, method: phoneIds.length ? "phone_search" : titleIds.length ? "title_search" : "unresolved", candidates };
}

function formatMeetingDate(value: unknown) {
  const raw = asString(value);
  if (!raw) return "the scheduled time";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date).replace(",", " at") + " IST";
}

async function buildAttendancePlan(deal: Deal, owner: string, meetingDateValue?: unknown) {
  const pid = personId(deal);
  const person = pid ? await getPerson(pid).catch(() => null) : null;
  const phone = primaryPhone(person) || asString(dealField(deal, DEAL_FIELDS.phone));
  return {
    template_name: ATTENDANCE_TEMPLATE_NAME,
    template_category: "utility" as const,
    recipient: interaktRecipient(phone),
    raw_phone_present: Boolean(phone),
    body_values: [
      deal.title,
      ownerDisplayName(owner),
      formatMeetingDate(meetingDateValue ?? dealField(deal, DEAL_FIELDS.oneOnOneMeetingDateTime)),
    ],
    callback_data: `pipedrive_deal:${deal.id}:1on1_attendance_confirmed`,
  };
}

async function sendInteraktTemplate(plan: Awaited<ReturnType<typeof buildAttendancePlan>>) {
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
      },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.result === false) {
    throw new Error(`Interakt attendance confirmation failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return { sent: true, response: payload };
}

async function updateDealForAttendance(dealId: number) {
  return await pipedriveV2("PATCH", `deals/${dealId}`, {
    label_ids: [ONE_ON_ONE_PENDING_LABEL_ID],
  });
}

async function createPipedriveNote(dealId: number, content: string) {
  return await pipedriveV1("POST", "notes", { deal_id: dealId, content });
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

export async function main(route: Record<string, unknown>, dry_run = false) {
  const resolved = await resolveDeal(route || {});
  if (!resolved.deal) {
    return {
      handled: false,
      action: "attendance_confirmed",
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
  const calendarFallback = await getCalendarEventFallback(deal, owner).catch((error) => ({
    error: error instanceof Error ? error.message : String(error),
    start: null,
    meeting_url: null,
  }));
  const meetingDateValue = dealField(deal, DEAL_FIELDS.oneOnOneMeetingDateTime) || calendarFallback?.start;
  const meetingUrlValue = dealField(deal, DEAL_FIELDS.meetingUrl) || calendarFallback?.meeting_url;
  const plan = await buildAttendancePlan(deal, owner, meetingDateValue);
  const noteContent = [
    "<strong>1on1 attendance confirmed from WhatsApp</strong>",
    `Deal: ${deal.id} - ${deal.title}`,
    `Owner: ${ownerDisplayName(owner)}`,
    `Meeting time: ${formatMeetingDate(meetingDateValue)}`,
    `Meeting URL: ${asString(meetingUrlValue) || "not available"}`,
    `Template: ${plan.template_name}`,
  ].join("<br>");

  if (dry_run) {
    return {
      handled: true,
      action: "attendance_confirmed",
      status: "dry_run_ready",
      deal_id: deal.id,
      deal_title: deal.title,
      owner,
      resolution_method: resolved.method,
      candidate_deal_ids: resolved.candidates,
      calendar_fallback: calendarFallback,
      pipedrive_update: { label_ids: [ONE_ON_ONE_PENDING_LABEL_ID] },
      whatsapp: plan,
      note_preview: noteContent,
    };
  }

  if (labelIds(deal).includes(ONE_ON_ONE_PENDING_LABEL_ID)) {
    return {
      handled: true,
      action: "attendance_confirmed",
      status: "already_processed",
      deal_id: deal.id,
      owner,
      label_id: ONE_ON_ONE_PENDING_LABEL_ID,
      dry_run: false,
    };
  }

  await updateDealForAttendance(deal.id);
  const note = await createPipedriveNote(deal.id, noteContent);
  const whatsappResult = await sendInteraktTemplate(plan);
  const inboundAudit = await createPipedriveActivity(
    deal.id,
    "Attendance confirmed on WhatsApp",
    [
      "Lead confirmed they will attend the 1on1.",
      `Meeting time: ${formatMeetingDate(meetingDateValue)}`,
    ].join("<br>"),
    { personId: personId(deal) },
  );
  const whatsappAudit = (whatsappResult as any)?.sent
    ? await createPipedriveActivity(
        deal.id,
        "Attendance confirmation sent",
        [
          "Sent a short confirmation back to the lead.",
          `Owner: ${ownerDisplayName(owner)}`,
        ].join("<br>"),
        { personId: personId(deal) },
      )
    : null;

  return {
    handled: true,
    action: "attendance_confirmed",
    status: "completed",
    deal_id: deal.id,
    owner,
    label_id: ONE_ON_ONE_PENDING_LABEL_ID,
    note_id: Number(note?.id) || null,
    inbound_audit_activity_id: Number((inboundAudit as any)?.id || (inboundAudit as any)?.data?.id) || null,
    whatsapp_audit_activity_id: Number((whatsappAudit as any)?.id || (whatsappAudit as any)?.data?.id) || null,
    whatsapp_sent: Boolean((whatsappResult as any)?.sent),
    whatsapp_result: whatsappResult,
    dry_run: false,
  };
}
