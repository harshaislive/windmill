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

const TYPEFORM_RECEIVED_SUBJECT = "Typeform received";
const POST_BROCHURE_SUBJECTS = new Set(["Post-brochure Typeform submitted", "Post-GIS Typeform submitted"]);
const EMAIL_FALLBACK_SUBJECTS = new Set([
  "Email fallback queued in Mailchimp",
  "Email fallback sent via Mailchimp",
  "Email fallback failed in Mailchimp",
]);
const WHATSAPP_FAILURE_SUBJECTS = new Set(["WhatsApp failed to deliver", "WhatsApp failed - send manually"]);
const WHATSAPP_SUCCESS_SUBJECTS = new Set([
  "Brochure fallback sent after Typeform",
  "Brochure sent after WhatsApp redirect",
  "Brochure sent from Typeform flow",
  "GIS story link sent",
  "1on1 team scheduling notice sent",
  "Post-brochure acknowledgement sent",
  "Brochure opened",
]);
const WHATSAPP_RETRY_SENT_SUBJECT = "WhatsApp retry sent after failure";

const DEAL_FIELDS = {
  phone: "7f1ebc80670dad0d9f6ea3d5f2585c923395305a",
  email: "2f592ab838e053d66de919b9b186e55e983747c9",
};

type Route = "brochure" | "one_on_one";

type Deal = Record<string, any> & {
  id?: number;
  title?: string;
  add_time?: string;
  status?: string;
  pipeline_id?: number | { id?: number };
  person_id?: number | { id?: number };
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
  ownerName: string;
  brochureUrl: string;
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
  typeform: any;
  collective: Collective;
  route: Route;
  email: string;
  phone: string;
  firstName: string;
  inboundCount: number;
  reason: string;
};

