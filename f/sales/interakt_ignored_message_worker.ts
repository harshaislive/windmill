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

const PIPEDRIVE_VARIABLE_PATH = "f/collectives/zoom_collective_to_pipedrive/pipedrive_api_key";
const PIPEDRIVE_DOMAIN = "beforest";
const BEFOREST_ADMIN_USER_ID = 18891506;
const BROCHURE_FOLLOWUP_SCRIPT_PATH = "f/sales/send_brochure_after_typeform";
const RECENT_TYPEFORM_MATCH_WINDOW_MINUTES = 15;

function asString(value: unknown) {
  return String(value ?? "").trim();
}

function asNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[<>&]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[char] || char));
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

function parseRawTemplate(route: Record<string, unknown>) {
  const rawValue = route.raw_template;
  if (rawValue && typeof rawValue === "object") return rawValue as Record<string, unknown>;
  const rawTemplate = asString(rawValue);
  if (!rawTemplate) return null;
  try {
    return JSON.parse(rawTemplate);
  } catch {
    return null;
  }
}

function rawTemplateBody(route: Record<string, unknown>) {
  const parsed = parseRawTemplate(route);
  const body = parsed?.body || parsed?.components?.find?.((component: any) => asString(component?.type).toLowerCase() === "body")?.text;
  return asString(body);
}

function primitiveArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "object" && item) {
          return asString((item as any).text || (item as any).value || (item as any).parameter_value || (item as any).payload);
        }
        return asString(item);
      })
      .filter(Boolean);
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => Number(left) - Number(right))
      .map(([, item]) => asString(item))
      .filter(Boolean);
  }
  return [];
}

function rawTemplateValues(route: Record<string, unknown>): string[] {
  const parsed = parseRawTemplate(route);
  const direct = [
    route.body_values,
    route.bodyValues,
    route.template_values,
    route.templateValues,
    route.template_body_values,
    route.templateBodyValues,
    parsed?.body_values,
    parsed?.bodyValues,
    parsed?.values,
    parsed?.parameters,
  ].flatMap(primitiveArray);
  if (direct.length) return direct;

  const bodyComponent = parsed?.components?.find?.((component: any) => asString(component?.type).toLowerCase() === "body");
  return primitiveArray(bodyComponent?.parameters || bodyComponent?.values || bodyComponent?.bodyValues);
}

function fillTemplateVariables(template: string, values: string[]) {
  if (!template || !values.length) return template;
  return template.replace(/\{\{\s*(\d+)\s*\}\}/g, (match, index) => values[Number(index) - 1] || match);
}

