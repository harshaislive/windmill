import * as wmill from "windmill-client";

type Action =
  | "reschedule_requested"
  | "attendance_confirmed"
  | "owner_attended"
  | "owner_not_attended"
  | "owner_touchbase_confirmed"
  | "owner_touchbase_pending"
  | "message_failed"
  | "ignored";

const ACTION_WORKERS: Record<Action, string> = {
  reschedule_requested: "f/sales/interakt_reschedule_requested_worker",
  attendance_confirmed: "f/sales/interakt_attendance_confirmed_worker",
  owner_attended: "f/sales/interakt_owner_attended_worker",
  owner_not_attended: "f/sales/interakt_owner_no_show_worker",
  owner_touchbase_confirmed: "f/sales/owner_touchbase/handle_owner_touchbase_response",
  owner_touchbase_pending: "f/sales/owner_touchbase/handle_owner_touchbase_response",
  message_failed: "f/sales/interakt_ignored_message_worker",
  ignored: "f/sales/interakt_ignored_message_worker",
};

const EXPLICIT_TEXT_KEYS = new Set([
  "button",
  "button_reply",
  "buttonReply",
  "button_text",
  "buttonText",
  "buttonTitle",
  "title",
  "text",
  "message",
  "body",
  "payload",
]);

const CALLBACK_KEYS = new Set([
  "callbackData",
  "callback_data",
  "callback",
  "payload",
  "buttonPayload",
  "button_payload",
]);

const PHONE_KEYS = new Set([
  "phone",
  "phoneNumber",
  "phone_number",
  "channel_phone_number",
  "fullPhoneNumber",
  "wa_id",
  "waId",
  "customerPhone",
]);

const CONTEXT_KEYS = new Set([
  "name",
  "email",
  "message_id",
  "id",
  "type",
  "message_status",
  "channel_error_code",
  "channel_failure_reason",
  "raw_template",
  "created_at",
  "timestamp",
  "received_at_utc",
  "delivered_at_utc",
  "seen_at_utc",
  "country_code",
  "Deal - Title",
  "Deal - Stage",
  "Deal - Status",
  "Deal - Pipeline",
]);

type AnalyticsContext = ReturnType<typeof findContext>;

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function unwrapPayload(body: unknown) {
  if (
    body &&
    typeof body === "object" &&
    "body" in body &&
    Object.keys(body as Record<string, unknown>).length <= 4
  ) {
    return (body as Record<string, unknown>).body;
  }
  return body;
}

function valueAtPath(value: unknown, path: string[]) {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[key];
  }
  return current ?? null;
}

function collectStringsByKey(
  value: unknown,
  keys: Set<string>,
  found: string[] = [],
  depth = 0,
) {
  if (depth > 8 || value == null) return found;
  if (typeof value !== "object") return found;

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (keys.has(key) && typeof child === "string" && child.trim()) {
      found.push(child.trim());
    }
    if (child && typeof child === "object") {
      collectStringsByKey(child, keys, found, depth + 1);
    }
  }
  return found;
}

function collectAllStrings(value: unknown, found: string[] = [], depth = 0) {
  if (depth > 8 || value == null) return found;
  if (typeof value === "string" && value.trim()) {
    found.push(value.trim());
    return found;
  }
  if (Array.isArray(value)) {
    for (const child of value) collectAllStrings(child, found, depth + 1);
    return found;
  }
  if (typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) {
      collectAllStrings(child, found, depth + 1);
    }
  }
  return found;
}

function firstMatchingText(payload: unknown) {
  const keyed = collectStringsByKey(payload, EXPLICIT_TEXT_KEYS);
  const all = collectAllStrings(payload);
  const candidates = [...keyed, ...all];

  return candidates.find((candidate) => {
    const normalized = normalizeText(candidate);
    return (
      normalized.includes("reschedule call") ||
      normalized.includes("rescehdule call") ||
      normalized.includes("confirm attendance") ||
      normalized.includes("attendance confirmed") ||
      normalized === "attended" ||
      normalized.includes("not attended") ||
      normalized.includes("yes touched base") ||
      normalized.includes("no pending") ||
      normalized.includes("touched base")
    );
  }) ?? keyed[0] ?? null;
}

