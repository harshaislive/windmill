import * as wmill from "windmill-client";
import { createHash } from "node:crypto";

const PIPEDRIVE_VARIABLE_PATH = "f/collectives/zoom_collective_to_pipedrive/pipedrive_api_key";
const MAILCHIMP_RESOURCE_PATH = "f/sales/mailchimp_fallback";
const MAILCHIMP_AUDIENCE_ID_PATH = "f/sales/mailchimp_fallback/audience_id";
const MAILCHIMP_FROM_NAME_PATH = "f/sales/mailchimp_fallback/from_name";
const MAILCHIMP_REPLY_TO_PATH = "f/sales/mailchimp_fallback/reply_to";
const DEFAULT_PIPEDRIVE_DOMAIN = "beforest";
const BEFOREST_ADMIN_USER_ID = 18891506;
const VIVEK_USER_ID = 22251956;
const HAMMIYALA_VIVEK_BROCHURE_URL = "https://canva.link/vjfj5yn7486ujqb";
const HAMMIYALA_RAKESH_BROCHURE_URL = "https://canva.link/sg93jjmd2i08ji3";

const GIS_SENT_ACTIVITY_SUBJECT = "GIS story link sent";
const POST_BROCHURE_SUBJECTS = new Set(["Post-brochure Typeform submitted", "Post-GIS Typeform submitted"]);
const WHATSAPP_FAILURE_SUBJECTS = new Set(["WhatsApp failed to deliver", "WhatsApp failed - send manually"]);
const NURTURE_SENT_PREFIXES = [
  "Collective Journey second-form follow-up sent",
  "Collective Story second-form follow-up sent",
  "Collective Story unopened follow-up sent",
];
const EMAIL_FALLBACK_PREFIXES = [
  "Email fallback sent via Mailchimp - nurture",
  "Email fallback queued in Mailchimp - nurture",
  "Email fallback failed in Mailchimp - nurture",
];

const DEAL_FIELDS = {
  phone: "7f1ebc80670dad0d9f6ea3d5f2585c923395305a",
  email: "2f592ab838e053d66de919b9b186e55e983747c9",
  oneOnOneMeetingDateTime: "d6fd8c9877d20bfd678ecb37f21e5b33bd2717fd",
  meetingReferenceId: "cd1b8c89ded44fccbf04ded59928cc9fc3ae0e50",
};

type NurtureStepKey = "day_02" | "day_04" | "day_06" | "day_08" | "day_10" | "day_12" | "day_14";

type Deal = Record<string, any> & {
  id?: number;
  title?: string;
  status?: string;
  pipeline_id?: number | { id?: number };
  person_id?: number | { id?: number; name?: string };
  custom_fields?: Record<string, unknown>;
};

type Person = {
  id?: number;
  name?: string;
  emails?: Array<{ value?: string; primary?: boolean }>;
  email?: Array<{ value?: string; primary?: boolean }> | string;
  phones?: Array<{ value?: string; primary?: boolean }>;
  phone?: Array<{ value?: string; primary?: boolean }> | string;
};

type Collective = {
  key: string;
  label: string;
  pipelineId: number;
  brochureUrl: string;
  contextLine: string;
  nextStep?: "calendly" | "typeform";
};

type MailchimpConfig = {
  apiKey: string;
  server: string;
  audienceId: string;
  fromName: string;
  replyTo: string;
};

type Candidate = {
  deal: Deal;
  person: Person | null;
  failure: any;
  collective: Collective;
  stepKey: NurtureStepKey;
  email: string;
  phone: string;
  firstName: string;
  inboundCount: number;
  manualMessage: string;
};

