import * as wmill from "windmill-client";
import { createHmac } from "node:crypto";

const PIPEDRIVE_VARIABLE_PATH = "f/collectives/zoom_collective_to_pipedrive/pipedrive_api_key";
const INTERAKT_API_KEY_PATH = "f/sales/calendar_prebook_1on1/interakt_api_key";
const INTERAKT_BASE_URL_PATH = "f/sales/calendar_prebook_1on1/interakt_base_url";
const GIS_LABEL_IDS_VARIABLE_PATH = "f/sales/gis_label_ids";
const GIS_TOKEN_SECRET_VARIABLE_PATH = "f/sales/gis_tracking_token_secret";
const DEFAULT_PIPEDRIVE_DOMAIN = "beforest";
const BEFOREST_ADMIN_USER_ID = 18891506;
const TEMPLATE_NAME = "collective_brochure_link_v4";
const FALLBACK_TEMPLATE_NAME = "collective_journey_initial_cta_v2";
const PUBLIC_TRACKING_BASE_URL = "https://flows.ops.beforest.co/api/r/sales/gis/open";
const RECENT_WINDOW_HOURS = 48;
const VIVEK_USER_ID = 22251956;
const HAMMIYALA_VIVEK_BROCHURE_URL = "https://canva.link/vjfj5yn7486ujqb";
const HAMMIYALA_RAKESH_BROCHURE_URL = "https://canva.link/sg93jjmd2i08ji3";

type Source = "typeform_fallback" | "whatsapp_redirect_inbound" | "manual";

type Deal = Record<string, any> & {
  id?: number;
  title?: string;
  status?: string;
  pipeline_id?: number | { id?: number };
  person_id?: number | { id?: number };
  custom_fields?: Record<string, unknown>;
};

type Person = {
  id?: number;
  name?: string;
  phones?: Array<{ value?: string; primary?: boolean }>;
  phone?: Array<{ value?: string; primary?: boolean }>;
};

type CollectiveConfig = {
  key: string;
  label: string;
  pipelineId: number;
  brochureUrl: string;
  nextStep?: "calendly" | "typeform";
};

const DEAL_FIELDS = {
  phone: "7f1ebc80670dad0d9f6ea3d5f2585c923395305a",
};

const COLLECTIVES: Record<string, CollectiveConfig> = {
  hammiyala: {
    key: "hammiyala",
    label: "Hammiyala Collective",
    pipelineId: 1,
    brochureUrl: HAMMIYALA_RAKESH_BROCHURE_URL,
    nextStep: "typeform",
  },
  mumbai: {
    key: "mumbai",
    label: "Mumbai Collective",
    pipelineId: 2,
    brochureUrl: "https://www.canva.com/design/DAFy6m9o82w/M9Q02GvniE7SsQs0D9k-pw/view?utm_content=DAFy6m9o82w&utm_campaign=designshare&utm_medium=link2&utm_source=uniquelinks&utlId=h7eabae59da",
  },
  poomaale2: {
    key: "poomaale2",
    label: "Poomaale Collective 2.0",
    pipelineId: 3,
    brochureUrl: "https://www.canva.com/design/DAESin37d1A/HipyO_KPA4eOLfnzQd33qg/view?utm_content=DAESin37d1A&utm_campaign=designshare&utm_medium=link&utm_source=editor",
  },
  bhopal: {
    key: "bhopal",
    label: "Bhopal Collective",
    pipelineId: 4,
    brochureUrl: "https://www.canva.com/design/DAFA7pBf2Ps/dzZecTicRzkdUan3yQd5cQ/view",
  },
  hyderabad: {
    key: "hyderabad",
    label: "Hyderabad Collective",
    pipelineId: 6,
    brochureUrl: "https://www.canva.com/design/DAEtWW1aqhU/CvJ4odXV4OLuBaHyAXHzxA/view?utm_content=DAEtWW1aqhU&utm_campaign=designshare&utm_medium=link2&utm_source=uniquelinks&utlId=hb2d0772275",
  },
};