function inferAction(buttonText: string | null, callbackData: string | null = null): Action {
  const normalized = normalizeText(buttonText);
  if (normalizeText(callbackData).includes("owner touchbase check")) {
    if (normalized.includes("no") || normalized.includes("pending")) return "owner_touchbase_pending";
    if (normalized.includes("yes") || normalized.includes("touched base")) return "owner_touchbase_confirmed";
    return "ignored";
  }
  if (
    normalized.includes("reschedule call") ||
    normalized.includes("rescehdule call") ||
    normalized === "reschedule"
  ) {
    return "reschedule_requested";
  }
  if (
    normalized.includes("confirm attendance") ||
    normalized.includes("attendance confirmed") ||
    normalized === "confirm"
  ) {
    return "attendance_confirmed";
  }
  if (normalized.includes("not attended") || normalized.includes("no show") || normalized.includes("noshow")) {
    return "owner_not_attended";
  }
  if (normalized === "attended" || normalized.includes(" attended")) {
    return "owner_attended";
  }
  return "ignored";
}

function webhookType(payload: unknown) {
  const direct = valueAtPath(payload, ["type"]);
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  return collectStringsByKey(payload, new Set(["type"]))[0] ?? null;
}

function parseTemplateName(rawTemplate: string | null) {
  if (!rawTemplate) return null;
  try {
    const parsed = JSON.parse(rawTemplate);
    return typeof parsed?.name === "string" ? parsed.name : null;
  } catch {
    return null;
  }
}

function parseRawTemplate(rawTemplate: string | null) {
  if (!rawTemplate) return null;
  try {
    return JSON.parse(rawTemplate);
  } catch {
    return null;
  }
}

function inferWebhookAction(payload: unknown, buttonText: string | null, callbackData: string | null): Action {
  const type = normalizeText(webhookType(payload));
  const messageStatus = normalizeText(String(valueAtPath(payload, ["data", "message", "message_status"]) ?? ""));
  const isInteraktStatusWebhook = type.startsWith("message api ") || type.startsWith("message campaign ");
  if (
    type === "message api failed" ||
    type === "message campaign failed" ||
    messageStatus === "failed"
  ) {
    return "message_failed";
  }
  if (isInteraktStatusWebhook) return "ignored";
  return inferAction(buttonText, callbackData);
}

function findCallbackData(payload: unknown) {
  return collectStringsByKey(payload, CALLBACK_KEYS).find((value) =>
    /pipedrive_deal:\d+|deal[_\s-]?id[:=]\s*\d+/i.test(value)
  ) ?? collectStringsByKey(payload, CALLBACK_KEYS)[0] ?? null;
}

function findDealId(payload: unknown, callbackData: string | null) {
  const serialized = [
    callbackData,
    ...collectStringsByKey(payload, new Set(["deal_id", "dealId", "deal"])),
    ...collectAllStrings(payload),
  ].filter(Boolean).join(" ");

  const match =
    serialized.match(/pipedrive_deal:(\d+)/i) ??
    serialized.match(/deal[_\s-]?id[:=]\s*(\d+)/i);

  return match?.[1] ? Number(match[1]) : null;
}

function canonicalPhone(rawPhone: unknown, rawCountryCode: unknown = "+91") {
  const value = String(rawPhone ?? "").trim();
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  if (digits.length === 10) {
    const countryDigits = String(rawCountryCode ?? "+91").replace(/\D/g, "") || "91";
    return `${countryDigits}${digits}`;
  }
  return digits.length >= 10 ? digits : value;
}

function findPhone(payload: unknown) {
  const customerChannelPhone = valueAtPath(payload, ["data", "customer", "channel_phone_number"]);
  const customerPhone = valueAtPath(payload, ["data", "customer", "phone_number"]);
  const customerCountryCode = valueAtPath(payload, ["data", "customer", "country_code"]);
  const explicitFull = collectStringsByKey(payload, new Set(["fullPhoneNumber", "wa_id", "waId", "channel_phone_number"]))[0];
  const localPhone = collectStringsByKey(payload, new Set(["phoneNumber", "phone_number", "phone", "customerPhone"]))[0];
  return (
    canonicalPhone(customerChannelPhone, customerCountryCode) ||
    canonicalPhone(explicitFull, customerCountryCode) ||
    canonicalPhone(customerPhone, customerCountryCode) ||
    canonicalPhone(localPhone, customerCountryCode)
  );
}