const COLLECTIVES: Record<number, Collective> = {
  1: {
    key: "hammiyala",
    label: "Hammiyala Collective",
    pipelineId: 1,
    brochureUrl: HAMMIYALA_RAKESH_BROCHURE_URL,
    contextLine: "For Hammiyala, pay close attention to the terrain, water, settlement context, access, and why the collective is being shaped in that landscape.",
    nextStep: "typeform",
  },
  2: {
    key: "mumbai",
    label: "Mumbai Collective",
    pipelineId: 2,
    brochureUrl: "https://www.canva.com/design/DAFy6m9o82w/M9Q02GvniE7SsQs0D9k-pw/view?utm_content=DAFy6m9o82w&utm_campaign=designshare&utm_medium=link2&utm_source=uniquelinks&utlId=h7eabae59da",
    contextLine: "For Mumbai, pay close attention to the location, access, surrounding context, built-form approach, and what participation in this landscape asks of a member.",
  },
  3: {
    key: "poomaale2",
    label: "Poomaale Collective 2.0",
    pipelineId: 3,
    brochureUrl: "https://www.canva.com/design/DAESin37d1A/HipyO_KPA4eOLfnzQd33qg/view?utm_content=DAESin37d1A&utm_campaign=designshare&utm_medium=link&utm_source=editor",
    contextLine: "For Poomaale 2.0, pay close attention to the slope, ecology, access, land-use context, and the shared participation model behind the collective.",
  },
  4: {
    key: "bhopal",
    label: "Bhopal Collective",
    pipelineId: 4,
    brochureUrl: "https://www.canva.com/design/DAFA7pBf2Ps/dzZecTicRzkdUan3yQd5cQ/view",
    contextLine: "For Bhopal, pay close attention to the land, water, access, ownership context, and the way the collective is structured around the site.",
  },
  6: {
    key: "hyderabad",
    label: "Hyderabad Collective",
    pipelineId: 6,
    brochureUrl: "https://www.canva.com/design/DAEtWW1aqhU/CvJ4odXV4OLuBaHyAXHzxA/view?utm_content=DAEtWW1aqhU&utm_campaign=designshare&utm_medium=link2&utm_source=uniquelinks&utlId=hb2d0772275",
    contextLine: "For Hyderabad, pay close attention to the site context, access, participation model, and how the collective is being shaped around the landscape.",
  },
};

