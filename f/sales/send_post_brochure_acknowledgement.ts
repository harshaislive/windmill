import * as wmill from "windmill-client";

const PIPEDRIVE_VARIABLE_PATH = "f/collectives/zoom_collective_to_pipedrive/pipedrive_api_key";
const INTERAKT_API_KEY_PATH = "f/sales/calendar_prebook_1on1/interakt_api_key";
const INTERAKT_BASE_URL_PATH = "f/sales/calendar_prebook_1on1/interakt_base_url";
const DEFAULT_PIPEDRIVE_DOMAIN = "beforest";
const BEFOREST_ADMIN_USER_ID = 18891506;
const ACK_TEMPLATE_NAME = "collective_post_brochure_owner_followup_ack";
const VIVEK_USER_ID = 22251956;
const RAKESH_USER_ID = 13490118;

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
  ownerId: number;
  ownerName: string;
};

const DEAL_FIELDS = {
  phone: "7f1ebc80670dad0d9f6ea3d5f2585c923395305a",
};

const COLLECTIVES: Record<number, CollectiveConfig> = {
  1: { key: "hammiyala", label: "Hammiyala Collective", pipelineId: 1, ownerId: 13490118, ownerName: "Rakesh" },
  2: { key: "mumbai", label: "Mumbai Collective", pipelineId: 2, ownerId: 22251956, ownerName: "Vivekanand" },
  3: { key: "poomaale2", label: "Poomaale Collective 2.0", pipelineId: 3, ownerId: 13490118, ownerName: "Rakesh" },
  4: { key: "bhopal", label: "Bhopal Collective", pipelineId: 4, ownerId: 22251956, ownerName: "Vivekanand" },
  6: { key: "hyderabad", label: "Hyderabad Collective", pipelineId: 6, ownerId: 22251956, ownerName: "Vivekanand" },
};

const ACK_SENT_SUBJECTS = new Set(["Post-brochure acknowledgement sent"]);

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

function lastTen(value: unknown): string {
  const digits = asString(value).replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function pipelineId(deal: Deal): number | null {
  if (typeof deal.pipeline_id === "object") return asNumber(deal.pipeline_id?.id);
  return asNumber(deal.pipeline_id);
}

function ownerId(deal: Deal): number | null {
  const raw = deal.owner_id?.id ?? deal.owner_id?.value ?? deal.owner_id ?? deal.user_id?.id ?? deal.user_id;
  return asNumber(raw);
}

function ownerName(id: number): string {
  if (id === VIVEK_USER_ID) return "Vivekanand";
  if (id === RAKESH_USER_ID) return "Rakesh";
  return `Pipedrive owner ${id}`;
}

function collectiveForDeal(deal: Deal): CollectiveConfig | null {
  const base = COLLECTIVES[Number(pipelineId(deal))];
  if (!base) return null;
  const actualOwnerId = ownerId(deal);
  return actualOwnerId
    ? { ...base, ownerId: actualOwnerId, ownerName: ownerName(actualOwnerId) }
    : base;
}

function personId(deal: Deal): number | null {
  if (typeof deal.person_id === "object") return asNumber(deal.person_id?.id);
  return asNumber(deal.person_id);
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

async function dealActivities(dealId: number): Promise<any[]> {
  const payload = await pipedriveRequest("GET", `deals/${dealId}/activities`, {
    apiVersion: "v1",
    params: { limit: 100 },
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

async function sendInteraktAck(phone: string, name: string, collective: CollectiveConfig) {
  const apiKey = await wmill.getVariable(INTERAKT_API_KEY_PATH);
  const baseUrl = (await wmill.getVariable(INTERAKT_BASE_URL_PATH).catch(() => "")) || "https://api.interakt.ai";
  const authorization = apiKey.toLowerCase().startsWith("basic ") ? apiKey : `Basic ${apiKey}`;
  const cleaned = asString(phone).replace(/[^\d+]/g, "");
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
        name: ACK_TEMPLATE_NAME,
        languageCode: "en",
        bodyValues: [name, collective.label, collective.ownerName],
      },
      callbackData: JSON.stringify({
        source: "post_brochure_acknowledgement",
        collective: collective.key,
      }),
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.result === false) {
    throw new Error(`Interakt acknowledgement template failed: ${response.status} ${JSON.stringify(payload).slice(0, 800)}`);
  }
  return payload;
}

function acknowledgementCopy(name: string, collective: CollectiveConfig) {
  return `Thanks ${name}, we received your follow-up for ${collective.label}. ${collective.ownerName} will reach out soon.`;
}

export async function main(deal_id = 0, dry_run = false) {
  const deal = await getDeal(Number(deal_id));
  if (!deal?.id) return { dry_run, status: "skipped_no_deal", deal_id };
  if (asString(deal.status).toLowerCase() && asString(deal.status).toLowerCase() !== "open") {
    return { dry_run, status: "skipped_deal_not_open", deal_id: Number(deal.id), deal_status: deal.status };
  }
  const collective = collectiveForDeal(deal);
  const dealPersonId = personId(deal);
  const person = await getPerson(dealPersonId);
  const phone = dealPhone(deal) || primaryPhone(person);
  const name = firstName(deal, person);
  const activities = await dealActivities(Number(deal.id));
  if (activities.some((activity) => ACK_SENT_SUBJECTS.has(asString(activity.subject)))) {
    return { dry_run, status: "skipped_acknowledgement_already_sent", deal_id: Number(deal.id) };
  }
  if (!collective) {
    return { dry_run, status: "skipped_unknown_collective", deal_id: Number(deal.id), pipeline_id: pipelineId(deal) };
  }
  const copy = acknowledgementCopy(name, collective);
  const plan = {
    deal_id: Number(deal.id),
    collective: collective.label,
    owner_name: collective.ownerName,
    phone: phone ? `...${lastTen(phone)}` : null,
    template_name: ACK_TEMPLATE_NAME,
    copy,
  };
  if (dry_run) return { dry_run: true, status: "would_send_post_brochure_acknowledgement", ...plan };
  if (!lastTen(phone)) {
    const task = await createActivity(Number(deal.id), "Send post-brochure acknowledgement manually", escapeHtml(copy), {
      personId: dealPersonId,
      userId: collective.ownerId,
      done: 0,
    });
    return { dry_run: false, status: "manual_task_created_missing_phone", activity_id: Number(task?.id) || null, ...plan };
  }
  try {
    const interakt = await sendInteraktAck(phone, name, collective);
    const activity = await createActivity(Number(deal.id), "Post-brochure acknowledgement sent", escapeHtml(copy), {
      personId: dealPersonId,
      done: 1,
    });
    return { dry_run: false, status: "acknowledgement_sent", activity_id: Number(activity?.id) || null, interakt, ...plan };
  } catch (error) {
    const task = await createActivity(
      Number(deal.id),
      "Send post-brochure acknowledgement manually",
      [
        "Automatic acknowledgement failed.",
        `Error: ${escapeHtml(error instanceof Error ? error.message : String(error))}`,
        "Manual copy:",
        escapeHtml(copy),
      ].join("<br>"),
      { personId: dealPersonId, userId: collective.ownerId, done: 0 },
    );
    return { dry_run: false, status: "manual_task_created_after_send_failure", activity_id: Number(task?.id) || null, error: error instanceof Error ? error.message : String(error), ...plan };
  }
}