function findContext(payload: unknown) {
  const values = Object.fromEntries(
    [...CONTEXT_KEYS].map((key) => [key, collectStringsByKey(payload, new Set([key]))[0] ?? null]),
  );
  const messageId = valueAtPath(payload, ["data", "message", "id"]);
  const rawTemplate = valueAtPath(payload, ["data", "message", "raw_template"]);
  return {
    customer_name: values.name,
    customer_email: values.email,
    country_code: values.country_code,
    webhook_type: webhookType(payload),
    message_id: typeof messageId === "string" ? messageId : values.message_id || values.id,
    message_status: valueAtPath(payload, ["data", "message", "message_status"]) || values.message_status,
    channel_error_code: valueAtPath(payload, ["data", "message", "channel_error_code"]) || values.channel_error_code,
    channel_failure_reason: valueAtPath(payload, ["data", "message", "channel_failure_reason"]) || values.channel_failure_reason,
    template_name: parseTemplateName(typeof rawTemplate === "string" ? rawTemplate : values.raw_template),
    raw_template: typeof rawTemplate === "string" ? rawTemplate : values.raw_template,
    received_at: values.received_at_utc || values.created_at || values.timestamp,
    delivered_at: values.delivered_at_utc,
    seen_at: values.seen_at_utc,
    deal_hint_title: values["Deal - Title"],
    deal_hint_stage: values["Deal - Stage"],
    deal_hint_status: values["Deal - Status"],
    deal_hint_pipeline: values["Deal - Pipeline"],
  };
}

function templateCategory(rawTemplate: unknown) {
  const parsed = parseRawTemplate(typeof rawTemplate === "string" ? rawTemplate : null);
  return typeof parsed?.category === "string" ? parsed.category : null;
}

function campaignId(payload: unknown) {
  const value = valueAtPath(payload, ["data", "message", "campaign_id"]);
  return value == null ? null : String(value);
}

function campaignName(payload: unknown) {
  const value = valueAtPath(payload, ["data", "message", "campaign_name"]);
  return value == null ? null : String(value);
}

function customerId(payload: unknown) {
  const value = valueAtPath(payload, ["data", "customer", "id"]) || valueAtPath(payload, ["data", "message", "customer", "id"]);
  return value == null ? null : String(value);
}

function eventTimestamp(payload: unknown, context: AnalyticsContext) {
  return String(
    context.seen_at ||
      context.delivered_at ||
      context.received_at ||
      valueAtPath(payload, ["data", "message", "created_at"]) ||
      valueAtPath(payload, ["timestamp"]) ||
      new Date().toISOString(),
  );
}

function dateInTimezone(date = new Date(), timezone = "Asia/Kolkata") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