const STEP_KEYS: NurtureStepKey[] = ["day_02", "day_04", "day_06", "day_08", "day_10", "day_12", "day_14"];

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(asString(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function vivekCalendlyBookingScheduled(deal: Deal, activities: any[]): boolean {
  if (!usesVivekCalendlyPath(deal)) return false;
  const reference = asString(deal.custom_fields?.[DEAL_FIELDS.meetingReferenceId] ?? deal[DEAL_FIELDS.meetingReferenceId]);
  const meetingDateTime = asString(deal.custom_fields?.[DEAL_FIELDS.oneOnOneMeetingDateTime] ?? deal[DEAL_FIELDS.oneOnOneMeetingDateTime]);
  return reference.startsWith("calendly:") && Boolean(meetingDateTime);
}

function nurtureGoalReached(deal: Deal, activities: any[]): boolean {
  return usesVivekCalendlyPath(deal)
    ? vivekCalendlyBookingScheduled(deal, activities)
    : activities.some((activity) => POST_BROCHURE_SUBJECTS.has(asString(activity.subject)));
}

function escapeHtml(value: unknown): string {
  return asString(value).replace(/[<>&"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "\"": "&quot;" }[char] || char));
}

function digits(value: unknown): string {
  return asString(value).replace(/\D/g, "");
}

function lastTen(value: unknown): string {
  const valueDigits = digits(value);
  return valueDigits.length > 10 ? valueDigits.slice(-10) : valueDigits;
}

function pipelineId(deal: Deal): number | null {
  if (typeof deal.pipeline_id === "object") return asNumber(deal.pipeline_id?.id);
  return asNumber(deal.pipeline_id);
}

function ownerId(deal: Deal): number | null {
  const raw = deal.owner_id?.id ?? deal.owner_id?.value ?? deal.owner_id ?? deal.user_id?.id ?? deal.user_id;
  return asNumber(raw);
}

function usesVivekCalendlyPath(deal: Deal): boolean {
  const pipeline = pipelineId(deal) || 0;
  return [2, 4].includes(pipeline) || (pipeline === 1 && ownerId(deal) === VIVEK_USER_ID);
}

function collectiveForDeal(deal: Deal): Collective | null {
  const base = COLLECTIVES[Number(pipelineId(deal))];
  if (!base || base.key !== "hammiyala") return base || null;
  const vivekOwned = ownerId(deal) === VIVEK_USER_ID;
  return {
    ...base,
    brochureUrl: vivekOwned ? HAMMIYALA_VIVEK_BROCHURE_URL : HAMMIYALA_RAKESH_BROCHURE_URL,
    nextStep: vivekOwned ? "calendly" : "typeform",
  };
}

function personId(deal: Deal): number | null {
  if (typeof deal.person_id === "object") return asNumber(deal.person_id?.id);
  return asNumber(deal.person_id);
}

function dateMs(value: unknown): number {
  const text = asString(value);
  if (!text) return 0;
  const normalized = text.includes("T") ? text : text.replace(" ", "T");
  const parsed = new Date(normalized.endsWith("Z") || /[+-]\d\d:?\d\d$/.test(normalized) ? normalized : `${normalized}Z`).getTime();
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

function batchStamp(timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}${get("month")}${get("day")}_${get("hour")}${get("minute")}`;
}

function subscriberHash(email: string): string {
  return createHash("md5").update(email.trim().toLowerCase()).digest("hex");
}

function isProbablyValidEmail(email: string): boolean {
  const value = asString(email).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) return false;
  if (value.endsWith(".con")) return false;
  return true;
}

function emailOf(person: Person | null): string {
  const raw = person?.email;
  if (typeof raw === "string") return asString(raw).toLowerCase();
  const emails = [...(person?.emails || []), ...((Array.isArray(raw) ? raw : []) || [])];
  return asString(emails.find((entry) => entry.primary)?.value || emails[0]?.value).toLowerCase();
}

function emailFor(deal: Deal, person: Person | null): string {
  return emailOf(person) || asString(deal.custom_fields?.[DEAL_FIELDS.email] || deal[DEAL_FIELDS.email]).toLowerCase();
}

function phoneOf(deal: Deal, person: Person | null): string {
  const rawPhone = person?.phone;
  const phones = [...(person?.phones || []), ...((Array.isArray(rawPhone) ? rawPhone : []) || [])];
  return asString(phones.find((entry) => entry.primary)?.value || phones[0]?.value || rawPhone || deal.custom_fields?.[DEAL_FIELDS.phone] || deal[DEAL_FIELDS.phone]);
}

function firstName(deal: Deal, person: Person | null): string {
  return asString(person?.name || deal.title).split(/\s+/).filter(Boolean)[0] || "there";
}

function extractStep(activity: any): NurtureStepKey | null {
  const blob = `${asString(activity.subject)} ${asString(activity.note)}`.toLowerCase();
  const match = blob.match(/day[_\s-]?(02|04|06|08|10|12|14)/);
  if (!match) return null;
  const key = `day_${match[1]}` as NurtureStepKey;
  return STEP_KEYS.includes(key) ? key : null;
}

function isNurtureFailure(activity: any): boolean {
  const subject = asString(activity.subject);
  const note = asString(activity.note).toLowerCase();
  return WHATSAPP_FAILURE_SUBJECTS.has(subject) && (note.includes("collective journey follow-up failed") || note.includes("collective story") || Boolean(extractStep(activity)));
}

function isNurtureSentForStep(activity: any, stepKey: NurtureStepKey): boolean {
  const subject = asString(activity.subject);
  return NURTURE_SENT_PREFIXES.some((prefix) => subject === `${prefix} - ${stepKey}`) || subject.toLowerCase().includes(`nurture ${stepKey}`);
}

function isEmailFallbackForStep(activity: any, stepKey: NurtureStepKey): boolean {
  const subject = asString(activity.subject);
  return EMAIL_FALLBACK_PREFIXES.some((prefix) => subject === `${prefix} ${stepKey}`);
}

function isOwnerOrManualTouchpoint(activity: any): boolean {
  const subject = asString(activity.subject).toLowerCase();
  return (
    subject === "mail & zoom invite sent" ||
    subject === "zoom" ||
    /^call\b/.test(subject) ||
    subject.includes("whatsapp chat") ||
    subject.includes("whatsapp conversation") ||
    subject.includes("review post-brochure") ||
    subject.includes("review post-journey") ||
    subject.includes("post-brochure acknowledgement sent")
  );
}

function manualMessage(firstNameValue: string, collective: string, line: string, stepKey: NurtureStepKey, nextStep?: "calendly" | "typeform"): string {
  const variants: Record<NurtureStepKey, string[]> = {
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
      `A quick reminder to go through the ${collective} Collective Journey.`,
      "",
      "It is meant to answer the first layer of questions before you speak with the team.",
      "",
      line,
      "",
      "The conversation request form is available at the end of the brochure if you want to move ahead.",
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
    variants[stepKey][variants[stepKey].length - 1] = "If it feels aligned, use Vivek's Calendly link inside the brochure to schedule a conversation.";
  }
  return variants[stepKey].join("\n");
}

async function pipedriveRequest(
  method: string,
  path: string,
  options: { params?: Record<string, unknown>; body?: Record<string, unknown>; apiVersion?: "v1" | "v2" } = {},
): Promise<any> {
  const apiToken = await wmill.getVariable(PIPEDRIVE_VARIABLE_PATH);
  const url = new URL(`https://${DEFAULT_PIPEDRIVE_DOMAIN}.pipedrive.com/api/${options.apiVersion || "v1"}/${path.replace(/^\/+/, "")}`);
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
    throw new Error(`Pipedrive ${method} ${path} failed: ${response.status} ${JSON.stringify(payload).slice(0, 800)}`);
  }
  return payload.data;
}

