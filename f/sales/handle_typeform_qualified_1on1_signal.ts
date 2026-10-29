import * as wmill from "windmill-client";

type TypeformAnswer = {
  type?: string;
  text?: string;
  email?: string;
  phone_number?: string;
  field?: { id?: string; ref?: string; type?: string };
};

type TypeformPayload = {
  event_id?: string;
  event_type?: string;
  form_response?: {
    form_id?: string;
    token?: string;
    landed_at?: string;
    submitted_at?: string;
    hidden?: Record<string, unknown>;
    answers?: TypeformAnswer[];
    definition?: { id?: string; title?: string };
  };
};

type EmbedSignalPayload = {
  signal_type?: string;
  form_id?: string;
  response_id?: string;
  question_ref?: string;
  event_time?: number | string;
  event_source_url?: string;
  fbp?: string;
  fbc?: string;
  fbclid?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
};

type HttpEvent = {
  kind?: string;
  body?: unknown;
  raw_string?: string | null;
  headers?: Record<string, string | string[] | undefined>;
  args?: Record<string, unknown>;
  [key: string]: unknown;
};

type FormRule = {
  collective: string;
  qualifiedQuestionRef: string;
};

type QualificationResult = {
  supported: boolean;
  qualified: boolean;
  consented: boolean;
  complete: boolean;
  source: "embed" | "completed" | "unknown";
  collective: string;
  ruleVersion: string;
  reason: string;
};

type SignalContext = {
  source: "embed" | "completed";
  formId: string;
  responseId: string;
  collective: string;
  ruleVersion: string;
  eventTime: number;
  eventSourceUrl: string;
  attribution: Record<string, string>;
  answers: TypeformAnswer[];
  consented: boolean;
};

type Evaluation = {
  qualification: QualificationResult;
  signal?: SignalContext;
};

type MetaConfig = {
  datasetId: string;
  accessToken: string;
  graphApiVersion: string;
  testEventCode?: string;
};

const EVENT_NAME = "Qualified1on1AnswerSignal";
const EMBED_SIGNAL_TYPE = "typeform_embed_question_reached";
const QUALIFICATION_RULE_VERSION = "typeform-primary-1on1-destination-v2-2026-08-06";
const META_MAX_ATTEMPTS = 3;
const META_RATE_LIMIT_PER_MINUTE = 60;
const META_RATE_LIMIT_PER_HOUR = 500;

const META_VARIABLE_PATHS = {
  datasetId: "f/sales/qualified_1on1_meta_capi/dataset_id",
  accessToken: "f/sales/qualified_1on1_meta_capi/access_token",
  graphApiVersion: "f/facebook_ads_dashboard/META_GRAPH_VERSION",
  testEventCode: "f/sales/qualified_1on1_meta_capi/test_event_code",
};

const IDENTITY_REFS = {
  firstName: "3e323431-52c9-4a01-8cb2-299b3eaf8d04",
  lastName: "9a863162-3c92-4594-8c1f-c6156192da2c",
  phone: "1e1c9b87-0f9f-4e42-9852-f62aa18f482d",
  email: "74689ad2-2837-473c-a3d5-52d28f90de51",
};

const FORM_RULES: Record<string, FormRule> = {
  CYae8hmZ: {
    collective: "Bhopal",
    qualifiedQuestionRef: "113a9ad4-4d43-4165-9bf7-62f82b1352ab",
  },
  kfcjiXxR: {
    collective: "Mumbai",
    qualifiedQuestionRef: "1292d853-e1d7-438a-8f82-70fbad90e914",
  },
  hbDB2ybS: {
    collective: "Hammiyala",
    qualifiedQuestionRef: "f8e95240-2bd9-4522-8eac-53860c400950",
  },
  i8eBLQkz: {
    collective: "Poomaale 2.0",
    qualifiedQuestionRef: "4c30971d-c15d-42f8-90d1-94c19a475c4d",
  },
  leXyUOuT: {
    collective: "Hyderabad",
    qualifiedQuestionRef: "113a9ad4-4d43-4165-9bf7-62f82b1352ab",
  },
};

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseJsonBody(value: unknown): unknown {
  if (typeof value !== "string") return value || {};
  const jsonStart = value.indexOf("{");
  if (jsonStart === -1) throw new Error("Request body does not contain JSON.");
  return JSON.parse(value.slice(jsonStart));
}

