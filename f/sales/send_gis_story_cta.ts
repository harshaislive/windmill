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
const PUBLIC_TRACKING_BASE_URL = "https://flows.ops.beforest.co/api/r/sales/gis/open";
const VIVEK_USER_ID = 22251956;
const HAMMIYALA_VIVEK_BROCHURE_URL = "https://canva.link/vjfj5yn7486ujqb";
const HAMMIYALA_RAKESH_BROCHURE_URL = "https://canva.link/sg93jjmd2i08ji3";

type GisLabelIds = {
  gisAwaiting: number;
  gisSent: number;
  gisOpened: number;
};

type Deal = Record<string, any> & {
  id?: number;
  title?: string;
  pipeline_id?: number | { id?: number };
  label?: string | number | Array<string | number>;
  labels?: Array<string | number | { id?: number | string }>;
  label_ids?: Array<string | number>;
  person_id?: number | { id?: number };
  custom_fields?: Record<string, unknown>;
};

type Person = {
  id?: number;
  name?: string;
  phones?: Array<{ value?: string; primary?: boolean }>;
  phone?: Array<{ value?: string; primary?: boolean }>;
};

type InteraktRecipient = {
  countryCode?: string;
  phoneNumber?: string;
  fullPhoneNumber?: string;
};

const DEAL_FIELDS = {
  phone: "7f1ebc80670dad0d9f6ea3d5f2585c923395305a",
};

type CollectiveConfig = { key: string; label: string; storyUrl: string; contextLine: string; nextStep?: "calendly" | "typeform" };