async function listOpenDeals(maxDeals: number): Promise<Deal[]> {
  const deals: Deal[] = [];
  let start = 0;
  while (deals.length < maxDeals) {
    const page = await pipedriveRequest("GET", "deals", {
      params: { status: "open", sort: "update_time DESC", start, limit: Math.min(500, maxDeals - deals.length) },
    }).catch(() => []);
    if (!Array.isArray(page) || page.length === 0) break;
    deals.push(...page);
    if (page.length < Math.min(500, maxDeals - deals.length + page.length)) break;
    start += page.length;
  }
  return deals;
}

async function getPerson(id: number | null): Promise<Person | null> {
  if (!id) return null;
  return await pipedriveRequest("GET", `persons/${id}`).catch(() => null);
}

async function dealActivities(dealId: number): Promise<any[]> {
  const activities = await pipedriveRequest("GET", `deals/${dealId}/activities`, {
    params: { limit: 500 },
  }).catch(() => []);
  return Array.isArray(activities) ? activities : [];
}

async function createActivity(dealId: number, subject: string, note: string, done: 0 | 1, personIdValue: number | null) {
  return await pipedriveRequest("POST", "activities", {
    body: {
      deal_id: dealId,
      ...(personIdValue ? { person_id: personIdValue } : {}),
      user_id: BEFOREST_ADMIN_USER_ID,
      subject,
      type: "task",
      done,
      due_date: todayInTimezone("Asia/Kolkata"),
      note,
    },
  });
}

async function inboundAfter(phone: string, sinceMs: number): Promise<any[]> {
  const phoneKey = lastTen(phone);
  if (!phoneKey || !sinceMs) return [];
  const sinceIso = new Date(sinceMs).toISOString();
  const sql = wmill.datatable("main");
  const rows = await sql`
    SELECT raw_event_id, received_at, event_timestamp, phone_number, action, webhook_type, message_status
    FROM interakt_inbound_webhook_raw_events
    WHERE RIGHT(REGEXP_REPLACE(COALESCE(phone_number, ''), '\\D', '', 'g'), 10) = ${phoneKey}
      AND COALESCE(event_timestamp, received_at) >= ${sinceIso}::TIMESTAMPTZ
      AND COALESCE(message_status, '') = ''
      AND LOWER(COALESCE(webhook_type, '')) NOT LIKE '%failed%'
      AND LOWER(COALESCE(action, '')) <> 'message_failed'
    ORDER BY COALESCE(event_timestamp, received_at) DESC
    LIMIT 20
  `.fetch();
  return Array.isArray(rows) ? rows : [];
}

async function getMailchimpConfig(): Promise<MailchimpConfig | null> {
  const resource = await wmill.getResource(MAILCHIMP_RESOURCE_PATH, true).catch(() => null);
  const variableApiKey = asString(await wmill.getVariable("f/sales/mailchimp_fallback/api_key").catch(() => ""));
  const apiKey = asString(resource?.api_key && !asString(resource.api_key).startsWith("$var:") ? resource.api_key : variableApiKey);
  const server = asString(resource?.server || (apiKey.includes("-") ? apiKey.split("-").pop() : ""));
  const audienceId = asString(await wmill.getVariable(MAILCHIMP_AUDIENCE_ID_PATH).catch(() => ""));
  if (!apiKey || !server || !audienceId) return null;
  return {
    apiKey,
    server,
    audienceId,
    fromName: asString(await wmill.getVariable(MAILCHIMP_FROM_NAME_PATH).catch(() => "")) || "Team Beforest",
    replyTo: asString(await wmill.getVariable(MAILCHIMP_REPLY_TO_PATH).catch(() => "")) || "connect@beforest.co",
  };
}

