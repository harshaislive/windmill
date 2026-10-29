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
const INTERAKT_API_KEY_PATH = "f/sales/calendar_prebook_1on1/interakt_api_key";
const INTERAKT_BASE_URL_PATH = "f/sales/calendar_prebook_1on1/interakt_base_url";
const DEFAULT_PIPEDRIVE_DOMAIN = "beforest";
const DEFAULT_TIMEZONE = "Asia/Kolkata";
const IST_OFFSET_MINUTES = 330;
const TEMPLATE_NAME = "beforest_owner_daily_sales_digest_v1";
const TEMPLATE_ID = "1482141860060791";

const OWNER_IDS = {
  Vivek: 22251956,
  Rakesh: 13490118,
};

const RECIPIENTS = [
  {
    key: "vivek",
    name: "Vivek",
    phone: "916396252216",
    ownerIds: [OWNER_IDS.Vivek],
    scopeLabel: "Vivek",
  },
  {
    key: "rakesh",
    name: "Rakesh",
    phone: "918527494761",
    ownerIds: [OWNER_IDS.Rakesh],
    scopeLabel: "Rakesh",
  },
  {
    key: "sai_rakesh",
    name: "Sai Rakesh",
    phone: "918919151882",
    ownerIds: [OWNER_IDS.Rakesh],
    scopeLabel: "Rakesh",
    mirrorOf: "rakesh",
  },
] as const;

type RecipientKey = (typeof RECIPIENTS)[number]["key"];

type Deal = {
  id: number;
  title: string;
  add_time?: string;
  update_time?: string;
  next_activity_date?: string;
  next_activity_time?: string;
  status?: string;
  label?: unknown;
  label_ids?: Array<number | string>;
  labels?: Array<{ id?: number | string } | number | string>;
  owner_id?: number | { id?: number; name?: string; email?: string };
  user_id?: number | { id?: number; name?: string; email?: string; value?: number };
  stage_id?: number | string;
  pipeline_id?: number | string | { id?: number | string };
  custom_fields?: Record<string, unknown>;
  [key: string]: unknown;
};

type InteraktRecipient = {
  countryCode?: string;
  phoneNumber?: string;
  fullPhoneNumber?: string;
};

type DigestPlan = {
  recipient_key: RecipientKey;
  recipient_name: string;
  phone: string;
  window_start: string;
  window_end: string;
  window_label: string;
  deal_count: number;
  body_values: string[];
  preview: {
    summary: string;
    collective_breakdown: string;
    activity_health: string;
  };
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
  return payload;
}

function parsePipedriveDate(raw: unknown): Date | null {
  const text = asString(raw);
  if (!text) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(text) ? `${text.replace(" ", "T")}Z` : text;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function zonedParts(date: Date) {
  const shifted = new Date(date.getTime() + IST_OFFSET_MINUTES * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

function istDateTimeToUtc(year: number, month: number, day: number, hour: number, minute = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0) - IST_OFFSET_MINUTES * 60_000);
}

function defaultWindow(now: Date) {
  const parts = zonedParts(now);
  let end = istDateTimeToUtc(parts.year, parts.month, parts.day, 18, 0);
  if (now.getTime() < end.getTime()) end = new Date(end.getTime() - 24 * 60 * 60_000);
  return {
    start: new Date(end.getTime() - 24 * 60 * 60_000),
    end,
  };
}

function formatDateTimeIst(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: DEFAULT_TIMEZONE,
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date).replace(",", "");
}