const COLLECTIVES: Record<number, Collective> = {
  1: {
    key: "hammiyala",
    label: "Hammiyala Collective",
    pipelineId: 1,
    ownerName: "Sai Rakesh",
    brochureUrl: HAMMIYALA_RAKESH_BROCHURE_URL,
    nextStep: "typeform",
  },
  2: {
    key: "mumbai",
    label: "Mumbai Collective",
    pipelineId: 2,
    ownerName: "Vivekanand",
    brochureUrl: "https://www.canva.com/design/DAFy6m9o82w/M9Q02GvniE7SsQs0D9k-pw/view?utm_content=DAFy6m9o82w&utm_campaign=designshare&utm_medium=link2&utm_source=uniquelinks&utlId=h7eabae59da",
  },
  3: {
    key: "poomaale2",
    label: "Poomaale Collective 2.0",
    pipelineId: 3,
    ownerName: "Sai Rakesh",
    brochureUrl: "https://www.canva.com/design/DAESin37d1A/HipyO_KPA4eOLfnzQd33qg/view?utm_content=DAESin37d1A&utm_campaign=designshare&utm_medium=link&utm_source=editor",
  },
  4: {
    key: "bhopal",
    label: "Bhopal Collective",
    pipelineId: 4,
    ownerName: "Vivekanand",
    brochureUrl: "https://www.canva.com/design/DAFA7pBf2Ps/dzZecTicRzkdUan3yQd5cQ/view",
  },
  6: {
    key: "hyderabad",
    label: "Hyderabad Collective",
    pipelineId: 6,
    ownerName: "Vivekanand",
    brochureUrl: "https://www.canva.com/design/DAEtWW1aqhU/CvJ4odXV4OLuBaHyAXHzxA/view?utm_content=DAEtWW1aqhU&utm_campaign=designshare&utm_medium=link2&utm_source=uniquelinks&utlId=hb2d0772275",
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

function collectiveForDeal(deal: Deal): Collective | null {
  const base = COLLECTIVES[Number(pipelineId(deal))];
  if (!base || base.key !== "hammiyala") return base || null;
  const vivekOwned = ownerId(deal) === VIVEK_USER_ID;
  return {
    ...base,
    ownerName: vivekOwned ? "Vivekanand" : "Sai Rakesh",
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

function subscriberHash(email: string): string {
  return createHash("md5").update(email.trim().toLowerCase()).digest("hex");
}

function isProbablyValidEmail(email: string): boolean {
  const value = asString(email).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) return false;
  if (value.endsWith(".con")) return false;
  return true;
}

function inferRoute(activity: any): Route | null {
  const blob = `${asString(activity.subject)} ${asString(activity.note)}`.toLowerCase();
  if (blob.includes("collective_1on1_team_scheduling_notice") || blob.includes("1on1")) return "one_on_one";
  if (blob.includes("brochure") || blob.includes("gis") || blob.includes("journey")) return "brochure";
  return null;
}

function isManualWhatsappChat(activity: any): boolean {
  const subject = asString(activity.subject).toLowerCase();
  return subject.includes("whatsapp chat") || subject.includes("whatsapp conversation") || subject === "whatsapp";
}

function isOwnerSalesTouchpoint(activity: any): boolean {
  const subject = asString(activity.subject).toLowerCase();
  return (
    subject === "mail & zoom invite sent" ||
    subject === "zoom" ||
    /^call\b/.test(subject)
  );
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

async function listRecentDeals(limit: number): Promise<Deal[]> {
  const deals = await pipedriveRequest("GET", "deals", {
    params: { status: "open", sort: "add_time DESC", start: 0, limit },
  });
  return Array.isArray(deals) ? deals : [];
}

async function getDeal(dealId: number): Promise<Deal | null> {
  return await pipedriveRequest("GET", `deals/${dealId}`).catch(() => null);
}

async function getPerson(id: number | null): Promise<Person | null> {
  if (!id) return null;
  return await pipedriveRequest("GET", `persons/${id}`).catch(() => null);
}

async function dealActivities(dealId: number): Promise<any[]> {
  const activities = await pipedriveRequest("GET", `deals/${dealId}/activities`, {
    params: { limit: 100 },
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

function nextStepLine(candidate: Candidate): string {
  return candidate.collective.nextStep === "calendly"
    ? "Once you have read through it, use Vivek's Calendly link inside the brochure to schedule a conversation."
    : "Once you have read through it, you can request a conversation with our team from the form at the end of the brochure.";
}

function plainText(candidate: Candidate): string {
  if (candidate.route === "one_on_one") {
    return [
      "Hi *|FNAME|*,",
      "",
      `Thanks for sharing your interest in ${candidate.collective.label}.`,
      "",
      "We tried reaching you on WhatsApp, but the message may not have gone through.",
      "Please go through the brochure first, so you can see the place, access, landscape, people, process, and current progress of the collective.",
      "",
      candidate.collective.brochureUrl,
      "",
      nextStepLine(candidate),
      "",
      "Team Beforest",
    ].join("\n");
  }
  return [
    "Hi *|FNAME|*,",
    "",
    `Thanks for sharing your interest in ${candidate.collective.label}.`,
    "",
    "We tried reaching you on WhatsApp, but the message may not have gone through.",
    "Here is the brochure, so you can go through the place, access, landscape, people, process, and current progress of the collective.",
    "",
    candidate.collective.brochureUrl,
    "",
    nextStepLine(candidate),
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
  const segmentName = `WA failed fallback ${stamp} ${groupKey}`;
  const batchTag = `wa_failed_email_fallback_${stamp}`;
  const groupTag = `wa_failed_email_fallback_${sample.route}_${sample.collective.key}`;
  const tags = ["wa_failed_email_fallback", batchTag, groupTag];
  const title = `WA failed fallback ${stamp} ${sample.collective.label} ${sample.route}`;
  const subjectLine = sample.route === "one_on_one" ? "Your Beforest conversation request" : `${sample.collective.label} brochure`;
  const previewText =
    sample.route === "one_on_one"
      ? "We tried reaching you on WhatsApp. Please read the brochure before requesting a conversation."
      : "We tried reaching you on WhatsApp. Read the brochure, then request a conversation from the end.";

  if (dryRun) {
    return {
      group_key: groupKey,
      would_create_segment: segmentName,
      would_create_campaign_title: title,
      subject_line: subjectLine,
      tags,
      recipients: validCandidates.map(publicCandidate),
      skipped_recipients: skippedRecipients.map((entry) => ({
        ...publicCandidate(entry.candidate),
        error: entry.error,
      })),
    };
  }

  const acceptedCandidates: Candidate[] = [];
  for (const candidate of validCandidates) {
    try {
      await upsertMember(config, candidate, tags);
      acceptedCandidates.push(candidate);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      skippedRecipients.push({ candidate, error: message });
    }
  }

  if (acceptedCandidates.length === 0) {
    return {
      group_key: groupKey,
      status: "skipped_no_valid_recipients",
      sent: false,
      recipients: [],
      recipient_deal_ids: [],
      skipped_recipients: skippedRecipients.map((entry) => ({
        ...publicCandidate(entry.candidate),
        error: entry.error,
      })),
    };
  }

  const segment = await createStaticSegment(config, segmentName, acceptedCandidates.map((candidate) => candidate.email));
  const campaign = await mailchimpRequest(config, "POST", "campaigns", {
    type: "regular",
    recipients: {
      list_id: config.audienceId,
      segment_opts: {
        match: "all",
        conditions: [
          {
            condition_type: "StaticSegment",
            field: "static_segment",
            op: "static_is",
            value: Number(segment.id),
          },
        ],
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
    skipped_recipients: skippedRecipients.map((entry) => ({
      ...publicCandidate(entry.candidate),
      error: entry.error,
    })),
  };
}

function publicCandidate(candidate: Candidate) {
  return {
    deal_id: Number(candidate.deal.id),
    title: candidate.deal.title,
    email: candidate.email.replace(/^(.{2}).*(@.*)$/, "$1...$2"),
    phone_tail: lastTen(candidate.phone),
    collective: candidate.collective.label,
    route: candidate.route,
    failure_activity_id: Number(candidate.failure.id),
    failure_time: candidate.failure.add_time,
    inbound_count: candidate.inboundCount,
    reason: candidate.reason,
  };
}

async function buildCandidate(deal: Deal, activities: any[], daysMs: number, retryFailedFallbacks: boolean): Promise<Candidate | null> {
  const dealId = Number(deal.id);
  if (!dealId || asString(deal.status).toLowerCase() !== "open") return null;
  const collective = collectiveForDeal(deal);
  if (!collective) return null;
  const typeformActivities = activities.filter((activity) => asString(activity.subject) === TYPEFORM_RECEIVED_SUBJECT);
  if (typeformActivities.length === 0) return null;
  if (activities.some((activity) => POST_BROCHURE_SUBJECTS.has(asString(activity.subject)))) return null;
  if (activities.some((activity) => asString(activity.subject) === "Email fallback sent via Mailchimp" || asString(activity.subject) === "Email fallback queued in Mailchimp")) return null;
  if (!retryFailedFallbacks && activities.some((activity) => asString(activity.subject) === "Email fallback failed in Mailchimp")) return null;

  const failures = activities
    .filter((activity) => WHATSAPP_FAILURE_SUBJECTS.has(asString(activity.subject)))
    .filter((activity) => Date.now() - dateMs(activity.add_time) <= daysMs)
    .sort((left, right) => dateMs(right.add_time) - dateMs(left.add_time));
  if (failures.length === 0) return null;

  const failure = failures[0];
  const route = inferRoute(failure);
  if (!route) return null;
  const failureTime = dateMs(failure.add_time);
  const laterRetryAccepted = activities.some(
    (activity) => asString(activity.subject) === WHATSAPP_RETRY_SENT_SUBJECT && dateMs(activity.add_time) >= failureTime,
  );
  if (laterRetryAccepted) return null;
  const typeform = typeformActivities.sort((left, right) => dateMs(right.add_time) - dateMs(left.add_time))[0];
  const typeformTime = dateMs(typeform.add_time) || failureTime;
  if (activities.some((activity) => WHATSAPP_SUCCESS_SUBJECTS.has(asString(activity.subject)) && dateMs(activity.add_time) >= failureTime)) {
    return null;
  }
  if (activities.some((activity) => isManualWhatsappChat(activity) && dateMs(activity.add_time) >= typeformTime)) {
    return null;
  }
  if (activities.some((activity) => isOwnerSalesTouchpoint(activity) && dateMs(activity.add_time) >= typeformTime)) {
    return null;
  }

  const person = await getPerson(personId(deal));
  const email = emailFor(deal, person);
  const phone = phoneOf(deal, person);
  if (!email || !email.includes("@")) return null;

  const inboundRows = await inboundAfter(phone, typeformTime || failureTime);
  if (inboundRows.length > 0) return null;

  return {
    deal,
    person,
    failure,
    typeform,
    collective,
    route,
    email,
    phone,
    firstName: firstName(deal, person),
    inboundCount: inboundRows.length,
    reason: "whatsapp_failed_no_inbound",
  };
}

async function logCampaignResult(candidate: Candidate, result: any, sendCampaigns: boolean) {
  const subject = sendCampaigns ? "Email fallback sent via Mailchimp" : "Email fallback queued in Mailchimp";
  const note = [
    sendCampaigns ? "Sent Mailchimp email fallback after WhatsApp delivery failure." : "Queued Mailchimp email fallback after WhatsApp delivery failure.",
    `Route: ${escapeHtml(candidate.route)}`,
    `Collective: ${escapeHtml(candidate.collective.label)}`,
    `Original failed WhatsApp activity: ${Number(candidate.failure.id)}`,
    `Mailchimp campaign: ${escapeHtml(result.campaign_id || "unknown")}`,
    `Mailchimp segment: ${escapeHtml(result.segment_id || "unknown")}`,
    `Recipient email: ${escapeHtml(candidate.email)}`,
    "",
    "<strong>Email copy</strong>",
    `<pre>${escapeHtml(plainText(candidate))}</pre>`,
  ].join("<br>");
  await createActivity(Number(candidate.deal.id), subject, note, 1, personId(candidate.deal));
}

async function logRecipientFailure(candidate: Candidate, message: string) {
  await createActivity(
    Number(candidate.deal.id),
    "Email fallback failed in Mailchimp",
    [
      "Mailchimp email fallback failed after WhatsApp delivery failure.",
      `Route: ${escapeHtml(candidate.route)}`,
      `Collective: ${escapeHtml(candidate.collective.label)}`,
      `Original failed WhatsApp activity: ${Number(candidate.failure.id)}`,
      `Recipient email: ${escapeHtml(candidate.email)}`,
      `Error: ${escapeHtml(message)}`,
    ].join("<br>"),
    0,
    personId(candidate.deal),
  );
}

export async function main(dry_run = true, days = 7, max_deals = 500, max_emails = 100, send_campaigns = true, debug_deal_id = 0, retry_failed_fallbacks = false) {
  const daysMs = Number(days || 7) * 24 * 60 * 60 * 1000;
  const debugDealId = Number(debug_deal_id || 0);
  const retryFailedFallbacks = Boolean(retry_failed_fallbacks);
  if (debugDealId > 0) {
    const deal = await getDeal(debugDealId);
    const activities = deal?.id ? await dealActivities(Number(deal.id)) : [];
    const person = deal ? await getPerson(personId(deal)) : null;
    const phone = deal ? phoneOf(deal, person) : "";
    const typeform = activities.filter((activity) => asString(activity.subject) === TYPEFORM_RECEIVED_SUBJECT);
    const failures = activities.filter((activity) => WHATSAPP_FAILURE_SUBJECTS.has(asString(activity.subject)));
    const latestFailure = failures.sort((left, right) => dateMs(right.add_time) - dateMs(left.add_time))[0] || null;
    const sinceMs = latestFailure ? dateMs(latestFailure.add_time) : dateMs(typeform[0]?.add_time);
    return {
      dry_run,
      status: "debug_deal",
      deal_id: debugDealId,
      deal_found: Boolean(deal),
      pipeline_id: deal ? pipelineId(deal) : null,
      deal_status: deal?.status || null,
      email: deal ? emailFor(deal, person) : "",
      phone_tail: lastTen(phone),
      typeform_count: typeform.length,
      failure_count: failures.length,
      latest_failure_subject: latestFailure?.subject || null,
      latest_failure_time: latestFailure?.add_time || null,
      latest_failure_route: latestFailure ? inferRoute(latestFailure) : null,
      later_success_subjects: latestFailure
        ? activities
            .filter((activity) => WHATSAPP_SUCCESS_SUBJECTS.has(asString(activity.subject)) && dateMs(activity.add_time) >= dateMs(latestFailure.add_time))
            .map((activity) => ({ subject: activity.subject, add_time: activity.add_time }))
        : [],
      later_retry_accepted: latestFailure
        ? activities.some((activity) => asString(activity.subject) === WHATSAPP_RETRY_SENT_SUBJECT && dateMs(activity.add_time) >= dateMs(latestFailure.add_time))
        : false,
      email_fallback_count: activities.filter((activity) => EMAIL_FALLBACK_SUBJECTS.has(asString(activity.subject))).length,
      retry_failed_fallbacks: retryFailedFallbacks,
      manual_whatsapp_chat_count: activities.filter(isManualWhatsappChat).length,
      owner_sales_touchpoint_count: activities.filter(isOwnerSalesTouchpoint).length,
      inbound_after_latest_failure_count: sinceMs ? (await inboundAfter(phone, sinceMs)).length : 0,
      subjects: activities.map((activity) => ({ subject: activity.subject, done: activity.done, add_time: activity.add_time })).slice(0, 30),
    };
  }
  const deals = await listRecentDeals(Number(max_deals || 500));
  const candidates: Candidate[] = [];
  for (const deal of deals) {
    if (candidates.length >= Number(max_emails || 100)) break;
    const activities = await dealActivities(Number(deal.id));
    const candidate = await buildCandidate(deal, activities, daysMs, retryFailedFallbacks);
    if (candidate) candidates.push(candidate);
  }

  const config = await getMailchimpConfig();
  const grouped = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const key = `${candidate.route}:${candidate.collective.key}:${candidate.collective.nextStep || "typeform"}`;
    grouped.set(key, [...(grouped.get(key) || []), candidate]);
  }

  if (!config) {
    return {
      dry_run,
      status: candidates.length > 0 ? "blocked_missing_mailchimp_config" : "no_eligible_leads",
      missing_config: {
        resource: MAILCHIMP_RESOURCE_PATH,
        audience_id_variable: MAILCHIMP_AUDIENCE_ID_PATH,
        optional_from_name_variable: MAILCHIMP_FROM_NAME_PATH,
        optional_reply_to_variable: MAILCHIMP_REPLY_TO_PATH,
      },
      eligible_count: candidates.length,
      eligible: candidates.map(publicCandidate),
    };
  }

  if (candidates.length === 0) {
    return { dry_run, status: "no_eligible_leads", checked_deals: deals.length };
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
        for (const candidate of groupCandidates) {
          await logRecipientFailure(candidate, message);
        }
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
    retry_failed_fallbacks: retryFailedFallbacks,
    checked_deals: deals.length,
    eligible_count: candidates.length,
    group_count: grouped.size,
    sent_or_planned_groups: groups,
    recipient_failures: recipientFailures,
    failures,
  };
}