function formatCopyPasteMessage(message: string) {
  return asString(message)
    .replace(/\s+\*Date:\*/i, "\n\n*Date:*")
    .replace(/\s+\*Time:\*/i, "\n*Time:*")
    .replace(/\s+-\s*_Team Beforest_/i, "\n\n- _Team Beforest_")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function formatDateForWhatsApp(date: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatTimeForWhatsApp(date: Date) {
  return `${new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date).toUpperCase()} IST`;
}

function firstName(value: string) {
  return asString(value).split(/\s+/, 1)[0] || "there";
}

function displayPhone(rawPhone: unknown, rawCountryCode: unknown = "+91") {
  const value = asString(rawPhone);
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  if (!digits) return value;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
  if (digits.length === 10) {
    const countryDigits = asString(rawCountryCode).replace(/\D/g, "") || "91";
    return `+${countryDigits}${digits}`;
  }
  return `+${digits}`;
}

function parseUtcDate(value: unknown): Date | null {
  const raw = asString(value);
  if (!raw) return null;
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const withTimezone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(normalized) ? normalized : `${normalized}Z`;
  const date = new Date(withTimezone);
  return Number.isNaN(date.getTime()) ? null : date;
}

function routeTimestamp(route: Record<string, unknown>): Date {
  return parseUtcDate(route.event_timestamp) || parseUtcDate(route.received_at) || new Date();
}

function normalizedInboundText(route: Record<string, unknown>): string {
  return [
    route.button_text,
    route.message,
    route.text,
    route.body,
  ]
    .map(asString)
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function looksLikePostTypeformInbound(route: Record<string, unknown>): boolean {
  const text = normalizedInboundText(route);
  if (!text) return false;
  return (
    (text.includes("submitted") && (text.includes("form") || text.includes("collective"))) ||
    (text.includes("just submitted") && text.includes("next step")) ||
    (text.includes("speak with") && text.includes("team") && text.includes("next step"))
  );
}

function looksLikeBrochureRequestInbound(route: Record<string, unknown>): boolean {
  const text = normalizedInboundText(route);
  if (!text) return false;
  return (
    text.includes("please send me the brochure") ||
    text.includes("send me the brochure") ||
    text.includes("send brochure") ||
    text.includes("brochure please")
  );
}

function isNormalInboundMessage(route: Record<string, unknown>) {
  if (route?.action !== "ignored") return false;
  const webhookType = asString(route.webhook_type).toLowerCase();
  if (webhookType.includes("message_received")) return true;
  if (webhookType.includes("status") || webhookType.includes("delivery") || webhookType.includes("message api") || webhookType.includes("message campaign")) {
    return false;
  }
  return Boolean(asString(route.phone));
}

function ownerIdFromDeal(deal: Record<string, unknown>) {
  const value = deal.owner_id ?? deal.user_id;
  if (typeof value === "object" && value) return asNumber((value as Record<string, unknown>).id);
  return asNumber(value) || BEFOREST_ADMIN_USER_ID;
}

function personIdFromDeal(deal: Record<string, unknown>) {
  const value = deal.person_id;
  if (typeof value === "object" && value) return asNumber((value as Record<string, unknown>).id);
  return asNumber(value);
}

function collectiveFromDeal(deal: any, activities: any[]) {
  const pipelineMap: Record<number, string> = {
    1: "Hammiyala Collective",
    2: "Mumbai Collective",
    3: "Poomaale Collective",
    4: "Bhopal Collective",
    6: "Hyderabad Collective",
  };
  const fromPipeline = pipelineMap[Number(deal?.pipeline_id)];
  if (fromPipeline) return fromPipeline;
  const haystack = [deal?.title, ...activities.map((activity) => activity?.subject)].map(asString).join(" ").toLowerCase();
  for (const label of ["Hammiyala", "Mumbai", "Poomaale", "Bhopal", "Hyderabad"]) {
    if (haystack.includes(label.toLowerCase())) return `${label} Collective`;
  }
  return "the Beforest Collective";
}

function eventDateFromActivities(activities: any[]) {
  const activity = activities.find((item) => /webinar|1[-\s]?on[-\s]?1|collective/i.test(asString(item.subject))) || activities[0];
  if (!activity?.due_date) return null;
  const dueTime = asString(activity.due_time) || "00:00:00";
  const [year, month, day] = asString(activity.due_date).split("-").map(Number);
  const [hour, minute, second] = dueTime.replace(/Z$/, "").split(":").map(Number);
  if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
  const date = new Date(Date.UTC(year, month - 1, day, hour - 5, minute - 30, Number.isFinite(second) ? second : 0));
  return Number.isNaN(date.getTime()) ? null : date;
}

async function dealContext(route: Record<string, unknown>) {
  const dealId = asNumber(route.deal_id);
  if (!dealId) return null;
  const [deal, openActivities, doneActivities] = await Promise.all([
    pipedriveV2("GET", `deals/${dealId}`).catch(() => null),
    pipedriveV1("GET", `deals/${dealId}/activities?done=0`).catch(() => []),
    pipedriveV1("GET", `deals/${dealId}/activities?done=1`).catch(() => []),
  ]);
  const activities = [
    ...(Array.isArray(openActivities) ? openActivities : []),
    ...(Array.isArray(doneActivities) ? doneActivities : []),
  ];
  return { deal, activities };
}

function inferredTemplateValues(route: Record<string, unknown>, context: Awaited<ReturnType<typeof dealContext>>) {
  const templateName = asString(route.template_name).toLowerCase();
  const deal = context?.deal;
  const activities = context?.activities || [];
  const eventDate = eventDateFromActivities(activities);
  if (templateName.includes("collective_webinar_confirmation")) {
    return [
      firstName(asString(route.customer_name) || asString(deal?.title)),
      collectiveFromDeal(deal, activities),
      eventDate ? formatDateForWhatsApp(eventDate) : "the scheduled date",
      eventDate ? formatTimeForWhatsApp(eventDate) : "the scheduled time",
    ];
  }
  return [];
}

async function manualFallbackMessage(route: Record<string, unknown>) {
  const templateName = asString(route.template_name).toLowerCase();
  const rawBody = rawTemplateBody(route);
  if (rawBody) {
    const values = rawTemplateValues(route);
    const context = values.length ? null : await dealContext(route);
    const filled = fillTemplateVariables(rawBody, values.length ? values : inferredTemplateValues(route, context));
    return formatCopyPasteMessage(filled);
  }

  if (templateName.includes("team_scheduling_notice")) {
    const context = await dealContext(route);
    const leadName = firstName(asString(route.customer_name) || asString(context?.deal?.title));
    const collective = collectiveFromDeal(context?.deal, context?.activities || []);
    return [
      `Hi ${leadName},`,
      "",
      `Your request for a 1on1 conversation for ${collective} is in review. One of our team members will message you directly to schedule the conversation.`,
    ].join("\n");
  }

  if (templateName.includes("webinar") && templateName.includes("reminder")) {
    return "Hi, quick reminder about your Beforest webinar. Please check your latest email/calendar invite for the joining link, and reply here if you need help.";
  }
  if (templateName.includes("webinar")) {
    return "Hi, thanks for your interest in Beforest. Please register for the collective webinar using the link shared earlier. If you cannot find it, reply here and we will help.";
  }
  if (templateName.includes("reschedule") || templateName.includes("notavailable") || templateName.includes("rebook")) {
    return "Hi, we could not complete the automated WhatsApp message. Please reply here and we will help you book a fresh Beforest 1-on-1 slot.";
  }
  if (templateName.includes("owner_attendance")) {
    return "Please check whether the scheduled 1-on-1 call was attended. Reply Attended or Not Attended in the owner check message if available.";
  }
  if (templateName.includes("1on1") || templateName.includes("reminder")) {
    return "Hi, quick reminder about your Beforest 1-on-1 call. Please check your calendar invite for timing and link, and reply here if you need help.";
  }
  return "Hi, we tried sending you a Beforest update on WhatsApp but it did not deliver. Please reply here and we will help you with the next step.";
}

async function failureNote(route: Record<string, unknown>) {
  const errorCode = asString(route.channel_error_code);
  const reason = asString(route.channel_failure_reason);
  const templateName = asString(route.template_name);
  const phone = displayPhone(route.phone, route.country_code);
  const manualMessage = await manualFallbackMessage(route);
  const lines = [
    "WhatsApp could not deliver this message.",
    errorCode || reason ? `Error: ${[errorCode, reason].filter(Boolean).join(" - ")}` : "",
    templateName ? `Template: ${templateName}` : "",
    phone ? `Phone: ${phone}` : "",
    "",
    "Manual action required: send the lead a normal WhatsApp message, then mark this task done.",
    "",
    "Copy this fallback message into WhatsApp Web:",
    `<pre>${escapeHtml(manualMessage)}</pre>`,
    "",
    "If the exact automated copy is needed, check the latest WhatsApp activity/note on this deal and include any booking or webinar link shown there.",
  ];
  return lines.map((line) => line ? `${line}<br>` : "<br>").join("").replace(/(<br>){3,}/g, "<br><br>");
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
    note: await failureNote(route),
  };

  if (dry_run) return { logged: false, dry_run: true, planned_activity: body };
  const activity = await pipedriveV1("POST", "activities", body);
  return {
    logged: true,
    activity_id: Number(activity?.id) || null,
  };
}

function shouldTryBrochureResolution(route: Record<string, unknown>) {
  return isNormalInboundMessage(route) && Boolean(asString(route.phone));
}

async function queueBrochureForInbound(route: Record<string, unknown>, dry_run: boolean, matchedDeal?: Record<string, unknown> | null) {
  if (!shouldTryBrochureResolution(route)) {
    return {
      status: "not_applicable",
      reason: "not_a_normal_inbound_message",
    };
  }
  const matchedDealId = asNumber(matchedDeal?.id);
  const args = {
    deal_id: asNumber(route.deal_id) || matchedDealId || 0,
    phone: asString(route.phone),
    collective_key: "",
    submitted_at: asString(route.event_timestamp || route.received_at),
    source: "whatsapp_redirect_inbound",
    dry_run,
  };
  if (dry_run) return { status: "would_queue", script_path: BROCHURE_FOLLOWUP_SCRIPT_PATH, args: { ...args, phone: args.phone ? `...${args.phone.replace(/\D/g, "").slice(-10)}` : "" } };
  try {
    const jobId = await wmill.runScriptByPathAsync(BROCHURE_FOLLOWUP_SCRIPT_PATH, args, 0);
    return { status: "queued", job_id: jobId, script_path: BROCHURE_FOLLOWUP_SCRIPT_PATH };
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : String(error), script_path: BROCHURE_FOLLOWUP_SCRIPT_PATH };
  }
}

async function handleBrochureRequestInbound(route: Record<string, unknown>, dry_run: boolean) {
  if (!isNormalInboundMessage(route) || !looksLikeBrochureRequestInbound(route)) {
    return { status: "not_applicable" };
  }

  const dealId = asNumber(route.deal_id);
  if (dealId) {
    return {
      status: dry_run ? "would_queue" : "queued",
      deal_id: dealId,
      match: { status: "deal_id_present" },
      brochure_resolution: await queueBrochureForInbound(route, dry_run),
    };
  }

  const match = await findUniqueRecentTypeformDeal(route);
  if (!match.matched || !match.deal) {
    return {
      status: "not_matched",
      reason: match.reason,
      candidates: match.candidates,
      fallback_task: await createRecentTypeformInboundTask(route, dry_run),
    };
  }

  const deal = match.deal as Record<string, unknown>;
  return {
    status: dry_run ? "would_queue" : "queued",
    deal_id: Number(deal.id),
    matched_deal_id: Number(deal.id),
    matched_deal_title: asString(deal.title),
    match: {
      status: "matched_recent_typeform_deal",
      reason: match.reason,
    },
    brochure_resolution: await queueBrochureForInbound(route, dry_run, deal),
  };
}

async function dealHasTypeformReceivedActivity(dealId: number) {
  const activities = await pipedriveV1("GET", `deals/${dealId}/activities?done=1&limit=20`).catch(() => []);
  return Array.isArray(activities) && activities.some((activity: any) => {
    const subject = asString(activity?.subject).toLowerCase();
    return subject === "typeform received" || subject === "post-brochure typeform submitted";
  });
}

async function findUniqueRecentTypeformDeal(route: Record<string, unknown>) {
  const receivedAt = routeTimestamp(route);
  const deals = await pipedriveV1("GET", "deals?status=open&limit=100&sort=add_time DESC").catch(() => []);
  const candidates = [];
  for (const deal of Array.isArray(deals) ? deals : []) {
    const addTime = parseUtcDate(deal?.add_time);
    if (!addTime) continue;
    const deltaMinutes = Math.abs(addTime.getTime() - receivedAt.getTime()) / 60000;
    if (deltaMinutes > RECENT_TYPEFORM_MATCH_WINDOW_MINUTES) continue;
    if (!(await dealHasTypeformReceivedActivity(Number(deal.id)))) continue;
    candidates.push({
      deal,
      delta_minutes: Number(deltaMinutes.toFixed(2)),
    });
  }

  candidates.sort((left, right) => left.delta_minutes - right.delta_minutes);
  return {
    matched: candidates.length === 1,
    reason: candidates.length === 0
      ? "no_recent_typeform_deal"
      : candidates.length > 1
        ? "multiple_recent_typeform_deals"
        : "unique_recent_typeform_deal",
    candidates: candidates.slice(0, 5).map(({ deal, delta_minutes }) => ({
      deal_id: Number(deal.id),
      title: asString(deal.title),
      pipeline_id: asNumber(deal.pipeline_id),
      owner_id: ownerIdFromDeal(deal),
      add_time: asString(deal.add_time),
      delta_minutes,
    })),
    deal: candidates.length === 1 ? candidates[0].deal : null,
  };
}

async function existingAlternateNumberTask(dealId: number, phone: string, message: string) {
  const [openActivities, doneActivities] = await Promise.all([
    pipedriveV1("GET", `deals/${dealId}/activities?done=0&limit=50`).catch(() => []),
    pipedriveV1("GET", `deals/${dealId}/activities?done=1&limit=50`).catch(() => []),
  ]);
  const activities = [
    ...(Array.isArray(openActivities) ? openActivities : []),
    ...(Array.isArray(doneActivities) ? doneActivities : []),
  ];
  const phoneDigits = phone.replace(/\D/g, "");
  const messageNeedle = asString(message).slice(0, 80);
  return activities.find((activity: any) => {
    if (asString(activity?.subject) !== "Reply to inbound WhatsApp from alternate number") return false;
    const note = asString(activity?.note || activity?.note_clean);
    return (phoneDigits && note.replace(/\D/g, "").includes(phoneDigits)) || (messageNeedle && note.includes(messageNeedle));
  }) || null;
}

async function createRecentTypeformInboundTask(route: Record<string, unknown>, dry_run: boolean) {
  if (!isNormalInboundMessage(route) || !looksLikePostTypeformInbound(route) || asNumber(route.deal_id)) {
    return { status: "not_applicable" };
  }

  const match = await findUniqueRecentTypeformDeal(route);
  if (!match.matched || !match.deal) {
    return {
      status: "not_matched",
      reason: match.reason,
      candidates: match.candidates,
    };
  }

  const deal = match.deal as Record<string, unknown>;
  const phone = displayPhone(route.phone, route.country_code);
  const message = asString(route.button_text || route.message || route.text || route.body);
  const existing = await existingAlternateNumberTask(Number(deal.id), phone || asString(route.phone), message);
  if (existing) {
    return {
      status: "already_logged",
      matched_deal_id: Number(deal.id),
      matched_deal_title: asString(deal.title),
      activity_id: Number(existing.id) || null,
    };
  }
  const customerName = asString(route.customer_name);
  const note = [
    "Inbound WhatsApp message could not be matched by phone, but was linked to the only recent Typeform-created deal.",
    "Please verify this is the same person before saving the WhatsApp number on the contact.",
    `Inbound phone: ${escapeHtml(phone || asString(route.phone))}`,
    customerName ? `Interakt customer name: ${escapeHtml(customerName)}` : "",
    `Received at: ${escapeHtml(asString(route.received_at || route.event_timestamp))}`,
    `Matched deal: ${escapeHtml(asString(deal.title))} (#${Number(deal.id)})`,
    `Match reason: ${escapeHtml(match.reason)}`,
    "",
    "<strong>Inbound message</strong>",
    `<pre>${escapeHtml(message)}</pre>`,
  ].filter(Boolean).join("<br>");
  const body = {
    deal_id: Number(deal.id),
    ...(personIdFromDeal(deal) ? { person_id: personIdFromDeal(deal) } : {}),
    user_id: ownerIdFromDeal(deal),
    subject: "Reply to inbound WhatsApp from alternate number",
    type: "task",
    done: 0,
    due_date: todayInTimezone("Asia/Kolkata"),
    note,
  };

  if (dry_run) {
    return {
      status: "would_create_task",
      matched_deal_id: Number(deal.id),
      matched_deal_title: asString(deal.title),
      planned_activity: body,
    };
  }
  const activity = await pipedriveV1("POST", "activities", body);
  return {
    status: "task_created",
    matched_deal_id: Number(deal.id),
    matched_deal_title: asString(deal.title),
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

  const brochureRequest = await handleBrochureRequestInbound(route, dry_run);
  if (brochureRequest.status !== "not_applicable") {
    const { status: brochureRequestStatus, ...brochureRequestDetails } = brochureRequest as Record<string, unknown>;
    return {
      handled: true,
      action: "ignored",
      deal_id: brochureRequest.deal_id ?? route?.deal_id ?? null,
      status: "brochure_request_received",
      brochure_request_status: brochureRequestStatus,
      inbound_reconciliation: {
        status: "not_applicable",
        reason: "brochure_request_routed_to_brochure_sender",
      },
      ...brochureRequestDetails,
      dry_run,
      button_text: route?.button_text ?? null,
    };
  }

  const inboundReconciliation = await createRecentTypeformInboundTask(route, dry_run);
  return {
    handled: true,
    action: "ignored",
    deal_id: route?.deal_id ?? null,
    status: "ignored_unrecognized_interakt_message",
    inbound_reconciliation: inboundReconciliation,
    brochure_resolution: inboundReconciliation.status === "would_create_task" || inboundReconciliation.status === "task_created"
      ? { status: "not_applicable", reason: "recent_typeform_inbound_reconciliation_handled" }
      : await queueBrochureForInbound(route, dry_run),
    dry_run,
    button_text: route?.button_text ?? null,
  };
}