function formatDateIst(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: DEFAULT_TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
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

function ownerId(deal: Deal): number | null {
  if (typeof deal.owner_id === "number") return deal.owner_id;
  if (deal.owner_id && typeof deal.owner_id === "object") return Number(deal.owner_id.id) || null;
  if (typeof deal.user_id === "number") return deal.user_id;
  if (deal.user_id && typeof deal.user_id === "object") return Number(deal.user_id.id || deal.user_id.value) || null;
  return null;
}

function interaktRecipient(rawPhone: string): InteraktRecipient {
  const digits = asString(rawPhone).replace(/\D/g, "");
  if (!digits) return {};
  if (digits.length === 10) return { countryCode: "+91", phoneNumber: digits };
  if (digits.length === 12 && digits.startsWith("91")) return { fullPhoneNumber: digits };
  return { fullPhoneNumber: digits };
}

function cleanTemplateValue(value: string, maxLength = 900): string {
  const clean = asString(value).replace(/[\r\n\t]+/g, "; ").replace(/ {3,}/g, "  ").trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 3)}...` : clean;
}

const PIPELINE_COLLECTIVES: Record<number, string> = {
  1: "Hammiyala",
  2: "Mumbai",
  3: "Poomaale",
  4: "Bhopal",
};

const LEAD_IN_STAGE_IDS = new Set([10, 13, 20, 37]);
const INITIAL_EVENT_SCHEDULED_STAGE_IDS = new Set([1, 14, 21, 30]);
const FAILED_WHATSAPP_SUBJECTS = new Set([
  "WhatsApp failed - send manually",
  "WhatsApp failed to deliver",
]);

function pipelineId(deal: Deal): number | null {
  const raw = deal.pipeline_id;
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") return Number(raw) || null;
  if (raw && typeof raw === "object") return Number(raw.id) || null;
  return null;
}

function stageId(deal: Deal): number | null {
  const value = Number(deal.stage_id);
  return Number.isFinite(value) ? value : null;
}

function buildSummary(deals: Deal[], scopeLabel: string): string {
  let webinar = 0;
  let oneOnOne = 0;
  for (const deal of deals) {
    const ids = labelIds(deal);
    if (ids.some((id) => [110, 111].includes(id))) {
      webinar += 1;
    } else if (ids.some((id) => [105, 106, 107, 108, 115].includes(id))) {
      oneOnOne += 1;
    }
  }
  const other = Math.max(0, deals.length - oneOnOne - webinar);

  const parts = [
    `${scopeLabel}: new ${deals.length}`,
    `1on1 ${oneOnOne}`,
    `webinar ${webinar}`,
  ];
  if (other) parts.push(`other ${other}`);
  return parts.join(" | ");
}

function buildCollectiveBreakdown(deals: Deal[]): string {
  const counts = new Map<string, number>();
  for (const deal of deals) {
    const collective = PIPELINE_COLLECTIVES[pipelineId(deal) || 0] || "Other";
    counts.set(collective, (counts.get(collective) || 0) + 1);
  }
  const parts = ["Bhopal", "Mumbai", "Hammiyala", "Poomaale", "Other"]
    .map((name) => [name, counts.get(name) || 0] as const)
    .filter(([name, count]) => count > 0 || name !== "Other");
  return `Collectives: ${parts.map(([name, count]) => `${name} ${count}`).join(" | ")}`;
}

function stageCounts(deals: Deal[]) {
  let leadIn = 0;
  let initialEventScheduled = 0;
  for (const deal of deals) {
    const id = stageId(deal);
    if (id !== null && LEAD_IN_STAGE_IDS.has(id)) {
      leadIn += 1;
    } else if (id !== null && INITIAL_EVENT_SCHEDULED_STAGE_IDS.has(id)) {
      initialEventScheduled += 1;
    }
  }
  return {
    lead_in: leadIn,
    initial_event_scheduled: initialEventScheduled,
    other: Math.max(0, deals.length - leadIn - initialEventScheduled),
  };
}

function buildStageBreakdown(deals: Deal[]): string {
  const counts = stageCounts(deals);
  const parts = [
    `Lead-In ${counts.lead_in}`,
    `Initial Event Scheduled ${counts.initial_event_scheduled}`,
  ];
  if (counts.other) parts.push(`other ${counts.other}`);
  return `Stages: ${parts.join(" | ")}`;
}

function formatIsoDateIst(date: Date): string {
  const parts = zonedParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function buildActivityHealth(deals: Deal[], now: Date): string {
  const today = formatIsoDateIst(now);
  let todayCount = 0;
  let overdueCount = 0;
  let noActivityCount = 0;

  for (const deal of deals) {
    const nextActivityDate = asString(deal.next_activity_date);
    if (!nextActivityDate) {
      noActivityCount += 1;
    } else if (nextActivityDate < today) {
      overdueCount += 1;
    } else if (nextActivityDate === today) {
      todayCount += 1;
    }
  }

  return `Activities: today ${todayCount} | overdue ${overdueCount} | no activity ${noActivityCount}`;
}

function buildNextAction(openDeals: Deal[], failedWhatsAppCount: number, now: Date): string {
  const counts = stageCounts(openDeals);
  return [
    buildActivityHealth(openDeals, now),
    `Open stages: Lead-In ${counts.lead_in} | Initial Event Scheduled ${counts.initial_event_scheduled}`,
    `Next: attend Initial Event Scheduled ${counts.initial_event_scheduled} immediately; close failed WhatsApp ${failedWhatsAppCount}`,
  ].join(" | ");
}

async function listDealsReceived(start: Date, end: Date, maxDeals: number): Promise<Deal[]> {
  const statuses = ["all_not_deleted", "open"];
  let lastError: unknown = null;

  for (const status of statuses) {
    try {
      const deals: Deal[] = [];
      let startOffset = 0;
      while (deals.length < maxDeals) {
        const payload = await pipedriveV1("GET", "deals", undefined, {
          status,
          start: startOffset,
          limit: Math.min(500, maxDeals - deals.length),
          sort: "add_time DESC",
        });
        const page = Array.isArray(payload.data) ? (payload.data as Deal[]) : [];
        for (const deal of page) {
          const addedAt = parsePipedriveDate(deal.add_time);
          if (addedAt && addedAt >= start && addedAt < end) deals.push(deal);
        }
        const oldest = page.map((deal) => parsePipedriveDate(deal.add_time)).filter(Boolean).sort((a, b) => a!.getTime() - b!.getTime())[0];
        const pagination = payload.additional_data?.pagination;
        if (!pagination?.more_items_in_collection || !page.length || (oldest && oldest < start)) break;
        startOffset = Number(pagination.next_start) || startOffset + page.length;
      }
      return deals;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function listOpenDeals(maxDeals: number): Promise<Deal[]> {
  const deals: Deal[] = [];
  let startOffset = 0;
  while (deals.length < maxDeals) {
    const payload = await pipedriveV1("GET", "deals", undefined, {
      status: "open",
      start: startOffset,
      limit: Math.min(500, maxDeals - deals.length),
      sort: "update_time DESC",
    });
    const page = Array.isArray(payload.data) ? (payload.data as Deal[]) : [];
    deals.push(...page);
    const pagination = payload.additional_data?.pagination;
    if (!pagination?.more_items_in_collection || !page.length) break;
    startOffset = Number(pagination.next_start) || startOffset + page.length;
  }
  return deals;
}

function isOpenFailedWhatsAppActivity(activity: Record<string, unknown>) {
  const subject = asString(activity.subject);
  return FAILED_WHATSAPP_SUBJECTS.has(subject) || /^WhatsApp failed/i.test(subject);
}

async function listOpenFailedWhatsAppActivities(maxActivities = 5000): Promise<Array<Record<string, unknown>>> {
  const activities: Array<Record<string, unknown>> = [];
  let startOffset = 0;
  while (activities.length < maxActivities) {
    const payload = await pipedriveV1("GET", "activities", undefined, {
      done: 0,
      start: startOffset,
      limit: Math.min(500, maxActivities - activities.length),
    });
    const page = Array.isArray(payload.data) ? payload.data as Array<Record<string, unknown>> : [];
    activities.push(...page.filter(isOpenFailedWhatsAppActivity));
    const pagination = payload.additional_data?.pagination;
    if (!pagination?.more_items_in_collection || !page.length) break;
    startOffset = Number(pagination.next_start) || startOffset + page.length;
  }
  return activities;
}

function buildPlans(
  deals: Deal[],
  openDeals: Deal[],
  openFailedWhatsAppActivities: Array<Record<string, unknown>>,
  windowStart: Date,
  windowEnd: Date,
  recipientFilter: string,
  now: Date,
): DigestPlan[] {
  const filter = asString(recipientFilter).toLowerCase();
  const windowLabel = `${formatDateTimeIst(windowStart)} to ${formatDateTimeIst(windowEnd)} IST`;
  const digestDate = formatDateIst(windowEnd);
  return RECIPIENTS
    .filter((recipient) => !filter || recipient.key === filter || recipient.name.toLowerCase() === filter || (recipient as any).mirrorOf === filter)
    .map((recipient) => {
      const scopedDeals = deals.filter((deal) => {
        const id = ownerId(deal);
        return id !== null && recipient.ownerIds.some((ownerIdValue) => ownerIdValue === id);
      });
      const scopedOpenDeals = openDeals.filter((deal) => {
        const id = ownerId(deal);
        return id !== null && recipient.ownerIds.some((ownerIdValue) => ownerIdValue === id);
      });
      const scopeLabel = recipient.scopeLabel;
      const summary = buildSummary(scopedDeals, scopeLabel);
      const collectiveBreakdown = buildCollectiveBreakdown(scopedDeals);
      const stageBreakdown = buildStageBreakdown(scopedDeals);
      const scopedOpenDealIds = new Set(scopedOpenDeals.map((deal) => Number(deal.id)).filter(Boolean));
      const failedWhatsAppCount = openFailedWhatsAppActivities.filter((activity) =>
        scopedOpenDealIds.has(Number(activity.deal_id)),
      ).length;
      const nextAction = buildNextAction(scopedOpenDeals, failedWhatsAppCount, now);
      return {
        recipient_key: recipient.key,
        recipient_name: recipient.name,
        phone: recipient.phone,
        window_start: windowStart.toISOString(),
        window_end: windowEnd.toISOString(),
        window_label: windowLabel,
        deal_count: scopedDeals.length,
        body_values: [
          cleanTemplateValue(recipient.name),
          cleanTemplateValue(digestDate),
          cleanTemplateValue(summary),
          cleanTemplateValue(`${collectiveBreakdown}; ${stageBreakdown}`),
          cleanTemplateValue(nextAction),
        ],
        preview: {
          summary,
          collective_breakdown: `${collectiveBreakdown}; ${stageBreakdown}`,
          activity_health: nextAction,
        },
      };
    });
}

async function sendInteraktDigest(plan: DigestPlan) {
  const apiKey = await wmill.getVariable(INTERAKT_API_KEY_PATH);
  if (isPlaceholder(apiKey)) {
    throw new Error(`Interakt API key is missing or still dummy at ${INTERAKT_API_KEY_PATH}.`);
  }
  const baseUrl = ((await wmill.getVariable(INTERAKT_BASE_URL_PATH).catch(() => "https://api.interakt.ai")) || "https://api.interakt.ai").replace(/\/+$/, "");
  const payload = {
    ...interaktRecipient(plan.phone),
    template_category: "utility",
    callbackData: `owner_daily_sales_digest:${plan.recipient_key}:${plan.window_end}`,
    type: "Template",
    template: {
      name: TEMPLATE_NAME,
      languageCode: "en",
      bodyValues: plan.body_values,
    },
  };

  const response = await fetch(`${baseUrl}/v1/public/message/`, {
    method: "POST",
    headers: {
      authorization: `Basic ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.result === false) {
    throw new Error(`Interakt digest send failed: ${response.status} ${JSON.stringify(body)}`);
  }
  return body;
}

