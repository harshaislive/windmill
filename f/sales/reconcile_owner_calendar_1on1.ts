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
const PIPEDRIVE_VARIABLE_PATH = "f/collectives/zoom_collective_to_pipedrive/pipedrive_api_key";
const PIPEDRIVE_DOMAIN = "beforest";
const BEFOREST_ADMIN_USER_ID = 18891506;
const DEFAULT_TIMEZONE = "Asia/Kolkata";

const DEAL_FIELDS = {
  oneOnOneMeetingDateTime: "d6fd8c9877d20bfd678ecb37f21e5b33bd2717fd",
  meetingUrl: "c818768b64d54270c74b931b4581082b543c8571",
  meetingReferenceId: "cd1b8c89ded44fccbf04ded59928cc9fc3ae0e50",
};

const OWNER_IDS_BY_EMAIL_HINT: Array<{ hint: string; ownerId: number; ownerName: string }> = [
  { hint: "vivekanand", ownerId: 22251956, ownerName: "Vivekanand" },
  { hint: "vivek", ownerId: 22251956, ownerName: "Vivekanand" },
  { hint: "sai", ownerId: 13490118, ownerName: "Sai Rakesh" },
  { hint: "rakesh", ownerId: 13490118, ownerName: "Sai Rakesh" },
  { hint: "sravani", ownerId: 13490118, ownerName: "Sai Rakesh" },
];

type ServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri: string;
};

type CalendarEvent = {
  id: string;
  summary?: string;
  description?: string;
  htmlLink?: string;
  hangoutLink?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  status?: string;
};

function asString(value: unknown): string {
  return String(value ?? "").trim();
}

function asNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[<>&]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[char] || char));
}

function base64Url(input: string | ArrayBuffer): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const binary = atob(
    pem
      .replace("-----BEGIN PRIVATE KEY-----", "")
      .replace("-----END PRIVATE KEY-----", "")
      .replace(/\s/g, ""),
  );
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
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
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64Url(signature)}`;
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

async function pipedriveV2(method: string, path: string, body?: Record<string, unknown>) {
  const apiToken = await wmill.getVariable(PIPEDRIVE_VARIABLE_PATH);
  const url = new URL(`https://${PIPEDRIVE_DOMAIN}.pipedrive.com/api/v2/${path.replace(/^\/+/, "")}`);
  url.searchParams.set("api_token", apiToken);
  const startedAt = Date.now();
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
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

async function pipedriveV1(method: string, path: string, body?: Record<string, unknown>, params: Record<string, unknown> = {}) {
  const apiToken = await wmill.getVariable(PIPEDRIVE_VARIABLE_PATH);
  const url = new URL(`https://${PIPEDRIVE_DOMAIN}.pipedrive.com/api/v1/${path.replace(/^\/+/, "")}`);
  url.searchParams.set("api_token", apiToken);
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && asString(value)) url.searchParams.set(key, asString(value));
  }
  const startedAt = Date.now();
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
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

function ownerForCalendar(calendarEmail: string) {
  const lower = calendarEmail.toLowerCase();
  return OWNER_IDS_BY_EMAIL_HINT.find((item) => lower.includes(item.hint)) || {
    ownerId: BEFOREST_ADMIN_USER_ID,
    ownerName: "Beforest Admin",
  };
}

function uniqueCalendarEmails(ownerMap: Record<string, string>) {
  return Array.from(new Set(Object.values(ownerMap).map(asString).filter(Boolean)));
}

