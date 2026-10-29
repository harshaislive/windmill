import * as wmill from "windmill-client";
import { createHmac } from "node:crypto";

const PIPEDRIVE_VARIABLE_PATH = "f/collectives/zoom_collective_to_pipedrive/pipedrive_api_key";
const INTERAKT_API_KEY_PATH = "f/sales/calendar_prebook_1on1/interakt_api_key";
const INTERAKT_BASE_URL_PATH = "f/sales/calendar_prebook_1on1/interakt_base_url";
const GIS_LABEL_IDS_VARIABLE_PATH = "f/sales/gis_label_ids";
const GIS_TOKEN_SECRET_VARIABLE_PATH = "f/sales/gis_tracking_token_secret";
const DEFAULT_PIPEDRIVE_DOMAIN = "beforest";
const BEFOREST_ADMIN_USER_ID = 18891506;
const PUBLIC_TRACKING_BASE_URL = "https://flows.ops.beforest.co/api/r/sales/gis/open";
const VIVEK_USER_ID = 22251956;
const HAMMIYALA_VIVEK_BROCHURE_URL = "https://canva.link/vjfj5yn7486ujqb";
const HAMMIYALA_RAKESH_BROCHURE_URL = "https://canva.link/sg93jjmd2i08ji3";

const GIS_SENT_ACTIVITY_SUBJECT = "GIS story link sent";
const POST_GIS_TYPEFORM_SUBMITTED_ACTIVITY_SUBJECT = "Post-GIS Typeform submitted";
const POST_BROCHURE_TYPEFORM_SUBMITTED_ACTIVITY_SUBJECT = "Post-brochure Typeform submitted";
const NURTURE_ACTIVITY_PREFIX = "Collective Journey second-form follow-up sent";
const LEGACY_NURTURE_ACTIVITY_PREFIXES = [
  "Collective Story second-form follow-up sent",
  "Collective Story unopened follow-up sent",
];

type GisLabelIds = {
  gisAwaiting: number;
  gisSent: number;
  gisOpened: number;
};

type Deal = Record<string, any> & {
  id?: number;
  title?: string;
  status?: string;
  pipeline_id?: number | { id?: number };
  person_id?: number | { id?: number; name?: string };
  label?: unknown;
  label_ids?: Array<number | string>;
  labels?: Array<{ id?: number | string } | number | string>;
  custom_fields?: Record<string, unknown>;
};

type Person = {
  id?: number;
  name?: string;
  phones?: Array<{ value?: string; primary?: boolean }>;
  phone?: Array<{ value?: string; primary?: boolean }>;
};

type Activity = {
  id?: number;
  subject?: string;
  note?: string;
  done?: boolean | number | string;
  add_time?: string;
  update_time?: string;
  due_date?: string;
  deal_id?: number | string | { id?: number | string };
};

type InteraktRecipient = {
  countryCode?: string;
  phoneNumber?: string;
  fullPhoneNumber?: string;
};

type NurtureStep = {
  day: number;
  key: string;
  templateName: string;
  whatsappTemplateId: string;
};

type QueueRow = {
  deal_id: number | string;
  person_id?: number | string | null;
  phone?: string | null;
  lead_name?: string | null;
  first_name?: string | null;
  collective_key?: string | null;
  collective_label?: string | null;
  journey_url?: string | null;
  journey_sent_at?: string | null;
  next_step_due_at?: string | null;
  step_index?: number | string | null;
  status?: string | null;
};

const DEAL_FIELDS = {
  phone: "7f1ebc80670dad0d9f6ea3d5f2585c923395305a",
  oneOnOneMeetingDateTime: "d6fd8c9877d20bfd678ecb37f21e5b33bd2717fd",
  meetingReferenceId: "cd1b8c89ded44fccbf04ded59928cc9fc3ae0e50",
};

type CollectiveConfig = { key: string; label: string; storyUrl: string; line: string; proof: string; nextStep?: "calendly" | "typeform" };