export async function main(
  dry_run = true,
  recipient_filter = "",
  now_iso = "",
  window_start_iso = "",
  window_end_iso = "",
  max_deals = 1000,
) {
  const now = now_iso ? new Date(now_iso) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error(`Invalid now_iso: ${now_iso}`);

  const defaultRange = defaultWindow(now);
  const windowStart = window_start_iso ? new Date(window_start_iso) : defaultRange.start;
  const windowEnd = window_end_iso ? new Date(window_end_iso) : defaultRange.end;
  if (Number.isNaN(windowStart.getTime())) throw new Error(`Invalid window_start_iso: ${window_start_iso}`);
  if (Number.isNaN(windowEnd.getTime())) throw new Error(`Invalid window_end_iso: ${window_end_iso}`);
  if (windowStart >= windowEnd) throw new Error("Digest window start must be before window end.");

  const maxDealsValue = Math.max(1, max_deals);
  const [deals, openDeals, openFailedWhatsAppActivities] = await Promise.all([
    listDealsReceived(windowStart, windowEnd, maxDealsValue),
    listOpenDeals(Math.max(5000, maxDealsValue)),
    listOpenFailedWhatsAppActivities(),
  ]);
  const plans = buildPlans(deals, openDeals, openFailedWhatsAppActivities, windowStart, windowEnd, recipient_filter, now);
  const sent: Array<Record<string, unknown>> = [];
  const skipped: Array<Record<string, unknown>> = [];

  for (const plan of plans) {
    if (dry_run) {
      skipped.push({ recipient_key: plan.recipient_key, reason: "dry_run", body_values: plan.body_values });
      continue;
    }
    try {
      const result = await sendInteraktDigest(plan);
      sent.push({ recipient_key: plan.recipient_key, phone: plan.phone, result });
    } catch (error) {
      skipped.push({
        recipient_key: plan.recipient_key,
        phone: plan.phone,
        reason: "interakt_failed",
        error: error instanceof Error ? error.message : String(error),
        body_values: plan.body_values,
      });
    }
  }

  return {
    dry_run,
    template_name: TEMPLATE_NAME,
    template_id: TEMPLATE_ID,
    window_start: windowStart.toISOString(),
    window_end: windowEnd.toISOString(),
    window_label: `${formatDateTimeIst(windowStart)} to ${formatDateTimeIst(windowEnd)} IST`,
    source_deals_received: deals.length,
    source_open_deals: openDeals.length,
    source_open_failed_whatsapp_activities: openFailedWhatsAppActivities.length,
    plans,
    sent,
    skipped,
  };
}