function unwrapBody(body: unknown): TypeformPayload | EmbedSignalPayload {
  const parsed = parseJsonBody(body);
  if (parsed && typeof parsed === "object" && "body" in parsed) {
    const wrapped = parsed as { body?: unknown };
    return parseJsonBody(wrapped.body) as TypeformPayload | EmbedSignalPayload;
  }
  return (parsed || {}) as TypeformPayload | EmbedSignalPayload;
}

function lowerCaseHeaders(headers: HttpEvent["headers"]): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers || {})) {
    normalized[key.toLowerCase()] = Array.isArray(value) ? asString(value[0]) : asString(value);
  }
  return normalized;
}

export async function preprocessor(event: HttpEvent) {
  if (!event?.kind || event.kind === "http") {
    const headers = lowerCaseHeaders(event?.headers);
    return {
      body: parseJsonBody(event?.raw_string || event?.body || {}),
      request_origin: headers.origin || "",
      dry_run: false,
      use_test_event: false,
    };
  }

  // Windmill also invokes preprocessors for authenticated internal script runs.
  // Those arguments may be nested under `args` or `body`, depending on the runner.
  // Only the public HTTP transport is allowed to derive trust from Origin headers.
  const eventRecord = event as Record<string, unknown>;
  const nestedBody = event.body && typeof event.body === "object"
    ? event.body as Record<string, unknown>
    : {};
  const candidates = [event.args || {}, nestedBody, eventRecord];
  const directArgs = candidates.find((candidate) =>
    "dry_run" in candidate ||
    "use_test_event" in candidate ||
    "request_origin" in candidate ||
    ("body" in candidate && candidate.body !== event.body)
  ) || eventRecord;

  return {
    body: directArgs.body ?? {},
    request_origin: asString(directArgs.request_origin),
    dry_run: directArgs.dry_run === true,
    use_test_event: directArgs.use_test_event === true,
  };
}

function beforestHttpsUrl(value: unknown): string {
  const raw = asString(value);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (url.protocol !== "https:") return "";
    if (host !== "beforest.co" && !host.endsWith(".beforest.co")) return "";
    return url.toString();
  } catch {
    return "";
  }
}

export function isAllowedBeforestOrigin(origin: unknown): boolean {
  return Boolean(beforestHttpsUrl(origin));
}

function safeValue(value: unknown, maxLength = 512): string {
  return asString(value).slice(0, maxLength);
}

function validResponseId(value: unknown): string {
  const responseId = asString(value);
  return /^[A-Za-z0-9_-]{10,128}$/.test(responseId) ? responseId : "";
}

function safeEventTime(value: unknown): number {
  const now = Math.floor(Date.now() / 1000);
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return now;
  const seconds = parsed > 10_000_000_000 ? Math.floor(parsed / 1000) : Math.floor(parsed);
  if (seconds < now - 7 * 24 * 60 * 60 || seconds > now + 5 * 60) return now;
  return seconds;
}

function timestampFromTypeform(response: TypeformPayload["form_response"]): number {
  const parsed = Date.parse(asString(response?.submitted_at || response?.landed_at));
  return safeEventTime(Number.isFinite(parsed) ? Math.floor(parsed / 1000) : undefined);
}

function attributionFromEmbed(payload: EmbedSignalPayload): Record<string, string> {
  const attribution: Record<string, string> = {};
  for (const key of [...UTM_KEYS, "fbp", "fbc", "fbclid"] as const) {
    const value = safeValue(payload[key]);
    if (value) attribution[key] = value;
  }
  return attribution;
}