const PIPELINE_TO_KEY = Object.fromEntries(Object.values(COLLECTIVES).map((collective) => [collective.pipelineId, collective.key]));
const SENT_ACTIVITY_SUBJECTS = new Set([
  "Brochure sent after WhatsApp redirect",
  "Brochure fallback sent after Typeform",
  "Brochure sent from Typeform flow",
  "GIS story link sent",
]);
const POST_BROCHURE_SUBJECTS = new Set(["Post-brochure Typeform submitted", "Post-GIS Typeform submitted"]);

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(asString(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function escapeHtml(value: unknown): string {
  return asString(value).replace(/[<>&]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[char] || char));
}

function normalizeDigits(value: unknown): string {
  return asString(value).replace(/\D/g, "");
}

function lastTen(value: unknown): string {
  const digits = normalizeDigits(value);
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function pipelineId(deal: Deal): number | null {
  if (typeof deal.pipeline_id === "object") return asNumber(deal.pipeline_id?.id);
  return asNumber(deal.pipeline_id);
}

function personId(deal: Deal): number | null {
  if (typeof deal.person_id === "object") return asNumber(deal.person_id?.id);
  return asNumber(deal.person_id);
}

function ownerId(deal: Deal): number | null {
  const raw = deal.owner_id?.id ?? deal.owner_id?.value ?? deal.owner_id ?? deal.user_id?.id ?? deal.user_id;
  return asNumber(raw);
}

function primaryPhone(person: Person | null): string {
  const phones = [...(person?.phones || []), ...(person?.phone || [])];
  return asString(phones.find((entry) => entry.primary)?.value || phones[0]?.value);
}

function dealPhone(deal: Deal): string {
  return asString(deal.custom_fields?.[DEAL_FIELDS.phone] ?? deal[DEAL_FIELDS.phone]);
}

function firstName(deal: Deal, person: Person | null): string {
  return asString(person?.name || deal.title).split(/\s+/, 1)[0] || "there";
}

function brochureNextStepCopy(collective: CollectiveConfig): string {
  if (collective.nextStep === "calendly") {
    return `After reading the ${collective.label} brochure, the lead can schedule a conversation with Vivek from the Calendly link in the brochure.`;
  }
  return `After reading the ${collective.label} brochure, the lead can request a conversation with our team from the form at the end of the brochure.`;
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

function base64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

async function tokenSecret(): Promise<string> {
  return (await wmill.getVariable(GIS_TOKEN_SECRET_VARIABLE_PATH).catch(() => "")) || (await wmill.getVariable(INTERAKT_API_KEY_PATH));
}

async function trackingToken(payload: Record<string, unknown>): Promise<string> {
  const body = base64Url(JSON.stringify(payload));
  const sig = createHmac("sha256", await tokenSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

async function pipedriveRequest(
  method: string,
  path: string,
  options: { params?: Record<string, unknown>; body?: Record<string, unknown>; apiVersion?: "v1" | "v2" } = {},
): Promise<any> {
  const apiToken = await wmill.getVariable(PIPEDRIVE_VARIABLE_PATH);
  const url = new URL(`https://${DEFAULT_PIPEDRIVE_DOMAIN}.pipedrive.com/api/${options.apiVersion || "v2"}/${path}`);
  url.searchParams.set("api_token", apiToken);
  for (const [key, value] of Object.entries(options.params || {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    method,
    headers: options.body ? { "content-type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(`Pipedrive ${method} ${path} failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function getDeal(dealId: number): Promise<Deal | null> {
  const payload = await pipedriveRequest("GET", `deals/${dealId}`).catch(() => null);
  return payload?.data || null;
}

async function getPerson(id: number | null): Promise<Person | null> {
  if (!id) return null;
  const payload = await pipedriveRequest("GET", `persons/${id}`).catch(() => null);
  return payload?.data || null;
}

async function dealActivities(dealId: number, done?: 0 | 1): Promise<any[]> {
  const payload = await pipedriveRequest("GET", `deals/${dealId}/activities`, {
    apiVersion: "v1",
    params: { ...(done === undefined ? {} : { done }), limit: 100 },
  }).catch(() => ({ data: [] }));
  return Array.isArray(payload.data) ? payload.data : [];
}

async function createActivity(
  dealId: number,
  subject: string,
  note: string,
  options: { personId?: number | null; userId?: number; done?: 0 | 1 } = {},
) {
  const payload = await pipedriveRequest("POST", "activities", {
    apiVersion: "v1",
    body: {
      deal_id: dealId,
      ...(options.personId ? { person_id: options.personId } : {}),
      user_id: options.userId || BEFOREST_ADMIN_USER_ID,
      subject,
      type: "task",
      done: options.done ?? 1,
      due_date: todayInTimezone("Asia/Kolkata"),
      note,
    },
  });
  return payload.data;
}

async function updateDealToGisSent(deal: Deal) {
  const raw = await wmill.getVariable(GIS_LABEL_IDS_VARIABLE_PATH).catch(() => "");
  if (!raw) return null;
  const labelId = Number(JSON.parse(raw)?.gisSent);
  if (!labelId) return null;
  const payload = await pipedriveRequest("PUT", `deals/${Number(deal.id)}`, {
    apiVersion: "v1",
    body: { label: String(labelId) },
  });
  return payload.data;
}

async function sendInteraktTemplate(
  recipientPhone: string,
  name: string,
  collective: CollectiveConfig,
  buttonToken: string,
  templateName: string,
  buttonIndex: "0" | "1",
) {
  const apiKey = await wmill.getVariable(INTERAKT_API_KEY_PATH);
  const baseUrl = (await wmill.getVariable(INTERAKT_BASE_URL_PATH).catch(() => "")) || "https://api.interakt.ai";
  const authorization = apiKey.toLowerCase().startsWith("basic ") ? apiKey : `Basic ${apiKey}`;
  const cleaned = asString(recipientPhone).replace(/[^\d+]/g, "");
  const digits = cleaned.replace(/\D/g, "");
  const recipient =
    cleaned.startsWith("+") || digits.length !== 10
      ? { fullPhoneNumber: digits }
      : { countryCode: "+91", phoneNumber: digits };
  if (!digits) throw new Error("No usable WhatsApp phone found for this deal.");

  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/v1/public/message/`, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      ...recipient,
      type: "Template",
      template: {
        name: templateName,
        languageCode: "en",
        bodyValues:
          templateName === FALLBACK_TEMPLATE_NAME
            ? [name, collective.label, brochureNextStepCopy(collective)]
            : [name, collective.label],
        buttonValues: { [buttonIndex]: [buttonToken] },
      },
      callbackData: JSON.stringify({
        source: "brochure_after_typeform",
        collective: collective.key,
      }),
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.result === false) {
    throw new Error(`Interakt ${templateName} template failed: ${response.status} ${JSON.stringify(payload).slice(0, 800)}`);
  }
  return payload;
}

async function sendBrochureTemplateWithFallback(recipientPhone: string, name: string, collective: CollectiveConfig, buttonToken: string) {
  try {
    const response = await sendInteraktTemplate(recipientPhone, name, collective, buttonToken, TEMPLATE_NAME, "0");
    return { template_name: TEMPLATE_NAME, response };
  } catch (primaryError) {
    const response = await sendInteraktTemplate(recipientPhone, name, collective, buttonToken, FALLBACK_TEMPLATE_NAME, "0");
    return {
      template_name: FALLBACK_TEMPLATE_NAME,
      response,
      primary_template_error: primaryError instanceof Error ? primaryError.message : String(primaryError),
    };
  }
}

async function inboundAfter(phone: string, submittedAt: string): Promise<any[]> {
  const phoneKey = lastTen(phone);
  if (!phoneKey || !submittedAt) return [];
  const sql = wmill.datatable("main");
  const rows = await sql`
    SELECT raw_event_id, received_at, event_timestamp, phone_number, action, webhook_type, message_status
    FROM interakt_inbound_webhook_raw_events
    WHERE RIGHT(REGEXP_REPLACE(COALESCE(phone_number, ''), '\\D', '', 'g'), 10) = ${phoneKey}
      AND COALESCE(event_timestamp, received_at) >= ${submittedAt}::timestamptz
      AND COALESCE(message_status, '') = ''
      AND LOWER(COALESCE(webhook_type, '')) NOT LIKE '%status%'
    ORDER BY COALESCE(event_timestamp, received_at) ASC
    LIMIT 10
  `.fetch();
  return Array.isArray(rows) ? rows : [];
}

async function findRecentDealByPhone(phone: string, collectiveKey: string, submittedAt: string): Promise<{ deal: Deal | null; reason: string }> {
  const phoneKey = lastTen(phone);
  if (!phoneKey) return { deal: null, reason: "missing_phone" };
  const collective = COLLECTIVES[collectiveKey];
  const payload = await pipedriveRequest("GET", "deals", {
    apiVersion: "v1",
    params: {
      status: "open",
      limit: 500,
      ...(collective ? { pipeline_id: collective.pipelineId } : {}),
    },
  });
  const cutoff = submittedAt
    ? new Date(new Date(submittedAt).getTime() - RECENT_WINDOW_HOURS * 60 * 60 * 1000)
    : new Date(Date.now() - RECENT_WINDOW_HOURS * 60 * 60 * 1000);
  const candidates: Array<{ deal: Deal; person: Person | null; time: number }> = [];
  for (const deal of payload.data || []) {
    const createdAt = new Date(asString(deal.add_time || deal.update_time || "")).getTime();
    if (Number.isFinite(createdAt) && createdAt < cutoff.getTime()) continue;
    const person = await getPerson(personId(deal));
    const dealPhoneValue = dealPhone(deal) || primaryPhone(person);
    if (lastTen(dealPhoneValue) === phoneKey) candidates.push({ deal, person, time: createdAt || 0 });
  }
  candidates.sort((left, right) => right.time - left.time);
  if (candidates.length === 1) return { deal: candidates[0].deal, reason: "unique_recent_phone_match" };
  if (candidates.length > 1) return { deal: candidates[0].deal, reason: "latest_recent_phone_match" };
  return { deal: null, reason: "no_recent_phone_match" };
}

async function resolveDeal(dealId: number, phone: string, collectiveKey: string, submittedAt: string) {
  if (dealId > 0) {
    const deal = await getDeal(dealId);
    return { deal, reason: deal ? "explicit_deal_id" : "explicit_deal_not_found" };
  }
  return findRecentDealByPhone(phone, collectiveKey, submittedAt);
}

function collectiveFor(deal: Deal | null, collectiveKey: string): CollectiveConfig | null {
  const requested = collectiveKey && COLLECTIVES[collectiveKey] ? COLLECTIVES[collectiveKey] : null;
  const key = deal ? PIPELINE_TO_KEY[Number(pipelineId(deal))] : "";
  const base = requested || (key ? COLLECTIVES[key] : null);
  if (!base || base.pipelineId !== 1 || !deal) return base;
  const vivekOwned = ownerId(deal) === VIVEK_USER_ID;
  return {
    ...base,
    brochureUrl: vivekOwned ? HAMMIYALA_VIVEK_BROCHURE_URL : HAMMIYALA_RAKESH_BROCHURE_URL,
    nextStep: vivekOwned ? "calendly" : "typeform",
  };
}

async function manualTask(dealId: number, personIdValue: number | null, reason: string, noteLines: string[], dryRun: boolean) {
  const note = [
    "Brochure automation needs manual follow-up.",
    `Reason: ${escapeHtml(reason)}`,
    ...noteLines.map((line) => escapeHtml(line)),
  ].join("<br>");
  if (dryRun) return { status: "would_create_manual_task", note };
  const activity = await createActivity(dealId, "Send brochure manually", note, { personId: personIdValue, done: 0 });
  return { status: "manual_task_created", activity_id: Number(activity?.id) || null };
}

export async function main(
  deal_id = 0,
  phone = "",
  collective_key = "",
  submitted_at = "",
  source: Source = "typeform_fallback",
  dry_run = false,
) {
  let effectiveSource = source;
  const resolved = await resolveDeal(Number(deal_id), phone, asString(collective_key), asString(submitted_at));
  const deal = resolved.deal;
  if (!deal?.id) {
    return {
      dry_run,
      status: "skipped_no_matching_deal",
      reason: resolved.reason,
      phone: phone ? `...${lastTen(phone)}` : null,
      collective_key: collective_key || null,
    };
  }
  if (asString(deal.status).toLowerCase() && asString(deal.status).toLowerCase() !== "open") {
    return { dry_run, status: "skipped_deal_not_open", deal_id: Number(deal.id), deal_status: deal.status };
  }

  const collective = collectiveFor(deal, asString(collective_key));
  const dealPersonId = personId(deal);
  const person = await getPerson(dealPersonId);
  const rawPhone = phone || dealPhone(deal) || primaryPhone(person);
  const activities = [...(await dealActivities(Number(deal.id), 1)), ...(await dealActivities(Number(deal.id), 0))];
  const subjects = new Set(activities.map((activity) => asString(activity.subject)));

  if ([...POST_BROCHURE_SUBJECTS].some((subject) => subjects.has(subject))) {
    return { dry_run, status: "skipped_post_brochure_already_submitted", deal_id: Number(deal.id) };
  }
  if ([...SENT_ACTIVITY_SUBJECTS].some((subject) => subjects.has(subject))) {
    return { dry_run, status: "skipped_brochure_already_sent", deal_id: Number(deal.id) };
  }
  if (!collective) {
    return manualTask(Number(deal.id), dealPersonId, "unknown_collective", [`Deal pipeline: ${pipelineId(deal) || "unknown"}`], dry_run);
  }
  if (!lastTen(rawPhone)) {
    return manualTask(Number(deal.id), dealPersonId, "missing_phone", [`Collective: ${collective.label}`], dry_run);
  }

  let inboundRows: any[] = [];
  if (effectiveSource === "typeform_fallback") {
    inboundRows = await inboundAfter(rawPhone, asString(submitted_at));
    effectiveSource = inboundRows.length ? "whatsapp_redirect_inbound" : "typeform_fallback";
  }
  const subject =
    effectiveSource === "whatsapp_redirect_inbound"
      ? "Brochure sent after WhatsApp redirect"
      : "Brochure fallback sent after Typeform";
  const token = await trackingToken({
    deal_id: Number(deal.id),
    person_id: dealPersonId,
    collective: collective.key,
    destination_url: collective.brochureUrl,
    source: effectiveSource,
    iat: new Date().toISOString(),
  });
  const trackingUrl = `${PUBLIC_TRACKING_BASE_URL}?t=${encodeURIComponent(token)}`;
  const plan = {
    deal_id: Number(deal.id),
    collective: collective.label,
    phone: `...${lastTen(rawPhone)}`,
    source: effectiveSource,
    subject,
    template_name: TEMPLATE_NAME,
    fallback_template_name: FALLBACK_TEMPLATE_NAME,
    brochure_url: collective.brochureUrl,
    tracking_url: trackingUrl,
    inbound_match_count: inboundRows.length,
  };
  if (dry_run) return { dry_run: true, status: "would_send_brochure", ...plan };

  try {
    const interakt = await sendBrochureTemplateWithFallback(rawPhone, firstName(deal, person), collective, token);
    await updateDealToGisSent(deal).catch(() => null);
    const activity = await createActivity(
      Number(deal.id),
      subject,
      [
        `Brochure sent to lead for ${escapeHtml(collective.label)}.`,
        `Source: ${escapeHtml(effectiveSource)}`,
        `Template: ${escapeHtml(interakt.template_name)}`,
        ...(interakt.primary_template_error ? [`Primary template fallback reason: ${escapeHtml(interakt.primary_template_error)}`] : []),
        `Lead-facing next step: ${escapeHtml(brochureNextStepCopy(collective))}`,
        `Tracking URL: ${escapeHtml(trackingUrl)}`,
        `Brochure URL: ${escapeHtml(collective.brochureUrl)}`,
      ].join("<br>"),
      { personId: dealPersonId, done: 1 },
    );
    return { dry_run: false, status: "brochure_sent", activity_id: Number(activity?.id) || null, interakt, ...plan };
  } catch (error) {
    const fallback = await manualTask(
      Number(deal.id),
      dealPersonId,
      "interakt_template_failed",
      [
        `Error: ${error instanceof Error ? error.message : String(error)}`,
        `Collective: ${collective.label}`,
        `Lead-facing next step: ${brochureNextStepCopy(collective)}`,
        `Brochure URL: ${collective.brochureUrl}`,
      ],
      false,
    );
    return { dry_run: false, status: "manual_task_created_after_send_failure", error: error instanceof Error ? error.message : String(error), ...fallback, ...plan };
  }
}