function eventStart(event: CalendarEvent): Date | null {
  const value = event.start?.dateTime || event.start?.date;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function eventEnd(event: CalendarEvent): Date | null {
  const value = event.end?.dateTime || event.end?.date;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function eventMeetingUrl(event: CalendarEvent): string {
  return asString(event.hangoutLink || event.location || event.htmlLink);
}

function ownerMeetingUrl(ownerName: string, event: CalendarEvent): string | null {
  if (ownerName === "Vivekanand") return null;
  return eventMeetingUrl(event);
}

function meetingLinkNote(ownerName: string, meetingUrl: string | null): string {
  if (ownerName === "Vivekanand") return "Vivek will call directly.";
  return meetingUrl ? `Meeting link: ${escapeHtml(meetingUrl)}` : "";
}

function parseDealId(event: CalendarEvent): number | null {
  const text = [event.summary, event.description, event.location].map(asString).join("\n");
  const explicit = text.match(/pipedrive\s+deal\s*:?\s*(\d+)/i) || text.match(/pipedrive_deal:(\d+)/i);
  if (explicit?.[1]) return asNumber(explicit[1]);

  const title = asString(event.summary);
  if (/beforest|1[-\s]?on[-\s]?1|collective/i.test(title)) {
    const trailing = title.match(/(?:\||#|\bdeal\b)\s*(\d{4,})\s*$/i);
    if (trailing?.[1]) return asNumber(trailing[1]);
  }
  return null;
}

async function listCalendarEvents(calendarEmail: string, accessToken: string, timeMin: Date, timeMax: Date, maxEvents: number) {
  const events: CalendarEvent[] = [];
  let pageToken = "";
  do {
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarEmail)}/events`);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("showDeleted", "false");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("timeMin", timeMin.toISOString());
    url.searchParams.set("timeMax", timeMax.toISOString());
    url.searchParams.set("maxResults", String(Math.min(2500, Math.max(1, maxEvents - events.length))));
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`Google events list failed for ${calendarEmail}: ${response.status} ${JSON.stringify(payload)}`);
    }
    events.push(...(Array.isArray(payload.items) ? payload.items : []));
    pageToken = asString(payload.nextPageToken);
  } while (pageToken && events.length < maxEvents);
  return events.slice(0, maxEvents);
}

function pipedriveDateParts(date: Date) {
  const iso = date.toISOString();
  return { due_date: iso.slice(0, 10), due_time: iso.slice(11, 19) };
}

async function existingDealActivities(dealId: number) {
  const [openActivities, doneActivities] = await Promise.all([
    pipedriveV1("GET", `deals/${dealId}/activities`, undefined, { done: 0, limit: 500 }).catch(() => []),
    pipedriveV1("GET", `deals/${dealId}/activities`, undefined, { done: 1, limit: 500 }).catch(() => []),
  ]);
  return [
    ...(Array.isArray(openActivities) ? openActivities : []),
    ...(Array.isArray(doneActivities) ? doneActivities : []),
  ];
}

function matchingCallActivities(activities: any[], subject: string, referenceId: string, start: Date) {
  const { due_date, due_time } = pipedriveDateParts(start);
  return activities.filter((activity) =>
    asString(activity.subject) === subject &&
    (
      asString(activity.note).includes(referenceId) ||
      (asString(activity.due_date) === due_date && asString(activity.due_time).slice(0, 5) === due_time.slice(0, 5))
    ),
  );
}

async function closeDuplicateActivities(activities: any[], referenceId: string) {
  const isOpen = (activity: any) =>
    activity.done !== true &&
    Number(activity.done) !== 1 &&
    asString(activity.done).toLowerCase() !== "true";
  const sorted = [...activities].sort((left, right) => (Number(left.id) || 0) - (Number(right.id) || 0));
  const primary = sorted.find(isOpen) || sorted[0];
  const duplicates = sorted.filter((activity) => Number(activity.id) && Number(activity.id) !== Number(primary?.id) && isOpen(activity));
  const closed = [];
  for (const activity of duplicates) {
    const note = [
      asString(activity.note),
      "",
      "Closed by calendar reconciliation because another activity already tracks this same calendar event.",
      `Calendar event: ${referenceId}`,
    ].filter(Boolean).join("<br>");
    const updated = await pipedriveV1("PUT", `activities/${activity.id}`, {
      done: 1,
      note,
    });
    closed.push(Number(updated?.id) || Number(activity.id));
  }
  return closed;
}

function hasCalendarSyncAudit(activities: any[], referenceId: string) {
  return activities.some((activity) =>
    asString(activity.subject) === "Calendar synced to Pipedrive" &&
    asString(activity.note).includes(referenceId),
  );
}

async function syncEventToDeal(calendarEmail: string, event: CalendarEvent, dryRun: boolean) {
  const dealId = parseDealId(event);
  const start = eventStart(event);
  const end = eventEnd(event);
  if (!dealId || !start || !end) {
    return {
      synced: false,
      skipped: true,
      reason: !dealId ? "missing_deal_id" : "missing_event_time",
      event_id: event.id,
      summary: event.summary || null,
    };
  }

  const deal = await pipedriveV2("GET", `deals/${dealId}`);
  const owner = ownerForCalendar(calendarEmail);
  const meetingUrl = ownerMeetingUrl(owner.ownerName, event);
  const referenceId = `google_calendar:${calendarEmail}:${event.id}`;
  const subject = `1-on-1 call with ${asString(deal.title) || `deal ${dealId}`}`;
  const activities = dryRun ? [] : await existingDealActivities(dealId);
  const callMatches = dryRun ? [] : matchingCallActivities(activities, subject, referenceId, start);
  const hasCallActivity = callMatches.length > 0;
  const hasAudit = !dryRun && hasCalendarSyncAudit(activities, referenceId);
  const { due_date, due_time } = pipedriveDateParts(start);

  const planned = {
    deal_id: dealId,
    deal_title: deal.title,
    calendar: calendarEmail,
    owner_id: owner.ownerId,
    event_id: event.id,
    event_title: event.summary || null,
    start: start.toISOString(),
    end: end.toISOString(),
    meeting_url: meetingUrl,
    meeting_reference_id: referenceId,
    scheduled_subject: subject,
  };
  if (dryRun) return { synced: false, dry_run: true, planned };

  await pipedriveV2("PATCH", `deals/${dealId}`, {
    custom_fields: {
      [DEAL_FIELDS.oneOnOneMeetingDateTime]: start.toISOString(),
      [DEAL_FIELDS.meetingUrl]: meetingUrl,
      [DEAL_FIELDS.meetingReferenceId]: referenceId,
    },
  });

  const callActivity = hasCallActivity
    ? null
    : await pipedriveV1("POST", "activities", {
        deal_id: dealId,
        user_id: owner.ownerId,
        subject,
        type: "meeting",
        done: 0,
        due_date,
        due_time,
        note: [
          `Synced from ${escapeHtml(owner.ownerName)} calendar.`,
          `When: ${escapeHtml(start.toLocaleString("en-IN", { timeZone: DEFAULT_TIMEZONE }))} IST`,
          meetingLinkNote(owner.ownerName, meetingUrl),
          `Calendar event: ${escapeHtml(referenceId)}`,
        ].filter(Boolean).join("<br>"),
      });
  const closedDuplicateActivityIds = hasCallActivity
    ? await closeDuplicateActivities(callMatches, referenceId)
    : [];

  const auditActivity = hasAudit
    ? null
    : await pipedriveV1("POST", "activities", {
        deal_id: dealId,
        user_id: BEFOREST_ADMIN_USER_ID,
        subject: "Calendar synced to Pipedrive",
        type: "task",
        done: 1,
        due_date: new Date().toISOString().slice(0, 10),
        note: [
          `Found ${escapeHtml(owner.ownerName)} calendar event and updated the deal.`,
          `Calendar event: ${escapeHtml(referenceId)}`,
        ].join("<br>"),
      });

  return {
    synced: true,
    ...planned,
    deal_updated: true,
    call_activity_id: Number(callActivity?.id) || null,
    audit_activity_id: Number(auditActivity?.id) || null,
    call_activity_already_present: hasCallActivity,
    audit_already_present: hasAudit,
    closed_duplicate_activity_ids: closedDuplicateActivityIds,
  };
}

export async function main(
  dry_run = true,
  lookback_days = 2,
  lookahead_days = 30,
  max_events_per_calendar = 500,
) {
  const [rawServiceAccount, rawOwnerMap] = await Promise.all([
    wmill.getVariable(SERVICE_ACCOUNT_JSON_PATH),
    wmill.getVariable(OWNER_CALENDAR_MAP_PATH),
  ]);
  const serviceAccount = JSON.parse(rawServiceAccount) as ServiceAccount;
  const ownerMap = JSON.parse(rawOwnerMap) as Record<string, string>;
  const calendars = uniqueCalendarEmails(ownerMap);
  const now = Date.now();
  const timeMin = new Date(now - Math.max(0, lookback_days) * 24 * 60 * 60 * 1000);
  const timeMax = new Date(now + Math.max(1, lookahead_days) * 24 * 60 * 60 * 1000);
  const results = [];

  for (const calendarEmail of calendars) {
    const accessToken = await getAccessToken(serviceAccount, calendarEmail);
    const events = await listCalendarEvents(calendarEmail, accessToken, timeMin, timeMax, Math.max(1, max_events_per_calendar));
    const eventResults = [];
    for (const event of events) {
      if (event.status === "cancelled") continue;
      eventResults.push(await syncEventToDeal(calendarEmail, event, dry_run));
    }
    results.push({
      calendar: calendarEmail,
      events_seen: events.length,
      synced: eventResults.filter((item: any) => item.synced).length,
      skipped: eventResults.filter((item: any) => item.skipped).length,
      results: eventResults,
    });
  }

  return {
    dry_run,
    window: { time_min: timeMin.toISOString(), time_max: timeMax.toISOString() },
    calendars_checked: calendars.length,
    total_synced: results.reduce((sum, item) => sum + item.synced, 0),
    total_skipped: results.reduce((sum, item) => sum + item.skipped, 0),
    calendars: results,
  };
}