const COLLECTIVES_BY_PIPELINE: Record<number, CollectiveConfig> = {
  1: {
    key: "hammiyala",
    label: "Hammiyala Collective",
    storyUrl: HAMMIYALA_RAKESH_BROCHURE_URL,
    line: "For Hammiyala, pay close attention to the terrain, water, settlement context, access, and why the collective is being shaped in that landscape.",
    proof: "",
    nextStep: "typeform",
  },
  2: {
    key: "mumbai",
    label: "Mumbai Collective",
    storyUrl: "https://www.canva.com/design/DAFy6m9o82w/M9Q02GvniE7SsQs0D9k-pw/view?utm_content=DAFy6m9o82w&utm_campaign=designshare&utm_medium=link2&utm_source=uniquelinks&utlId=h7eabae59da",
    line: "For Mumbai, pay close attention to the location, access, surrounding context, built-form approach, and what participation in this landscape asks of a member.",
    proof: "",
  },
  3: {
    key: "poomaale2",
    label: "Poomaale Collective 2.0",
    storyUrl: "https://www.canva.com/design/DAESin37d1A/HipyO_KPA4eOLfnzQd33qg/view?utm_content=DAESin37d1A&utm_campaign=designshare&utm_medium=link&utm_source=editor",
    line: "For Poomaale 2.0, pay close attention to the slope, ecology, access, land-use context, and the shared participation model behind the collective.",
    proof: "",
  },
  4: {
    key: "bhopal",
    label: "Bhopal Collective",
    storyUrl: "https://www.canva.com/design/DAFA7pBf2Ps/dzZecTicRzkdUan3yQd5cQ/view",
    line: "For Bhopal, pay close attention to the land, water, access, ownership context, and the way the collective is structured around the site.",
    proof: "",
  },
  6: {
    key: "hyderabad",
    label: "Hyderabad Collective",
    storyUrl: "https://www.canva.com/design/DAEtWW1aqhU/CvJ4odXV4OLuBaHyAXHzxA/view?utm_content=DAEtWW1aqhU&utm_campaign=designshare&utm_medium=link2&utm_source=uniquelinks&utlId=hb2d0772275",
    line: "For Hyderabad, pay close attention to the site context, access, participation model, and how the collective is being shaped around the landscape.",
    proof: "",
  },
};

const NURTURE_STEPS: NurtureStep[] = [
  { day: 2, key: "day_02", templateName: "collective_journey_day_02_v2", whatsappTemplateId: "1072974968796539" },
  { day: 4, key: "day_04", templateName: "collective_journey_day_04_v2", whatsappTemplateId: "1408168268172858" },
  { day: 6, key: "day_06", templateName: "collective_journey_day_06_v2", whatsappTemplateId: "1730560394852959" },
  { day: 8, key: "day_08", templateName: "collective_journey_day_08_v2", whatsappTemplateId: "2417962418734002" },
  { day: 10, key: "day_10", templateName: "collective_journey_day_10_v2", whatsappTemplateId: "1639375957613553" },
  { day: 12, key: "day_12", templateName: "collective_journey_day_12_v2", whatsappTemplateId: "1096514256241736" },
  { day: 14, key: "day_14", templateName: "collective_journey_day_14_v2", whatsappTemplateId: "1048517414737004" },
];