async function mailchimpRequest(config: MailchimpConfig, method: string, path: string, body?: Record<string, unknown>) {
  const response = await fetch(`https://${config.server}.api.mailchimp.com/3.0/${path.replace(/^\/+/, "")}`, {
    method,
    headers: {
      authorization: `Basic ${Buffer.from(`windmill:${config.apiKey}`).toString("base64")}`,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.status === 204) return {};
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Mailchimp ${method} ${path} failed: ${response.status} ${JSON.stringify(payload).slice(0, 1000)}`);
  }
  return payload;
}

async function upsertMember(config: MailchimpConfig, candidate: Candidate, tags: string[]) {
  const hash = subscriberHash(candidate.email);
  await mailchimpRequest(config, "PUT", `lists/${config.audienceId}/members/${hash}`, {
    email_address: candidate.email,
    status_if_new: "subscribed",
    merge_fields: {
      FNAME: candidate.firstName === "there" ? "" : candidate.firstName,
    },
  });
  await mailchimpRequest(config, "POST", `lists/${config.audienceId}/members/${hash}/tags`, {
    tags: tags.map((name) => ({ name, status: "active" })),
  });
}

async function createStaticSegment(config: MailchimpConfig, name: string, emails: string[]) {
  return await mailchimpRequest(config, "POST", `lists/${config.audienceId}/segments`, {
    name,
    static_segment: emails,
  });
}

function publicCandidate(candidate: Candidate) {
  return {
    deal_id: Number(candidate.deal.id),
    title: candidate.deal.title,
    email: candidate.email.replace(/^(.{2}).*(@.*)$/, "$1...$2"),
    phone_tail: lastTen(candidate.phone),
    collective: candidate.collective.label,
    nurture_step: candidate.stepKey,
    failure_activity_id: Number(candidate.failure.id),
    failure_time: candidate.failure.add_time,
    inbound_count: candidate.inboundCount,
    reason: "nurture_whatsapp_failed_no_inbound",
  };
}

function plainText(candidate: Candidate): string {
  return [
    `${candidate.manualMessage}`,
    "",
    "Brochure link:",
    candidate.collective.brochureUrl,
    "",
    "We had tried sending this on WhatsApp, but the message may not have gone through. After reading, please use the conversation request form at the end of the brochure if you would like to speak with our team.",
    "",
    "Team Beforest",
  ].join("\n");
}

function htmlText(candidate: Candidate): string {
  const body = plainText(candidate)
    .split("\n")
    .map((line) => {
      if (line === candidate.collective.brochureUrl) {
        return `<p><a href="${escapeHtml(candidate.collective.brochureUrl)}">Open the ${escapeHtml(candidate.collective.label)} brochure</a></p>`;
      }
      return line ? `<p>${escapeHtml(line)}</p>` : "<br>";
    })
    .join("\n");
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#1f2933;line-height:1.5">${body}</body></html>`;
}

async function createAndSendCampaign(config: MailchimpConfig, groupKey: string, candidates: Candidate[], dryRun: boolean, sendCampaigns: boolean) {
  const skippedRecipients: Array<{ candidate: Candidate; error: string }> = [];
  const validCandidates: Candidate[] = [];
  for (const candidate of candidates) {
    if (isProbablyValidEmail(candidate.email)) {
      validCandidates.push(candidate);
    } else {
      skippedRecipients.push({ candidate, error: `Invalid recipient email: ${candidate.email}` });
    }
  }

  const sample = validCandidates[0] || candidates[0];
  const stamp = batchStamp("Asia/Kolkata");
  const segmentName = `Nurture WA failed fallback ${stamp} ${groupKey}`;
  const batchTag = `nurture_email_fallback_${stamp}`;
  const groupTag = `nurture_email_fallback_${sample.collective.key}_${sample.stepKey}`;
  const tags = ["nurture_email_fallback", batchTag, groupTag];
  const title = `Nurture WA failed fallback ${stamp} ${sample.collective.label} ${sample.stepKey}`;
  const subjectLine = `${sample.collective.label}: a quick follow-up`;
  const previewText = "We tried reaching you on WhatsApp. Here is the brochure link.";

  if (dryRun) {
    return {
      group_key: groupKey,
      would_create_segment: segmentName,
      would_create_campaign_title: title,
      subject_line: subjectLine,
      tags,
      recipients: validCandidates.map(publicCandidate),
      skipped_recipients: skippedRecipients.map((entry) => ({ ...publicCandidate(entry.candidate), error: entry.error })),
    };
  }

  const acceptedCandidates: Candidate[] = [];
  for (const candidate of validCandidates) {
    try {
      await upsertMember(config, candidate, tags);
      acceptedCandidates.push(candidate);
    } catch (error) {
      skippedRecipients.push({ candidate, error: error instanceof Error ? error.message : String(error) });
    }
  }

  if (acceptedCandidates.length === 0) {
    return {
      group_key: groupKey,
      status: "skipped_no_valid_recipients",
      sent: false,
      recipients: [],
      recipient_deal_ids: [],
      skipped_recipients: skippedRecipients.map((entry) => ({ ...publicCandidate(entry.candidate), error: entry.error })),
    };
  }

  const segment = await createStaticSegment(config, segmentName, acceptedCandidates.map((candidate) => candidate.email));
  const campaign = await mailchimpRequest(config, "POST", "campaigns", {
    type: "regular",
    recipients: {
      list_id: config.audienceId,
      segment_opts: {
        match: "all",
        conditions: [{ condition_type: "StaticSegment", field: "static_segment", op: "static_is", value: Number(segment.id) }],
      },
    },
    settings: {
      subject_line: subjectLine,
      preview_text: previewText,
      title,
      from_name: config.fromName,
      reply_to: config.replyTo,
    },
  });
  await mailchimpRequest(config, "PUT", `campaigns/${campaign.id}/content`, {
    html: htmlText(sample),
    plain_text: plainText(sample),
  });
  if (sendCampaigns) {
    await mailchimpRequest(config, "POST", `campaigns/${campaign.id}/actions/send`);
  }

  return {
    group_key: groupKey,
    segment_id: Number(segment.id),
    campaign_id: campaign.id,
    sent: sendCampaigns,
    recipients: acceptedCandidates.map(publicCandidate),
    recipient_deal_ids: acceptedCandidates.map((candidate) => Number(candidate.deal.id)),
    skipped_recipients: skippedRecipients.map((entry) => ({ ...publicCandidate(entry.candidate), error: entry.error })),
  };
}

async function buildCandidate(deal: Deal, activities: any[], daysMs: number): Promise<Candidate | null> {
  const dealId = Number(deal.id);
  if (!dealId || asString(deal.status).toLowerCase() !== "open") return null;
  const collective = collectiveForDeal(deal);
  if (!collective) return null;
  if (!activities.some((activity) => asString(activity.subject) === GIS_SENT_ACTIVITY_SUBJECT)) return null;
  if (nurtureGoalReached(deal, activities)) return null;

  const failures = activities
    .filter(isNurtureFailure)
    .filter((activity) => Date.now() - dateMs(activity.add_time) <= daysMs)
    .sort((left, right) => dateMs(right.add_time) - dateMs(left.add_time));

  for (const failure of failures) {
    const stepKey = extractStep(failure);
    if (!stepKey) continue;
    const failureTime = dateMs(failure.add_time);
    if (activities.some((activity) => isEmailFallbackForStep(activity, stepKey))) continue;
    if (activities.some((activity) => isNurtureSentForStep(activity, stepKey) && dateMs(activity.add_time) >= failureTime)) continue;
    if (activities.some((activity) => isOwnerOrManualTouchpoint(activity) && dateMs(activity.add_time) >= failureTime)) continue;

    const person = await getPerson(personId(deal));
    const email = emailFor(deal, person);
    const phone = phoneOf(deal, person);
    if (!email || !email.includes("@")) continue;

    const inboundRows = await inboundAfter(phone, failureTime);
    if (inboundRows.length > 0) continue;

    return {
      deal,
      person,
      failure,
      collective,
      stepKey,
      email,
      phone,
      firstName: firstName(deal, person),
      inboundCount: inboundRows.length,
      manualMessage: manualMessage(firstName(deal, person), collective.label, collective.contextLine, stepKey, collective.nextStep),
    };
  }

  return null;
}

async function logCampaignResult(candidate: Candidate, result: any, sendCampaigns: boolean) {
  const subject = `${sendCampaigns ? "Email fallback sent via Mailchimp" : "Email fallback queued in Mailchimp"} - nurture ${candidate.stepKey}`;
  const note = [
    sendCampaigns ? "Sent Mailchimp email fallback after day-wise nurture WhatsApp delivery failure." : "Queued Mailchimp email fallback after day-wise nurture WhatsApp delivery failure.",
    `Nurture step: ${escapeHtml(candidate.stepKey)}`,
    `Collective: ${escapeHtml(candidate.collective.label)}`,
    `Original failed WhatsApp activity: ${Number(candidate.failure.id)}`,
    `Mailchimp campaign: ${escapeHtml(result.campaign_id || "unknown")}`,
    `Mailchimp segment: ${escapeHtml(result.segment_id || "unknown")}`,
    `Recipient email: ${escapeHtml(candidate.email)}`,
    `Brochure URL: ${escapeHtml(candidate.collective.brochureUrl)}`,
    "",
    "<strong>Email copy</strong>",
    `<pre>${escapeHtml(plainText(candidate))}</pre>`,
  ].join("<br>");
  await createActivity(Number(candidate.deal.id), subject, note, 1, personId(candidate.deal));
}

async function logRecipientFailure(candidate: Candidate, message: string) {
  await createActivity(
    Number(candidate.deal.id),
    `Email fallback failed in Mailchimp - nurture ${candidate.stepKey}`,
    [
      "Mailchimp email fallback failed after day-wise nurture WhatsApp delivery failure.",
      `Nurture step: ${escapeHtml(candidate.stepKey)}`,
      `Collective: ${escapeHtml(candidate.collective.label)}`,
      `Original failed WhatsApp activity: ${Number(candidate.failure.id)}`,
      `Recipient email: ${escapeHtml(candidate.email)}`,
      `Error: ${escapeHtml(message)}`,
    ].join("<br>"),
    0,
    personId(candidate.deal),
  );
}

export async function main(dry_run = true, days = 7, max_deals = 1000, max_emails = 250, send_campaigns = true) {
  const daysMs = Number(days || 7) * 24 * 60 * 60 * 1000;
  const deals = await listOpenDeals(Number(max_deals || 1000));
  const candidates: Candidate[] = [];

  for (const deal of deals) {
    if (candidates.length >= Number(max_emails || 250)) break;
    const activities = await dealActivities(Number(deal.id));
    const candidate = await buildCandidate(deal, activities, daysMs);
    if (candidate) candidates.push(candidate);
  }

  const config = await getMailchimpConfig();
  const grouped = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const key = `nurture:${candidate.collective.key}:${candidate.collective.nextStep || "typeform"}:${candidate.stepKey}`;
    grouped.set(key, [...(grouped.get(key) || []), candidate]);
  }

  if (!config) {
    return {
      dry_run,
      status: candidates.length > 0 ? "blocked_missing_mailchimp_config" : "no_eligible_nurture_leads",
      eligible_count: candidates.length,
      eligible: candidates.map(publicCandidate),
    };
  }

  if (candidates.length === 0) {
    return { dry_run, status: "no_eligible_nurture_leads", checked_deals: deals.length };
  }

  const groups: any[] = [];
  const failures: any[] = [];
  const recipientFailures: any[] = [];

  for (const [groupKey, groupCandidates] of grouped.entries()) {
    try {
      const result = await createAndSendCampaign(config, groupKey, groupCandidates, dry_run, Boolean(send_campaigns));
      groups.push(result);
      for (const skipped of result.skipped_recipients || []) {
        recipientFailures.push({ group_key: groupKey, ...skipped });
      }
      if (!dry_run) {
        const sentDealIds = new Set((result.recipient_deal_ids || []).map((id: unknown) => Number(id)));
        for (const candidate of groupCandidates) {
          if (sentDealIds.has(Number(candidate.deal.id))) {
            await logCampaignResult(candidate, result, Boolean(send_campaigns));
          }
        }
        for (const skipped of result.skipped_recipients || []) {
          const candidate = groupCandidates.find((entry) => Number(entry.deal.id) === Number(skipped.deal_id));
          if (candidate) await logRecipientFailure(candidate, asString(skipped.error || "Recipient rejected by Mailchimp"));
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ group_key: groupKey, error: message, recipients: groupCandidates.map(publicCandidate) });
      if (!dry_run) {
        for (const candidate of groupCandidates) await logRecipientFailure(candidate, message);
      }
    }
  }

  const status = failures.length
    ? "completed_with_group_failures"
    : recipientFailures.length
      ? "completed_with_recipient_skips"
      : "completed";

  return {
    dry_run,
    status,
    checked_deals: deals.length,
    eligible_count: candidates.length,
    group_count: grouped.size,
    sent_or_planned_groups: groups,
    recipient_failures: recipientFailures,
    failures,
  };
}