const COLLECTIVES_BY_PIPELINE: Record<number, CollectiveConfig> = {
  1: {
    key: "hammiyala",
    label: "Hammiyala Collective",
    storyUrl: HAMMIYALA_RAKESH_BROCHURE_URL,
    contextLine: "For Hammiyala, pay close attention to the terrain, water, settlement context, access, and why the collective is being shaped in that landscape.",
    nextStep: "typeform",
  },
  2: {
    key: "mumbai",
    label: "Mumbai Collective",
    storyUrl: "https://www.canva.com/design/DAFy6m9o82w/M9Q02GvniE7SsQs0D9k-pw/view?utm_content=DAFy6m9o82w&utm_campaign=designshare&utm_medium=link2&utm_source=uniquelinks&utlId=h7eabae59da",
    contextLine: "For Mumbai, pay close attention to the location, access, surrounding context, built-form approach, and what participation in this landscape asks of a member.",
  },
  3: {
    key: "poomaale2",
    label: "Poomaale Collective 2.0",
    storyUrl: "https://www.canva.com/design/DAESin37d1A/HipyO_KPA4eOLfnzQd33qg/view?utm_content=DAESin37d1A&utm_campaign=designshare&utm_medium=link&utm_source=editor",
    contextLine: "For Poomaale 2.0, pay close attention to the slope, ecology, access, land-use context, and the shared participation model behind the collective.",
  },
  4: {
    key: "bhopal",
    label: "Bhopal Collective",
    storyUrl: "https://www.canva.com/design/DAFA7pBf2Ps/dzZecTicRzkdUan3yQd5cQ/view",
    contextLine: "For Bhopal, pay close attention to the land, water, access, ownership context, and the way the collective is structured around the site.",
  },
  6: {
    key: "hyderabad",
    label: "Hyderabad Collective",
    storyUrl: "https://www.canva.com/design/DAEtWW1aqhU/CvJ4odXV4OLuBaHyAXHzxA/view?utm_content=DAEtWW1aqhU&utm_campaign=designshare&utm_medium=link2&utm_source=uniquelinks&utlId=hb2d0772275",
    contextLine: "For Hyderabad, pay close attention to the site context, access, participation model, and how the collective is being shaped around the landscape.",
  },
};

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(asString(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function escapeHtml(value: string): string {
  return value.replace(/[<>&]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[char] || char));
}

function base64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function pipelineId(deal: Deal): number | null {
  if (typeof deal.pipeline_id === "object") return asNumber(deal.pipeline_id?.id);
  return asNumber(deal.pipeline_id);
}

function personId(deal: Deal): number | null {
  if (typeof deal.person_id === "number") return deal.person_id;
  if (deal.person_id && typeof deal.person_id === "object") return asNumber(deal.person_id.id);
  return null;
}

function ownerId(deal: Deal): number | null {
  const raw = deal.owner_id?.id ?? deal.owner_id?.value ?? deal.owner_id ?? deal.user_id?.id ?? deal.user_id;
  return asNumber(raw);
}

function collectiveForDeal(deal: Deal): CollectiveConfig | null {
  const base = COLLECTIVES_BY_PIPELINE[pipelineId(deal) || 0];
  if (!base || base.key !== "hammiyala") return base || null;
  const vivekOwned = ownerId(deal) === VIVEK_USER_ID;
  return {
    ...base,
    storyUrl: vivekOwned ? HAMMIYALA_VIVEK_BROCHURE_URL : HAMMIYALA_RAKESH_BROCHURE_URL,
    nextStep: vivekOwned ? "calendly" : "typeform",
  };
}

function collectLabelIds(deal: Deal): number[] {
  const ids = new Set<number>();
  const add = (value: unknown) => {
    const id = asNumber(value);
    if (id !== null) ids.add(id);
  };

  if (Array.isArray(deal.label_ids)) deal.label_ids.forEach(add);
  if (Array.isArray(deal.labels)) {
    for (const label of deal.labels) {
      if (typeof label === "object" && label !== null) add((label as { id?: unknown }).id);
      else add(label);
    }
  }
  if (Array.isArray(deal.label)) deal.label.forEach(add);
  else add(deal.label);

  return Array.from(ids);
}

function primaryPhone(person: Person | null): string {
  const phones = [...(person?.phones || []), ...(person?.phone || [])];
  return asString(phones.find((entry) => entry.primary)?.value || phones[0]?.value);
}

function dealPhone(deal: Deal): string {
  return asString(deal.custom_fields?.[DEAL_FIELDS.phone] ?? deal[DEAL_FIELDS.phone]);
}

function firstName(deal: Deal, person: Person | null): string {
  const source = asString(person?.name || deal.title);
  return source.split(/\s+/).filter(Boolean)[0] || "there";
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

function assertRecipientReady(recipient: InteraktRecipient, rawPhone: string) {
  if (!rawPhone || (!recipient.fullPhoneNumber && !(recipient.countryCode && recipient.phoneNumber))) {
    throw new Error("No usable WhatsApp phone found for this deal.");
  }
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

async function loadGisLabelIds(): Promise<GisLabelIds> {
  const raw = await wmill.getVariable(GIS_LABEL_IDS_VARIABLE_PATH).catch(() => "");
  if (!raw) throw new Error(`Missing ${GIS_LABEL_IDS_VARIABLE_PATH}.`);
  const parsed = JSON.parse(raw) as Partial<GisLabelIds>;
  const ids = {
    gisAwaiting: Number(parsed.gisAwaiting),
    gisSent: Number(parsed.gisSent),
    gisOpened: Number(parsed.gisOpened),
  };
  if (!ids.gisAwaiting || !ids.gisSent || !ids.gisOpened) {
    throw new Error(`${GIS_LABEL_IDS_VARIABLE_PATH} must include numeric gisAwaiting, gisSent, and gisOpened.`);
  }
  return ids;
}

async function tokenSecret(): Promise<string> {
  return (
    (await wmill.getVariable(GIS_TOKEN_SECRET_VARIABLE_PATH).catch(() => "")) ||
    (await wmill.getVariable(INTERAKT_API_KEY_PATH))
  );
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

async function getDeal(dealId: number): Promise<Deal> {
  const payload = await pipedriveRequest("GET", `deals/${dealId}`);
  return payload.data as Deal;
}

async function getPerson(id: number): Promise<Person | null> {
  const payload = await pipedriveRequest("GET", `persons/${id}`).catch(() => null);
  return payload?.data || null;
}

async function createPipedriveActivity(
  dealId: number,
  subject: string,
  note: string,
  options: { personId?: number | null; done?: 0 | 1 } = {},
) {
  const payload = await pipedriveRequest("POST", "activities", {
    apiVersion: "v1",
    body: {
      deal_id: dealId,
      ...(options.personId ? { person_id: options.personId } : {}),
      user_id: BEFOREST_ADMIN_USER_ID,
      subject,
      type: "task",
      done: options.done ?? 1,
      due_date: todayInTimezone("Asia/Kolkata"),
      note,
    },
  });
  return payload.data;
}

async function hasSentActivity(dealId: number): Promise<boolean> {
  const payload = await pipedriveRequest("GET", `deals/${dealId}/activities`, {
    apiVersion: "v1",
    params: { done: 1, limit: 100 },
  });
  return (payload.data || []).some((activity: any) => asString(activity.subject) === "GIS story link sent");
}

async function updateDealLabels(deal: Deal, addLabelId: number) {
  const payload = await pipedriveRequest("PUT", `deals/${Number(deal.id)}`, {
    apiVersion: "v1",
    body: { label: String(addLabelId) },
  });
  return payload.data;
}

function manualGisMessage(firstNameValue: string, collective: string, storyUrl: string, contextLine: string, nextStep?: "calendly" | "typeform"): string {
  return [
    `Hi ${firstNameValue || "there"},`,
    "",
    `For ${collective}, the next step is to go through the brochure.`,
    "",
    "It brings together the place, access, landscape, people, process, and current progress of the collective, so you can understand it with the right context.",
    "",
    contextLine,
    "",
    nextStep === "calendly"
      ? "If the brochure feels aligned, use Vivek's Calendly link inside it to schedule a conversation."
      : "If the brochure feels aligned, you can request a conversation from the form at the end of the brochure. It helps us understand what you would like to explore before the team speaks with you.",
    "",
    `Open the brochure here: ${storyUrl}`,
  ].join("\n");
}

function manualFailureNote(params: {
  reason: string;
  phone: string;
  manualMessage: string;
}) {
  return [
    "Brochure WhatsApp delivery failed. Please send this manually from WhatsApp Web.",
    params.reason ? `Reason: ${escapeHtml(params.reason)}` : "",
    params.phone ? `Send to: ${escapeHtml(params.phone)}` : "Send to: phone number on the Pipedrive person/deal.",
    `Template: ${escapeHtml(TEMPLATE_NAME)}`,
    "",
    "<strong>Copy-paste message</strong>",
    `<pre>${escapeHtml(params.manualMessage)}</pre>`,
  ].filter(Boolean).join("<br>");
}

async function sendInteraktTemplate(plan: {
  recipient: InteraktRecipient;
  bodyValues: string[];
  buttonValues: Record<string, string[]>;
  callbackData: string;
}) {
  const apiKey = await wmill.getVariable(INTERAKT_API_KEY_PATH);
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
      callbackData: plan.callbackData,
      template_category: "marketing",
      type: "Template",
      template: {
        name: TEMPLATE_NAME,
        languageCode: "en",
        bodyValues: plan.bodyValues,
        buttonValues: plan.buttonValues,
      },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.result === false) {
    throw new Error(`Interakt brochure CTA send failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

export async function main(deal_id: number, dry_run = false) {
  const dealId = Number(deal_id);
  if (!Number.isFinite(dealId) || dealId <= 0) throw new Error("deal_id is required.");

  const gisLabels = await loadGisLabelIds();
  const deal = await getDeal(dealId);
  const labels = new Set(collectLabelIds(deal));
  const config = collectiveForDeal(deal);
  const pid = personId(deal);
  const person = pid ? await getPerson(pid) : null;
  const rawPhone = primaryPhone(person) || dealPhone(deal);
  const recipient = interaktRecipient(rawPhone);
  const alreadySent = await hasSentActivity(dealId);

  if (!config) return { status: "ignored", reason: "Unsupported pipeline for GIS CTA.", deal_id: dealId };
  if (!labels.has(gisLabels.gisAwaiting) && !labels.has(gisLabels.gisOpened) && !labels.has(gisLabels.gisSent)) {
    return { status: "ignored", reason: "Deal is not labeled for GIS.", deal_id: dealId };
  }
  if (alreadySent) return { status: "skipped", reason: "GIS CTA was already logged.", deal_id: dealId };

  const token = await trackingToken({
    deal_id: dealId,
    person_id: pid,
    collective: config.key,
    destination_url: config.storyUrl,
    source: "interakt_brochure_cta",
    iat: new Date().toISOString(),
  });
  const trackingUrl = `${PUBLIC_TRACKING_BASE_URL}?t=${encodeURIComponent(token)}`;
  const bodyValues = [firstName(deal, person), config.label];
  const manualMessage = manualGisMessage(bodyValues[0], config.label, config.storyUrl, config.contextLine, config.nextStep);
  const plan = {
    template_name: TEMPLATE_NAME,
    recipient,
    raw_phone_present: Boolean(rawPhone),
    body_values: bodyValues,
    button_values: { "0": [token] },
    callback_data: `pipedrive_deal:${dealId}:brochure_cta`,
    tracking_url: trackingUrl,
    story_url: config.storyUrl,
  };

  if (dry_run) {
    return {
      dry_run: true,
      status: "would_send",
      deal_id: dealId,
      deal_title: deal.title || null,
      collective: config.label,
      plan,
      manual_message: manualMessage,
    };
  }

  try {
    assertRecipientReady(recipient, rawPhone);
    const interaktResponse = await sendInteraktTemplate({
      recipient,
      bodyValues,
      buttonValues: plan.button_values,
      callbackData: plan.callback_data,
    });
    const updatedDeal = await updateDealLabels(deal, gisLabels.gisSent);
    const activity = await createPipedriveActivity(
      dealId,
      "GIS story link sent",
      [
        "Sent the brochure link on WhatsApp.",
        `Collective: ${config.label}`,
        `Template: ${TEMPLATE_NAME}`,
        `Tracking URL: ${escapeHtml(trackingUrl)}`,
        "",
        "<strong>Message sent</strong>",
        `<pre>${escapeHtml(manualMessage)}</pre>`,
      ].join("<br>"),
      { personId: pid },
    );
    return {
      dry_run: false,
      status: "sent",
      deal_id: dealId,
      collective: config.label,
      interakt_response: interaktResponse,
      updated_label_ids: collectLabelIds(updatedDeal),
      audit_activity_id: Number(activity?.id) || null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const activity = await createPipedriveActivity(
      dealId,
      "WhatsApp failed to deliver",
      manualFailureNote({
        reason: message,
        phone: rawPhone,
        manualMessage,
      }),
      { personId: pid, done: 0 },
    );
    return {
      dry_run: false,
      status: "failed",
      deal_id: dealId,
      error: message,
      manual_review_activity_id: Number(activity?.id) || null,
    };
  }
}