function attributionFromHidden(hidden: Record<string, unknown>): Record<string, string> {
  const attribution: Record<string, string> = {};
  for (const key of [...UTM_KEYS, "fbp", "fbc", "fbclid"] as const) {
    const value = safeValue(hidden[key]);
    if (value) attribution[key] = value;
  }
  return attribution;
}

function qualification(
  source: QualificationResult["source"],
  rule: FormRule | undefined,
  qualified: boolean,
  complete: boolean,
  reason: string,
): QualificationResult {
  return {
    supported: Boolean(rule),
    qualified,
    consented: qualified,
    complete,
    source,
    collective: rule?.collective || "",
    ruleVersion: QUALIFICATION_RULE_VERSION,
    reason,
  };
}

function evaluateEmbed(payload: EmbedSignalPayload, requestOrigin: string): Evaluation {
  if (asString(payload.signal_type) !== EMBED_SIGNAL_TYPE) {
    return { qualification: qualification("unknown", undefined, false, false, "unsupported_signal_type") };
  }
  if (!isAllowedBeforestOrigin(requestOrigin)) {
    return { qualification: qualification("embed", undefined, false, false, "untrusted_request_origin") };
  }
  const formId = asString(payload.form_id);
  const rule = FORM_RULES[formId];
  if (!rule) return { qualification: qualification("embed", undefined, false, false, "unsupported_form") };
  if (asString(payload.question_ref) !== rule.qualifiedQuestionRef) {
    return {
      qualification: qualification("embed", rule, false, true, "question_is_not_qualified_1on1_destination"),
    };
  }
  const responseId = validResponseId(payload.response_id);
  if (!responseId) {
    return { qualification: qualification("embed", rule, false, false, "invalid_or_missing_response_id") };
  }
  const sourceUrl = beforestHttpsUrl(payload.event_source_url);
  if (!sourceUrl) {
    return { qualification: qualification("embed", rule, false, false, "invalid_or_missing_beforest_source_url") };
  }
  return {
    qualification: qualification("embed", rule, true, true, "reached_existing_typeform_1on1_destination"),
    signal: {
      source: "embed",
      formId,
      responseId,
      collective: rule.collective,
      ruleVersion: QUALIFICATION_RULE_VERSION,
      eventTime: safeEventTime(payload.event_time),
      eventSourceUrl: sourceUrl,
      attribution: attributionFromEmbed(payload),
      answers: [],
      consented: true,
    },
  };
}

function evaluateCompleted(payload: TypeformPayload): Evaluation {
  const eventType = asString(payload.event_type);
  if (eventType === "form_response_partial") {
    return {
      qualification: qualification("unknown", undefined, false, false, "partial_transport_disabled"),
    };
  }
  if (eventType !== "form_response") {
    return { qualification: qualification("unknown", undefined, false, false, "unsupported_event_type") };
  }
  const response = payload.form_response || {};
  const formId = asString(response.form_id || response.definition?.id);
  const rule = FORM_RULES[formId];
  if (!rule) return { qualification: qualification("completed", undefined, false, false, "unsupported_form") };
  const answers = response.answers || [];
  const reachedQualifiedDestination = answers.some(
    (answer) => asString(answer.field?.ref) === rule.qualifiedQuestionRef,
  );
  if (!reachedQualifiedDestination) {
    return {
      qualification: qualification(
        "completed",
        rule,
        false,
        true,
        "qualified_1on1_destination_not_present_in_completed_response",
      ),
    };
  }
  const responseId = validResponseId(response.token);
  if (!responseId) {
    return { qualification: qualification("completed", rule, false, false, "invalid_or_missing_response_id") };
  }
  const hidden = response.hidden || {};
  const sourceUrl = beforestHttpsUrl(
    hidden.event_source_url || hidden.page_url || hidden.current_page,
  );
  return {
    qualification: qualification("completed", rule, true, true, "completed_response_contains_1on1_destination"),
    signal: {
      source: "completed",
      formId,
      responseId,
      collective: rule.collective,
      ruleVersion: QUALIFICATION_RULE_VERSION,
      eventTime: timestampFromTypeform(response),
      eventSourceUrl: sourceUrl,
      attribution: attributionFromHidden(hidden),
      answers,
      consented: true,
    },
  };
}

