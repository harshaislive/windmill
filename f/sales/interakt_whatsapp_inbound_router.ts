type Action =
  | "reschedule_requested"
  | "attendance_confirmed"
  | "owner_attended"
  | "owner_not_attended"
  | "message_failed"
  | "ignored";

const ACTION_WORKERS: Record<Action, string> = {
  reschedule_requested: "f/sales/interakt_reschedule_requested_worker",
  attendance_confirmed: "f/sales/interakt_attendance_confirmed_worker",
  owner_attended: "f/sales/interakt_owner_attended_worker",
  owner_not_attended: "f/sales/interakt_owner_no_show_worker",
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
      normalized.includes("not attended")
    );
  }) ?? keyed[0] ?? null;
}

function inferAction(buttonText: string | null): Action {
  const normalized = normalizeText(buttonText);
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

function inferWebhookAction(payload: unknown, buttonText: string | null): Action {
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
  return inferAction(buttonText);
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

function findPhone(payload: unknown) {
  const value = collectStringsByKey(payload, PHONE_KEYS)[0];
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10 ? digits : value;
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
    received_at: values.received_at_utc || values.created_at || values.timestamp,
    delivered_at: values.delivered_at_utc,
    seen_at: values.seen_at_utc,
    deal_hint_title: values["Deal - Title"],
    deal_hint_stage: values["Deal - Stage"],
    deal_hint_status: values["Deal - Status"],
    deal_hint_pipeline: values["Deal - Pipeline"],
  };
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
  const action = inferWebhookAction(payload, buttonText);
  const context = findContext(payload);

  return {
    received: true,
    action,
    planned_worker: ACTION_WORKERS[action],
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