function asString(value: unknown): string {
  return value == null ? "" : String(value).trim();
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
  const parsed = typeof deal.person_id === "number"
    ? deal.person_id
    : deal.person_id && typeof deal.person_id === "object"
      ? asNumber(deal.person_id.id)
      : null;
  return parsed && parsed > 0 ? parsed : null;
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

function usesVivekCalendlyPath(deal: Deal): boolean {
  const pipeline = pipelineId(deal) || 0;
  return [2, 4].includes(pipeline) || (pipeline === 1 && ownerId(deal) === VIVEK_USER_ID);
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

function primaryPhone(person: Person | null): string {
  const phones = [...(person?.phones || []), ...(person?.phone || [])];
  return asString(phones.find((entry) => entry.primary)?.value || phones[0]?.value);
}

function dealPhone(deal: Deal): string {
  return asString(deal.custom_fields?.[DEAL_FIELDS.phone] ?? deal[DEAL_FIELDS.phone]);
}

function firstName(deal: Deal, person: Person | null): string {
  const source = asString(person?.name || (typeof deal.person_id === "object" ? deal.person_id?.name : "") || deal.title);
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

function doneStatus(value: unknown): 0 | 1 {
  return value === true || value === 1 || value === "1" ? 1 : 0;
}

function timestampMs(value: unknown): number {
  const raw = asString(value);
  if (!raw) return 0;
  const parsed = Date.parse(raw.includes("T") ? raw : raw.replace(" ", "T") + "Z");
  return Number.isFinite(parsed) ? parsed : 0;
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

async function pipedriveV1(method: string, path: string, body?: Record<string, unknown>, query?: Record<string, unknown>) {
  const apiToken = await wmill.getVariable(PIPEDRIVE_VARIABLE_PATH);
  const url = new URL(`https://${DEFAULT_PIPEDRIVE_DOMAIN}.pipedrive.com/api/v1/${path.replace(/^\/+/, "")}`);
  url.searchParams.set("api_token", apiToken);
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(`Pipedrive v1 ${method} ${path} failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function pipedriveV2(method: string, path: string, body?: Record<string, unknown>, query?: Record<string, unknown>) {
  const apiToken = await wmill.getVariable(PIPEDRIVE_VARIABLE_PATH);
  const url = new URL(`https://${DEFAULT_PIPEDRIVE_DOMAIN}.pipedrive.com/api/v2/${path.replace(/^\/+/, "")}`);
  url.searchParams.set("api_token", apiToken);
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
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

async function pipedriveV2Raw(method: string, path: string, body?: Record<string, unknown>, query?: Record<string, unknown>) {
  const apiToken = await wmill.getVariable(PIPEDRIVE_VARIABLE_PATH);
  const url = new URL(`https://${DEFAULT_PIPEDRIVE_DOMAIN}.pipedrive.com/api/v2/${path.replace(/^\/+/, "")}`);
  url.searchParams.set("api_token", apiToken);
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(`Pipedrive v2 ${method} ${path} failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function getDeal(id: number): Promise<Deal> {
  const payload = await pipedriveV1("GET", `deals/${id}`);
  return payload.data as Deal;
}

async function getPerson(id: number): Promise<Person | null> {
  const payload = await pipedriveV2("GET", `persons/${id}`).catch(() => null);
  return payload || null;
}

async function listOpenDeals(maxDeals: number): Promise<Deal[]> {
  const deals: Deal[] = [];
  let start = 0;
  while (deals.length < maxDeals) {
    const payload = await pipedriveV1("GET", "deals", undefined, {
      status: "open",
      start,
      limit: Math.min(500, maxDeals - deals.length),
    });
    const page = Array.isArray(payload.data) ? (payload.data as Deal[]) : [];
    deals.push(...page);
    const pagination = payload.additional_data?.pagination;
    if (!pagination?.more_items_in_collection || !page.length) break;
    start = Number(pagination.next_start) || start + page.length;
  }
  return deals;
}

async function getDealActivities(dealId: number, done: 0 | 1 | null = null): Promise<Activity[]> {
  const payload = await pipedriveV1("GET", `deals/${dealId}/activities`, undefined, { limit: 500 });
  const activities = Array.isArray(payload.data) ? (payload.data as Activity[]) : [];
  if (done === null) return activities;
  return activities.filter((activity) => doneStatus(activity.done) === done);
}

function gisSentAt(activities: Activity[]): Date | null {
  const sent = activities
    .filter((activity) => asString(activity.subject) === GIS_SENT_ACTIVITY_SUBJECT)
    .map((activity) => timestampMs(activity.add_time || activity.due_date))
    .filter(Boolean)
    .sort((a, b) => a - b)[0];
  return sent ? new Date(sent) : null;
}

function activityDealId(activity: Activity): number | null {
  if (typeof activity.deal_id === "object") return asNumber(activity.deal_id?.id);
  return asNumber(activity.deal_id);
}

async function listGisSentActivityDealIds(maxActivities: number) {
  const dealIds: number[] = [];
  const seenDealIds = new Set<number>();
  let cursor = "";
  let scannedActivities = 0;

  while (scannedActivities < maxActivities) {
    const limit = Math.min(500, maxActivities - scannedActivities);
    const payload = await pipedriveV2Raw("GET", "activities", undefined, {
      owner_id: BEFOREST_ADMIN_USER_ID,
      done: true,
      sort_by: "add_time",
      sort_direction: "desc",
      limit,
      cursor,
    });
    const page = Array.isArray(payload.data) ? (payload.data as Activity[]) : [];
    scannedActivities += page.length;

    for (const activity of page) {
      if (asString(activity.subject) !== GIS_SENT_ACTIVITY_SUBJECT) continue;
      const dealId = activityDealId(activity);
      if (!dealId || seenDealIds.has(dealId)) continue;
      seenDealIds.add(dealId);
      dealIds.push(dealId);
    }

    const nextCursor =
      payload.additional_data?.next_cursor ||
      payload.additional_data?.pagination?.next_cursor ||
      payload.additional_data?.pagination?.next_start ||
      "";
    const hasMore =
      Boolean(payload.additional_data?.more_items_in_collection) ||
      Boolean(payload.additional_data?.pagination?.more_items_in_collection) ||
      Boolean(nextCursor);
    if (!hasMore || !nextCursor || !page.length) break;
    cursor = String(nextCursor);
  }

  return {
    checked_activities: scannedActivities,
    candidate_deal_ids: dealIds,
  };
}

function postGisTypeformSubmitted(activities: Activity[]): boolean {
  return activities.some(
    (activity) =>
      doneStatus(activity.done) === 1 &&
      [POST_GIS_TYPEFORM_SUBMITTED_ACTIVITY_SUBJECT, POST_BROCHURE_TYPEFORM_SUBMITTED_ACTIVITY_SUBJECT].includes(asString(activity.subject)),
  );
}

function vivekCalendlyBookingScheduled(deal: Deal, activities: Activity[]): boolean {
  if (!usesVivekCalendlyPath(deal)) return false;
  const reference = asString(deal.custom_fields?.[DEAL_FIELDS.meetingReferenceId] ?? deal[DEAL_FIELDS.meetingReferenceId]);
  const meetingDateTime = asString(deal.custom_fields?.[DEAL_FIELDS.oneOnOneMeetingDateTime] ?? deal[DEAL_FIELDS.oneOnOneMeetingDateTime]);
  return reference.startsWith("calendly:") && Boolean(meetingDateTime);
}

function nurtureGoalReached(deal: Deal, activities: Activity[]): boolean {
  return usesVivekCalendlyPath(deal)
    ? vivekCalendlyBookingScheduled(deal, activities)
    : postGisTypeformSubmitted(activities);
}

function nurtureGoalReason(deal: Deal, activities: Activity[]): string {
  return usesVivekCalendlyPath(deal)
    ? "Vivek Calendly booking already scheduled; completing nurture row."
    : "Post-GIS Typeform already submitted; completing nurture row.";
}

function activitySubject(step: NurtureStep): string {
  return `${NURTURE_ACTIVITY_PREFIX} - ${step.key}`;
}

function stepAlreadyLogged(activities: Activity[], step: NurtureStep): boolean {
  const subjects = [NURTURE_ACTIVITY_PREFIX, ...LEGACY_NURTURE_ACTIVITY_PREFIXES].map((prefix) => `${prefix} - ${step.key}`);
  return activities.some((activity) => doneStatus(activity.done) === 1 && subjects.includes(asString(activity.subject)));
}

function ageDaysSince(sentAt: Date, now: Date): number {
  return Math.floor((now.getTime() - sentAt.getTime()) / 86_400_000);
}

function ageBasedStepIndex(sentAt: Date, now: Date): number {
  const ageDays = ageDaysSince(sentAt, now);
  for (let index = NURTURE_STEPS.length - 1; index >= 0; index -= 1) {
    if (ageDays >= NURTURE_STEPS[index].day) return index;
  }
  return -1;
}

function dueStep(sentAt: Date, activities: Activity[], now: Date): NurtureStep | null {
  const stepIndex = ageBasedStepIndex(sentAt, now);
  if (stepIndex < 0) return null;
  const step = NURTURE_STEPS[stepIndex];
  if (stepAlreadyLogged(activities, step)) return null;
  return step;
}

function ageBasedStepIndexFromIso(journeySentAt: string, now = new Date()): number {
  const sentAt = new Date(journeySentAt);
  if (Number.isNaN(sentAt.getTime())) return -1;
  return ageBasedStepIndex(sentAt, now);
}

function nextDueAfterStep(journeySentAt: string, stepIndex: number): string | null {
  return dueAtFor(journeySentAt, stepIndex + 1);
}

function nextQueueStepIndex(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

function manualMessage(firstNameValue: string, collective: string, line: string, step: NurtureStep, nextStep?: "calendly" | "typeform"): string {
  const variants: Record<string, string[]> = {
    day_02: [
      `Hi ${firstNameValue},`,
      "",
      `Sharing the Collective Journey for ${collective} again.`,
      "",
      "It is the best starting point to understand the place, the land, the access, the people involved, and how the collective is taking shape.",
      "",
      line,
      "",
      "If it feels relevant after reading, you can request a conversation from the form at the end of the brochure.",
    ],
    day_04: [
      `Hi ${firstNameValue},`,
      "",
      `A meaningful conversation about ${collective} begins with the Collective Journey.`,
      "",
      "It gives you the context behind the land, the surroundings, the process, and the participation model, so the next conversation can be specific and considered.",
      "",
      line,
      "",
      "Once you have gone through it, you can request a conversation to move things forward from the form at the end of the brochure.",
    ],
    day_06: [
      `Hi ${firstNameValue},`,
      "",
      `If ${collective} is still of interest, spend some time with the Collective Journey.`,
      "",
      "It is meant to help you understand the place, process, people, and progress before deciding whether this collective is aligned with what you are looking for.",
      "",
      line,
      "",
      "If it is, use the request form at the end of the brochure. The team will then have the right context to speak with you.",
    ],
    day_08: [
      `Hi ${firstNameValue},`,
      "",
      `The next step for ${collective} is deliberately simple.`,
      "",
      "The Collective Journey is designed to be read before a conversation with the team. It lays out the ground context: land, ecology, access, ownership structure, participation model, and the stage at which the collective currently stands.",
      "",
      line,
      "",
      "If the journey feels aligned, you can request a conversation from the form at the end of the brochure.",
    ],
    day_10: [
      `Hi ${firstNameValue},`,
      "",
      `Most questions about ${collective} become clearer after the Collective Journey.`,
      "",
      "It gives you the ground view first: place, process, people, current progress, and what participation in the collective means.",
      "",
      line,
      "",
      "Open it when you can read it with attention. If it resonates, you can request a conversation from the form at the end of the brochure.",
    ],
    day_12: [
      `Hi ${firstNameValue},`,
      "",
      `Checking once more on ${collective}.`,
      "",
      "We ask prospective members to begin with the Collective Journey because it creates shared context before a conversation with the team.",
      "",
      line,
      "",
      "If you would like to take the next step, you can request a conversation from the form at the end of the brochure.",
    ],
    day_14: [
      `Hi ${firstNameValue},`,
      "",
      `Closing the loop on ${collective}.`,
      "",
      "If you are still considering it, the Collective Journey is the right place to return to. It brings together the place, model, people, and present stage of the collective.",
      "",
      line,
      "",
      "If it feels aligned, you can request a conversation to move things forward from the form at the end of the brochure.",
    ],
  };
  if (nextStep === "calendly") {
    variants[step.key][variants[step.key].length - 1] = "If it feels aligned, use Vivek's Calendly link inside the brochure to schedule a conversation.";
  }
  return variants[step.key].join("\n");
}

async function sendInteraktTemplate(plan: {
  recipient: InteraktRecipient;
  templateName: string;
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
        name: plan.templateName,
        languageCode: "en",
        bodyValues: plan.bodyValues,
        buttonValues: plan.buttonValues,
      },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.result === false) {
    throw new Error(`Interakt Collective Journey follow-up failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function createActivity(dealId: number, subject: string, note: string, done: 0 | 1, personIdValue?: number | null) {
  const payload = await pipedriveV1("POST", "activities", {
    deal_id: dealId,
    ...(personIdValue ? { person_id: personIdValue } : {}),
    user_id: BEFOREST_ADMIN_USER_ID,
    subject,
    type: "task",
    done,
    due_date: todayInTimezone("Asia/Kolkata"),
    note,
  });
  return payload.data;
}

function queueConfig(row: QueueRow, dealOwnerId: number | null = null) {
  const key = asString(row.collective_key);
  const label = asString(row.collective_label);
  const base = Object.values(COLLECTIVES_BY_PIPELINE).find((config) =>
    config.key === key || config.label === label
  ) || null;
  if (!base || base.key !== "hammiyala") return base;
  const vivekOwned = dealOwnerId === VIVEK_USER_ID;
  return {
    ...base,
    storyUrl: vivekOwned ? HAMMIYALA_VIVEK_BROCHURE_URL : HAMMIYALA_RAKESH_BROCHURE_URL,
    nextStep: vivekOwned ? "calendly" as const : "typeform" as const,
  };
}

function approvedBrochureUrl(config: { storyUrl: string }) {
  return config.storyUrl;
}

function dueAtFor(journeySentAt: string, stepIndex: number): string | null {
  const step = NURTURE_STEPS[stepIndex];
  if (!step) return null;
  const date = new Date(journeySentAt);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + step.day);
  return date.toISOString();
}

function isRetryableInteraktError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("wallet") || normalized.includes("recharge") || normalized.includes("rate limit");
}

async function ensureJourneyNurtureQueue() {
  const sql = wmill.datatable("main");
  await sql`
    CREATE TABLE IF NOT EXISTS collective_journey_nurture_queue (
      deal_id BIGINT PRIMARY KEY,
      person_id BIGINT,
      phone TEXT,
      lead_name TEXT,
      first_name TEXT,
      collective_key TEXT NOT NULL,
      collective_label TEXT NOT NULL,
      journey_url TEXT,
      journey_sent_at TIMESTAMPTZ NOT NULL,
      next_step_due_at TIMESTAMPTZ,
      step_index INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      last_interakt_message_id TEXT,
      last_template_name TEXT,
      last_sent_at TIMESTAMPTZ,
      last_activity_id BIGINT,
      manual_review_activity_id BIGINT,
      completed_at TIMESTAMPTZ,
      stopped_at TIMESTAMPTZ,
      stop_reason TEXT,
      last_error TEXT,
      raw_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute();
  await sql`CREATE INDEX IF NOT EXISTS idx_collective_journey_nurture_due ON collective_journey_nurture_queue (status, next_step_due_at)`.execute();
  await sql`CREATE INDEX IF NOT EXISTS idx_collective_journey_nurture_person ON collective_journey_nurture_queue (person_id)`.execute();
}

async function dueQueueRows(limit: number): Promise<QueueRow[]> {
  await ensureJourneyNurtureQueue();
  const sql = wmill.datatable("main");
  return await sql`
    SELECT *
    FROM collective_journey_nurture_queue
    WHERE status = 'active'
      AND step_index < ${NURTURE_STEPS.length}
      AND (
        (next_step_due_at IS NOT NULL AND next_step_due_at <= NOW())
        OR (step_index <= 0 AND journey_sent_at <= NOW() - INTERVAL '2 days')
        OR (step_index <= 1 AND journey_sent_at <= NOW() - INTERVAL '4 days')
        OR (step_index <= 2 AND journey_sent_at <= NOW() - INTERVAL '6 days')
        OR (step_index <= 3 AND journey_sent_at <= NOW() - INTERVAL '8 days')
        OR (step_index <= 4 AND journey_sent_at <= NOW() - INTERVAL '10 days')
        OR (step_index <= 5 AND journey_sent_at <= NOW() - INTERVAL '12 days')
        OR (step_index <= 6 AND journey_sent_at <= NOW() - INTERVAL '14 days')
      )
    ORDER BY next_step_due_at ASC, journey_sent_at ASC
    LIMIT ${Math.max(1, limit)}
  `.fetch();
}

async function upsertQueueFromDeal(deal: Deal, activities: Activity[], dryRun = false) {
  const dealId = Number(deal.id);
  const sentAt = gisSentAt(activities);
  if (!sentAt || nurtureGoalReached(deal, activities)) return { status: "skipped", deal_id: dealId };
  const config = collectiveForDeal(deal);
  if (!config) return { status: "skipped", reason: "Unsupported pipeline.", deal_id: dealId };
  const pid = personId(deal);
  const person = pid ? await getPerson(pid) : null;
  const rawPhone = primaryPhone(person) || dealPhone(deal);
  const firstNameValue = firstName(deal, person);
  const journeySentAt = sentAt.toISOString();
  const nextStepDueAt = dueAtFor(journeySentAt, 0);
  if (dryRun) {
    return {
      status: "would_queue",
      deal_id: dealId,
      person_id: pid,
      collective: config.label,
      journey_sent_at: journeySentAt,
      next_step_due_at: nextStepDueAt,
      has_phone: Boolean(rawPhone),
    };
  }
  const sql = wmill.datatable("main");
  await sql`
    INSERT INTO collective_journey_nurture_queue (
      deal_id, person_id, phone, lead_name, first_name, collective_key, collective_label,
      journey_url, journey_sent_at, next_step_due_at, step_index, status, raw_payload, updated_at
    )
    VALUES (
      ${dealId}::BIGINT,
      ${pid}::BIGINT,
      ${rawPhone},
      ${asString(deal.title)},
      ${firstNameValue},
      ${config.key},
      ${config.label},
      ${config.storyUrl},
      ${journeySentAt}::TEXT::TIMESTAMPTZ,
      ${nextStepDueAt}::TEXT::TIMESTAMPTZ,
      0,
      'active',
      ${{
        source: "backfill_from_pipedrive",
      }}::JSONB,
      NOW()
    )
    ON CONFLICT (deal_id) DO NOTHING
  `.execute();
  return { status: "queued", deal_id: dealId, next_step_due_at: nextStepDueAt };
}

async function backfillQueueFromPipedrive(maxDeals: number, maxBackfillActivities: number, dryRun = false) {
  if (!dryRun) await ensureJourneyNurtureQueue();
  const gisLabels = await loadGisLabelIds();
  const deals = await listOpenDeals(maxDeals);
  const labelCandidates = deals.filter((deal) => {
    const labels = labelIds(deal);
    return labels.includes(gisLabels.gisSent) || labels.includes(gisLabels.gisOpened);
  });

  const activityScan = await listGisSentActivityDealIds(maxBackfillActivities);
  const candidateDealIds = new Set<number>();
  for (const deal of labelCandidates) {
    const dealId = asNumber(deal.id);
    if (dealId) candidateDealIds.add(dealId);
  }
  for (const dealId of activityScan.candidate_deal_ids) candidateDealIds.add(dealId);

  const results = [];
  for (const dealId of Array.from(candidateDealIds).slice(0, maxDeals)) {
    const existingDeal = labelCandidates.find((deal) => Number(deal.id) === dealId);
    const deal = existingDeal || await getDeal(dealId);
    const activities = await getDealActivities(Number(deal.id), null);
    results.push(await upsertQueueFromDeal(deal, activities, dryRun));
  }
  return {
    checked_deals: deals.length,
    checked_activities: activityScan.checked_activities,
    label_candidate_deals: labelCandidates.length,
    activity_candidate_deals: activityScan.candidate_deal_ids.length,
    candidate_deals: candidateDealIds.size,
    capped_candidate_deals: Math.min(candidateDealIds.size, maxDeals),
    results,
  };
}

async function updateQueueAfterSend(row: QueueRow, sentStepIndex: number, response: any, activityId: number | null) {
  const dealId = Number(row.deal_id);
  const nextIndex = sentStepIndex + 1;
  const nextDueAt = nextDueAfterStep(asString(row.journey_sent_at), sentStepIndex);
  const nextStatus = nextDueAt ? "active" : "exhausted";
  const sql = wmill.datatable("main");
  await sql`
    UPDATE collective_journey_nurture_queue
    SET step_index = ${nextIndex},
        status = ${nextStatus},
        next_step_due_at = ${nextDueAt}::TEXT::TIMESTAMPTZ,
        last_interakt_message_id = ${asString(response?.id)},
        last_template_name = ${NURTURE_STEPS[sentStepIndex]?.templateName || ""},
        last_sent_at = NOW(),
        last_activity_id = ${activityId}::BIGINT,
        updated_at = NOW()
    WHERE deal_id = ${dealId}::BIGINT
  `.execute();
}

async function markQueueRetryable(row: QueueRow, error: string) {
  const retryAt = new Date(Date.now() + 60 * 60_000).toISOString();
  const sql = wmill.datatable("main");
  await sql`
    UPDATE collective_journey_nurture_queue
    SET status = 'active',
        next_step_due_at = ${retryAt}::TEXT::TIMESTAMPTZ,
        last_error = ${error},
        updated_at = NOW()
    WHERE deal_id = ${Number(row.deal_id)}::BIGINT
  `.execute();
}

async function markQueueManualReview(row: QueueRow, error: string, activityId: number | null) {
  const sql = wmill.datatable("main");
  await sql`
    UPDATE collective_journey_nurture_queue
    SET status = 'manual_review',
        next_step_due_at = NULL,
        last_error = ${error},
        manual_review_activity_id = ${activityId}::BIGINT,
        updated_at = NOW()
    WHERE deal_id = ${Number(row.deal_id)}::BIGINT
  `.execute();
}

async function markQueueStopped(row: QueueRow, reason: string, status = "stopped") {
  const sql = wmill.datatable("main");
  await sql`
    UPDATE collective_journey_nurture_queue
    SET status = ${status},
        next_step_due_at = NULL,
        stopped_at = NOW(),
        stop_reason = ${reason},
        last_error = ${reason},
        updated_at = NOW()
    WHERE deal_id = ${Number(row.deal_id)}::BIGINT
  `.execute();
}

async function validateQueueRowBeforeSend(row: QueueRow, dryRun = false) {
  const dealId = Number(row.deal_id);
  let deal: Deal | null = null;

  try {
    deal = await getDeal(dealId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const reason = `Pipedrive deal is not available; stopping nurture row. ${message}`;
    if (!dryRun) await markQueueStopped(row, reason);
    return {
      status: dryRun ? "would_stop" : "stopped",
      reason,
      deal_id: dealId,
    };
  }

  const dealStatus = asString(deal.status).toLowerCase();
  if (dealStatus && dealStatus !== "open") {
    const reason = `Pipedrive deal status is ${asString(deal.status) || "unknown"}; stopping nurture row.`;
    if (!dryRun) await markQueueStopped(row, reason);
    return {
      status: dryRun ? "would_stop" : "stopped",
      reason,
      deal_id: dealId,
      deal_status: deal.status || null,
    };
  }

  let activities: Activity[] = [];
  try {
    activities = await getDealActivities(dealId, null);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const reason = `Could not verify Pipedrive activities before nurture send; retrying. ${message}`;
    if (!dryRun) await markQueueRetryable(row, reason);
    return {
      status: dryRun ? "would_retry_verification" : "retry_later",
      reason,
      deal_id: dealId,
    };
  }

  if (nurtureGoalReached(deal, activities)) {
    const reason = nurtureGoalReason(deal, activities);
    if (!dryRun) await markQueueStopped(row, reason, "completed");
    return {
      status: dryRun ? "would_complete" : "completed",
      reason,
      deal_id: dealId,
    };
  }

  return {
    status: "eligible",
    deal_id: dealId,
    owner_id: ownerId(deal),
  };
}

function buildQueuePlan(row: QueueRow, dealOwnerId: number | null) {
  const dealId = Number(row.deal_id);
  const nextUnsentIndex = nextQueueStepIndex(row.step_index);
  const ageStepIndex = ageBasedStepIndexFromIso(asString(row.journey_sent_at));
  if (ageStepIndex < 0) return { status: "ignored", reason: "No nurture step due.", deal_id: dealId };
  if (nextUnsentIndex > ageStepIndex) {
    return {
      status: "ignored",
      reason: "Current age-based nurture step already sent.",
      deal_id: dealId,
      step_index: nextUnsentIndex,
      age_step_index: ageStepIndex,
    };
  }
  const stepIndex = ageStepIndex;
  const step = NURTURE_STEPS[stepIndex];
  if (!step) return { status: "ignored", reason: "No nurture step configured.", deal_id: dealId };
  const config = queueConfig(row, dealOwnerId);
  if (!config) return { status: "ignored", reason: "Unsupported collective in queue.", deal_id: dealId };

  const firstNameValue = asString(row.first_name) || "there";
  const contextLine = [config.line, config.proof].filter(Boolean).join(" ");
  const tokenPayload = {
    deal_id: dealId,
    person_id: asNumber(row.person_id),
    collective: config.key,
    destination_url: approvedBrochureUrl(config),
    source: `interakt_collective_journey_nurture_${step.key}`,
    iat: new Date().toISOString(),
  };
  return {
    status: "due",
    deal_id: dealId,
    deal_title: asString(row.lead_name) || null,
    person_id: asNumber(row.person_id),
    collective: config.label,
    step,
    step_index: stepIndex,
    previous_step_index: nextUnsentIndex,
    recipient: interaktRecipient(asString(row.phone)),
    raw_phone_present: Boolean(asString(row.phone)),
    template_name: step.templateName,
    whatsapp_template_id: step.whatsappTemplateId,
    body_values: [firstNameValue, config.label, contextLine],
    token_payload: tokenPayload,
    callback_data: `pipedrive_deal:${dealId}:collective_journey_nurture:${step.key}`,
    manual_message: manualMessage(firstNameValue, config.label, contextLine, step, config.nextStep),
  };
}

async function buildPlan(deal: Deal, activities: Activity[], now: Date) {
  const dealId = Number(deal.id);
  if (nurtureGoalReached(deal, activities)) {
    return { status: "ignored", reason: nurtureGoalReason(deal, activities), deal_id: dealId };
  }
  const sentAt = gisSentAt(activities);
  if (!sentAt) return { status: "ignored", reason: "GIS sent activity not found.", deal_id: dealId };
  const step = dueStep(sentAt, activities, now);
  if (!step) return { status: "ignored", reason: "No nurture step due.", deal_id: dealId, gis_sent_at: sentAt.toISOString() };

  const config = collectiveForDeal(deal);
  if (!config) return { status: "ignored", reason: "Unsupported pipeline.", deal_id: dealId };

  const pid = personId(deal);
  const person = pid ? await getPerson(pid) : null;
  const rawPhone = primaryPhone(person) || dealPhone(deal);
  const recipient = interaktRecipient(rawPhone);
  const token = await trackingToken({
    deal_id: dealId,
    person_id: pid,
    collective: config.key,
    destination_url: approvedBrochureUrl(config),
    source: `interakt_collective_story_unopened_${step.key}`,
    iat: new Date().toISOString(),
  });

  const firstNameValue = firstName(deal, person);
  const contextLine = [config.line, config.proof].filter(Boolean).join(" ");
  return {
    status: "due",
    deal_id: dealId,
    deal_title: deal.title || null,
    person_id: pid,
    collective: config.label,
    gis_sent_at: sentAt.toISOString(),
    step,
    recipient,
    raw_phone_present: Boolean(rawPhone),
    template_name: step.templateName,
    whatsapp_template_id: step.whatsappTemplateId,
    body_values: [firstNameValue, config.label, contextLine],
    button_values: { "0": [token] },
    callback_data: `pipedrive_deal:${dealId}:collective_story_unopened:${step.key}`,
    tracking_url: `${PUBLIC_TRACKING_BASE_URL}?t=${encodeURIComponent(token)}`,
    manual_message: manualMessage(firstNameValue, config.label, contextLine, step, config.nextStep),
  };
}

export async function main(
  dry_run = false,
  max_deals = 500,
  max_sends = 50,
) {
  const rows = await dueQueueRows(max_deals);

  const results: any[] = [];
  let sentCount = 0;

  for (const row of rows) {
    if (!dry_run && sentCount >= max_sends) {
      results.push({ status: "skipped", reason: "max_sends reached.", deal_id: Number(row.deal_id) });
      continue;
    }
    const dealId = Number(row.deal_id);
    const validation = await validateQueueRowBeforeSend(row, dry_run);
    if (validation.status !== "eligible") {
      results.push(validation);
      continue;
    }

    const plan = buildQueuePlan(row, asNumber(validation.owner_id));
    if (plan.status !== "due") {
      results.push(plan);
      continue;
    }
    const token = await trackingToken(plan.token_payload);
    const trackingUrl = `${PUBLIC_TRACKING_BASE_URL}?t=${encodeURIComponent(token)}`;
    const buttonValues = { "0": [token] };

    if (dry_run) {
      results.push({
        dry_run: true,
        status: "would_send",
        ...plan,
        button_values: buttonValues,
        tracking_url: trackingUrl,
      });
      continue;
    }

    try {
      assertRecipientReady(plan.recipient, plan.raw_phone_present ? "present" : "");
      const interaktResponse = await sendInteraktTemplate({
        recipient: plan.recipient,
        templateName: plan.template_name,
        bodyValues: plan.body_values,
        buttonValues,
        callbackData: plan.callback_data,
      });
      const activity = await createActivity(
        dealId,
        activitySubject(plan.step),
        [
          `Sent Collective Journey second-form follow-up ${plan.step.key}.`,
          `Collective: ${plan.collective}`,
          `Template: ${plan.template_name}`,
          `Tracking URL: ${escapeHtml(trackingUrl)}`,
          "",
          "<strong>Message sent</strong>",
          `<pre>${escapeHtml(plan.manual_message)}</pre>`,
        ].join("<br>"),
        1,
        plan.person_id,
      );
      await updateQueueAfterSend(row, plan.step_index, interaktResponse, Number(activity?.id) || null);
      sentCount += 1;
      results.push({
        status: "sent",
        deal_id: dealId,
        step: plan.step.key,
        collective: plan.collective,
        interakt_response: interaktResponse,
        audit_activity_id: Number(activity?.id) || null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isRetryableInteraktError(message)) {
        await markQueueRetryable(row, message);
        results.push({
          status: "retry_later",
          deal_id: dealId,
          step: plan.step.key,
          error: message,
        });
        continue;
      }
      const activity = await createActivity(
        dealId,
        "WhatsApp failed to deliver",
        [
          "Collective Journey follow-up failed. Please send this manually from WhatsApp Web.",
          `Reason: ${escapeHtml(message)}`,
          `Template: ${escapeHtml(plan.template_name)}`,
          `Step: ${escapeHtml(plan.step.key)}`,
          "",
          "<strong>Copy-paste message</strong>",
          `<pre>${escapeHtml(plan.manual_message)}</pre>`,
        ].join("<br>"),
        0,
        plan.person_id,
      );
      results.push({
        status: "failed",
        deal_id: dealId,
        step: plan.step.key,
        error: message,
        manual_review_activity_id: Number(activity?.id) || null,
      });
      await markQueueManualReview(row, message, Number(activity?.id) || null);
    }
  }

  return {
    dry_run,
    source: "collective_journey_nurture_queue",
    checked_deals: 0,
    candidate_deals: 0,
    due_queue_rows: rows.length,
    sent_count: sentCount,
    results,
  };
}