function evaluate(body: TypeformPayload | EmbedSignalPayload, requestOrigin: string): Evaluation {
  if ("signal_type" in body) return evaluateEmbed(body as EmbedSignalPayload, requestOrigin);
  return evaluateCompleted(body as TypeformPayload);
}

function answerValue(answer: TypeformAnswer | undefined): string {
  if (!answer) return "";
  if (answer.type === "email") return asString(answer.email);
  if (answer.type === "phone_number") return asString(answer.phone_number);
  return asString(answer.text);
}

function findAnswer(answers: TypeformAnswer[], ref: string): TypeformAnswer | undefined {
  return answers.find((answer) => asString(answer.field?.ref) === ref);
}

function normalizeEmail(value: unknown): string {
  return asString(value).toLowerCase();
}

function normalizePhone(value: unknown): string {
  return asString(value).replace(/\D+/g, "");
}

function normalizeName(value: unknown): string {
  return asString(value).toLowerCase().replace(/\s+/g, " ");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function stableEventId(formId: string, responseId: string): Promise<string> {
  return sha256(`${EVENT_NAME}|${QUALIFICATION_RULE_VERSION}|${formId}|${responseId}`);
}

function deriveFbc(attribution: Record<string, string>, eventTime: number): string {
  if (attribution.fbc) return attribution.fbc;
  if (!attribution.fbclid) return "";
  return `fb.1.${eventTime * 1000}.${attribution.fbclid}`;
}

async function buildMetaEvent(signal: SignalContext) {
  const userData: Record<string, unknown> = {};
  if (signal.consented && signal.source === "completed") {
    const email = normalizeEmail(answerValue(findAnswer(signal.answers, IDENTITY_REFS.email)));
    const phone = normalizePhone(answerValue(findAnswer(signal.answers, IDENTITY_REFS.phone)));
    const firstName = normalizeName(answerValue(findAnswer(signal.answers, IDENTITY_REFS.firstName)));
    const lastName = normalizeName(answerValue(findAnswer(signal.answers, IDENTITY_REFS.lastName)));
    if (email) userData.em = [await sha256(email)];
    if (phone) userData.ph = [await sha256(phone)];
    if (firstName) userData.fn = [await sha256(firstName)];
    if (lastName) userData.ln = [await sha256(lastName)];
  }
  if (signal.attribution.fbp) userData.fbp = signal.attribution.fbp;
  const fbc = deriveFbc(signal.attribution, signal.eventTime);
  if (fbc) userData.fbc = fbc;

  const customData: Record<string, string> = {
    collective: signal.collective,
    qualification_rule_version: signal.ruleVersion,
  };
  for (const key of UTM_KEYS) {
    if (signal.attribution[key]) customData[key] = signal.attribution[key];
  }

  return {
    event_name: EVENT_NAME,
    event_time: signal.eventTime,
    event_id: await stableEventId(signal.formId, signal.responseId),
    action_source: "website",
    ...(signal.eventSourceUrl ? { event_source_url: signal.eventSourceUrl } : {}),
    user_data: userData,
    custom_data: customData,
  };
}

async function optionalVariable(path: string): Promise<string> {
  return asString(await wmill.getVariable(path).catch(() => ""));
}

async function loadMetaConfig(useTestEvent: boolean): Promise<MetaConfig> {
  const [datasetId, accessToken, graphApiVersion, testEventCode] = await Promise.all([
    optionalVariable(META_VARIABLE_PATHS.datasetId),
    optionalVariable(META_VARIABLE_PATHS.accessToken),
    optionalVariable(META_VARIABLE_PATHS.graphApiVersion),
    optionalVariable(META_VARIABLE_PATHS.testEventCode),
  ]);
  if (!datasetId) throw new Error(`Missing encrypted Windmill variable: ${META_VARIABLE_PATHS.datasetId}`);
  if (!accessToken) throw new Error(`Missing encrypted Windmill variable: ${META_VARIABLE_PATHS.accessToken}`);
  if (!/^v\d+\.\d+$/.test(graphApiVersion)) {
    throw new Error(`Missing or invalid Graph API version variable: ${META_VARIABLE_PATHS.graphApiVersion}`);
  }
  if (useTestEvent && !testEventCode) {
    throw new Error(`Test Event mode requested but ${META_VARIABLE_PATHS.testEventCode} is missing.`);
  }
  return {
    datasetId,
    accessToken,
    graphApiVersion,
    ...(useTestEvent ? { testEventCode } : {}),
  };
}

async function enforceRateLimit(): Promise<void> {
  const sql = wmill.datatable();
  const counts = await sql.query(
    `
      SELECT
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 minute')::int AS minute_count,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 hour')::int AS hour_count
      FROM sales_automation.meta_capi_signal_dedupe
    `,
  ).fetchOne();
  if (Number(counts?.minute_count || 0) >= META_RATE_LIMIT_PER_MINUTE) {
    throw new Error("Qualified signal rate limit exceeded for the last minute.");
  }
  if (Number(counts?.hour_count || 0) >= META_RATE_LIMIT_PER_HOUR) {
    throw new Error("Qualified signal rate limit exceeded for the last hour.");
  }
}

async function claimEvent(eventId: string, source: SignalContext["source"], formId: string): Promise<{
  claimed: boolean;
  reason?: string;
}> {
  await enforceRateLimit();
  const sql = wmill.datatable();
  const claimed = await sql.query(
    `
      INSERT INTO sales_automation.meta_capi_signal_dedupe
        (event_id, source, form_id, status, attempt_count, created_at, updated_at)
      VALUES ($1, $2, $3, 'pending', 1, NOW(), NOW())
      ON CONFLICT (event_id) DO UPDATE
      SET source = EXCLUDED.source,
          form_id = EXCLUDED.form_id,
          status = 'pending',
          attempt_count = sales_automation.meta_capi_signal_dedupe.attempt_count + 1,
          updated_at = NOW(),
          meta_http_status = NULL
      WHERE sales_automation.meta_capi_signal_dedupe.status = 'failed'
         OR (
           sales_automation.meta_capi_signal_dedupe.status = 'pending'
           AND sales_automation.meta_capi_signal_dedupe.updated_at < NOW() - INTERVAL '5 minutes'
         )
      RETURNING event_id, status
    `,
    eventId,
    source,
    formId,
  ).fetchOne();
  if (claimed) return { claimed: true };

  const existing = await sql.query(
    `SELECT status FROM sales_automation.meta_capi_signal_dedupe WHERE event_id = $1`,
    eventId,
  ).fetchOne();
  return {
    claimed: false,
    reason: existing?.status === "sent" ? "already_sent" : "delivery_in_progress",
  };
}

async function updateClaim(eventId: string, status: "sent" | "failed", httpStatus?: number): Promise<void> {
  const sql = wmill.datatable();
  if (httpStatus === undefined) {
    await sql.query(
      `
        UPDATE sales_automation.meta_capi_signal_dedupe
        SET status = $2,
            meta_http_status = NULL,
            updated_at = NOW()
        WHERE event_id = $1
      `,
      eventId,
      status,
    ).execute();
    return;
  }
  await sql.query(
    `
      UPDATE sales_automation.meta_capi_signal_dedupe
      SET status = $2,
          meta_http_status = $3,
          updated_at = NOW()
      WHERE event_id = $1
    `,
    eventId,
    status,
    httpStatus,
  ).execute();
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendToMeta(config: MetaConfig, event: Record<string, unknown>) {
  const url = `https://graph.facebook.com/${config.graphApiVersion}/${encodeURIComponent(config.datasetId)}/events`;
  const payload = {
    data: [event],
    ...(config.testEventCode ? { test_event_code: config.testEventCode } : {}),
  };
  let lastStatus = 0;
  for (let attempt = 1; attempt <= META_MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      lastStatus = response.status;
      const responseBody = await response.json().catch(() => ({}));
      if (response.ok) {
        const eventsReceived = Number(responseBody?.events_received) || 0;
        if (eventsReceived < 1) throw new Error("Meta CAPI returned success without acknowledging an event.");
        return {
          httpStatus: response.status,
          eventsReceived,
          traceId: asString(responseBody?.fbtrace_id),
          attempt,
        };
      }
      if (!retryableStatus(response.status) || attempt === META_MAX_ATTEMPTS) {
        throw new Error(`Meta CAPI request failed with HTTP ${response.status}.`);
      }
    } catch (error) {
      if (attempt === META_MAX_ATTEMPTS || (lastStatus > 0 && !retryableStatus(lastStatus))) throw error;
    }
    const baseDelay = Number(process.env.META_CAPI_RETRY_BASE_DELAY_MS || "500");
    await sleep(Math.max(0, baseDelay) * 2 ** (attempt - 1));
  }
  throw new Error(`Meta CAPI request failed with HTTP ${lastStatus || "network_error"}.`);
}

function safePreview(event: Record<string, any>) {
  return {
    event_name: event.event_name,
    event_time: event.event_time,
    event_id: event.event_id,
    action_source: event.action_source,
    event_source_url_present: Boolean(event.event_source_url),
    user_data_keys: Object.keys(event.user_data || {}).sort(),
    custom_data: event.custom_data,
  };
}

export async function main(
  body: unknown,
  request_origin = "",
  dry_run = false,
  use_test_event = false,
) {
  const incoming = unwrapBody(body);
  const evaluation = evaluate(incoming, request_origin);
  const { qualification: result, signal } = evaluation;
  if (!result.supported || !result.complete || !result.qualified || !signal) {
    return {
      status: "ignored",
      qualification: {
        source: result.source,
        supported: result.supported,
        qualified: result.qualified,
        consented: result.consented,
        complete: result.complete,
        collective: result.collective,
        rule_version: result.ruleVersion,
        reason: result.reason,
      },
    };
  }

  const event = await buildMetaEvent(signal);
  if (dry_run) {
    return {
      status: "dry_run",
      qualification: {
        source: result.source,
        qualified: true,
        consented: true,
        collective: result.collective,
        rule_version: result.ruleVersion,
      },
      meta_event_preview: safePreview(event),
      test_event_requested: use_test_event,
    };
  }

  const claim = await claimEvent(asString(event.event_id), signal.source, signal.formId);
  if (!claim.claimed) {
    return {
      status: "duplicate_ignored",
      reason: claim.reason,
      event_name: EVENT_NAME,
      event_id: event.event_id,
      collective: result.collective,
      rule_version: result.ruleVersion,
    };
  }

  try {
    const config = await loadMetaConfig(use_test_event);
    const delivery = await sendToMeta(config, event);
    await updateClaim(asString(event.event_id), "sent", delivery.httpStatus);
    console.log(
      JSON.stringify({
        event: EVENT_NAME,
        status: "sent",
        source: signal.source,
        collective: result.collective,
        rule_version: result.ruleVersion,
        http_status: delivery.httpStatus,
        events_received: delivery.eventsReceived,
        attempt: delivery.attempt,
        test_event: Boolean(config.testEventCode),
      }),
    );
    return {
      status: "sent",
      event_name: EVENT_NAME,
      event_id: event.event_id,
      source: signal.source,
      collective: result.collective,
      rule_version: result.ruleVersion,
      delivery,
      test_event: Boolean(config.testEventCode),
    };
  } catch (error) {
    await updateClaim(asString(event.event_id), "failed").catch(() => undefined);
    console.error(
      JSON.stringify({
        event: EVENT_NAME,
        status: "failed",
        source: signal.source,
        collective: result.collective,
        rule_version: result.ruleVersion,
        error_type: error instanceof Error ? error.name : "Error",
      }),
    );
    throw error;
  }
}