async function payloadHash(payload: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload ?? null));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function ensureInteraktAnalyticsTables() {
  const sql = wmill.datatable("main");
  await sql`
    CREATE TABLE IF NOT EXISTS interakt_inbound_webhook_raw_events (
      raw_event_id TEXT PRIMARY KEY,
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      event_timestamp TIMESTAMPTZ,
      event_date DATE NOT NULL DEFAULT ((NOW() AT TIME ZONE 'Asia/Kolkata')::DATE),
      source_path TEXT NOT NULL DEFAULT 'f/sales/interakt_whatsapp_inbound',
      webhook_type TEXT,
      action TEXT,
      planned_worker TEXT,
      message_status TEXT,
      message_id TEXT,
      campaign_id TEXT,
      campaign_name TEXT,
      template_name TEXT,
      category TEXT,
      customer_id TEXT,
      phone_number TEXT,
      callback_data TEXT,
      deal_id BIGINT,
      button_text TEXT,
      dry_run BOOLEAN NOT NULL DEFAULT FALSE,
      payload_sha256 TEXT NOT NULL,
      idempotency_key TEXT,
      headers JSONB NOT NULL DEFAULT '{}'::JSONB,
      query JSONB NOT NULL DEFAULT '{}'::JSONB,
      raw_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
      router_context JSONB NOT NULL DEFAULT '{}'::JSONB,
      source_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute();
  await sql`CREATE INDEX IF NOT EXISTS idx_interakt_raw_received_at ON interakt_inbound_webhook_raw_events (received_at DESC)`.execute();
  await sql`CREATE INDEX IF NOT EXISTS idx_interakt_raw_message_id ON interakt_inbound_webhook_raw_events (message_id)`.execute();
  await sql`CREATE INDEX IF NOT EXISTS idx_interakt_raw_deal_id ON interakt_inbound_webhook_raw_events (deal_id)`.execute();
  await sql`CREATE INDEX IF NOT EXISTS idx_interakt_raw_event_type ON interakt_inbound_webhook_raw_events (webhook_type, message_status, action)`.execute();
}

async function logIncomingWebhookEvent(args: {
  payload: unknown;
  headers: Record<string, string>;
  query: Record<string, string>;
  dryRun: boolean;
  action: Action;
  dealId: number | null;
  buttonText: string | null;
  callbackData: string | null;
  phone: string | null;
  context: AnalyticsContext;
}) {
  await ensureInteraktAnalyticsTables();
  const sql = wmill.datatable("main");
  const hash = await payloadHash(args.payload);
  const timestamp = eventTimestamp(args.payload, args.context);
  const parsedTimestamp = new Date(timestamp);
  const eventTimestampIso = Number.isNaN(parsedTimestamp.getTime()) ? new Date().toISOString() : parsedTimestamp.toISOString();
  const messageId = args.context.message_id ? String(args.context.message_id) : null;
  const idempotencyKey = [
    messageId || "no-message-id",
    args.context.webhook_type || "unknown",
    args.context.message_status || "no-status",
    eventTimestampIso,
    hash.slice(0, 16),
  ].join(":");
  const rawEventId = crypto.randomUUID();
  await sql`
    INSERT INTO interakt_inbound_webhook_raw_events (
      raw_event_id, received_at, event_timestamp, event_date, webhook_type, action, planned_worker,
      message_status, message_id, campaign_id, campaign_name, template_name, category, customer_id,
      phone_number, callback_data, deal_id, button_text, dry_run, payload_sha256, idempotency_key,
      headers, query, raw_payload, router_context, source_synced_at
    ) VALUES (
      ${rawEventId}, NOW(), ${eventTimestampIso}::TIMESTAMPTZ, (${eventTimestampIso}::TIMESTAMPTZ AT TIME ZONE 'Asia/Kolkata')::DATE,
      ${String(args.context.webhook_type || "")}, ${args.action}, ${ACTION_WORKERS[args.action]},
      ${args.context.message_status ? String(args.context.message_status) : null}, ${messageId}, ${campaignId(args.payload)}, ${campaignName(args.payload)},
      ${args.context.template_name ? String(args.context.template_name) : null}, ${templateCategory(args.context.raw_template)}, ${customerId(args.payload)},
      ${args.phone}, ${args.callbackData}, ${args.dealId}::BIGINT, ${args.buttonText}, ${args.dryRun}, ${hash}, ${idempotencyKey},
      ${args.headers || {}}, ${args.query || {}}, ${args.payload || {}}, ${args.context || {}}, NOW()
    )
  `.execute();
  return { raw_event_id: rawEventId, table: "main.interakt_inbound_webhook_raw_events", idempotency_key: idempotencyKey };
}

function summarizeShape(value: unknown, depth = 0): unknown {
  if (depth > 2 || value == null) return value == null ? value : typeof value;
  if (Array.isArray(value)) {
    return value.length ? [summarizeShape(value[0], depth + 1)] : [];
  }
  if (typeof value !== "object") return typeof value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      key,
      summarizeShape(child, depth + 1),
    ]),
  );
}

export async function main(
  body: unknown = null,
  headers: Record<string, string> = {},
  query: Record<string, string> = {},
  dry_run = false,
) {
  const payload = unwrapPayload(body);
  const buttonText = firstMatchingText(payload);
  const callbackData = findCallbackData(payload);
  const dealId = findDealId(payload, callbackData);
  const action = inferWebhookAction(payload, buttonText, callbackData);
  const context = findContext(payload);
  let analyticsLog: Record<string, unknown> | null = null;
  let analyticsLogError = "";
  if (!dry_run) {
    try {
      analyticsLog = await logIncomingWebhookEvent({
        payload,
        headers,
        query,
        dryRun: dry_run,
        action,
        dealId,
        buttonText,
        callbackData,
        phone: findPhone(payload),
        context,
      });
    } catch (error) {
      analyticsLogError = error instanceof Error ? error.message : String(error);
      console.warn("Interakt webhook analytics log skipped", analyticsLogError);
    }
  }

  return {
    received: true,
    action,
    planned_worker: ACTION_WORKERS[action],
    analytics_log: analyticsLog,
    analytics_log_error: analyticsLogError || null,
    deal_id: dealId,
    button_text: buttonText,
    callback_data: callbackData,
    phone: findPhone(payload),
    ...context,
    dry_run,
    header_keys: Object.keys(headers ?? {}),
    query,
    payload_shape: summarizeShape(payload),
  };
}
