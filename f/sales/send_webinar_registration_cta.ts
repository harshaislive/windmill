import * as wmill from "windmill-client";

const PIPEDRIVE_VARIABLE_PATH = "f/collectives/zoom_collective_to_pipedrive/pipedrive_api_key";
const INTERAKT_API_KEY_PATH = "f/sales/calendar_prebook_1on1/interakt_api_key";
const INTERAKT_BASE_URL_PATH = "f/sales/calendar_prebook_1on1/interakt_base_url";
const DEFAULT_PIPEDRIVE_DOMAIN = "beforest";
const BEFOREST_ADMIN_USER_ID = 18891506;
const SCHEDULED_WEBINAR_AWAITING_LABEL_ID = 110;
const TEMPLATE_NAME = "collective_unfit_webinar_cta";
const TEMPLATE_ID = "2162234634523262";

const DEAL_FIELDS = {
  phone: "7f1ebc80670dad0d9f6ea3d5f2585c923395305a",
};

const COLLECTIVES_BY_PIPELINE: Record<number, { label: string; registrationUrl: string }> = {
  1: {
    label: "Hammiyala Collective",
    registrationUrl: "https://calendly.com/beforestfarming/hammiyala-collective-introduction-webinar",
  },
  2: {
    label: "Mumbai Collective",
    registrationUrl: "https://calendly.com/beforestfarming/mumbai-collective-introduction-webinar",
  },
  3: {
    label: "Poomaale Collective 2.0",
    registrationUrl: "https://calendly.com/beforestfarming/poomaale-collective-introduction-webinar",
  },
  4: {
    label: "Bhopal Collective",
    registrationUrl: "https://calendly.com/beforestfarming/bhopal-collective-introduction-webinar",
  },
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

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(asString(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function isPlaceholder(value: string): boolean {
  return /^(dummy|placeholder|changeme|todo)/i.test(asString(value));
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

function collectLabelIds(deal: Deal): Set<number> {
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

  return ids;
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

async function pipedriveRequest(
  method: string,
  path: string,
  options: { params?: Record<string, unknown>; body?: Record<string, unknown>; apiVersion?: "v1" | "v2" } = {},
): Promise<any> {
  const apiToken = await wmill.getVariable(PIPEDRIVE_VARIABLE_PATH);
  const apiVersion = options.apiVersion || "v2";
  const url = new URL(`https://${DEFAULT_PIPEDRIVE_DOMAIN}.pipedrive.com/api/${apiVersion}/${path}`);
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
  return (payload.data || []).some((activity: any) => asString(activity.subject) === "Webinar registration link sent");
}

async function sendInteraktTemplate(plan: {
  recipient: InteraktRecipient;
  bodyValues: string[];
  buttonValues: Record<string, string[]>;
  callbackData: string;
}) {
  const apiKey = await wmill.getVariable(INTERAKT_API_KEY_PATH);
  if (!apiKey || isPlaceholder(apiKey)) {
    throw new Error(`Interakt API key is missing or still dummy at ${INTERAKT_API_KEY_PATH}.`);
  }

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
    throw new Error(`Interakt webinar CTA send failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

export async function main(deal_id: number, dry_run = false) {
  const dealId = Number(deal_id);
  if (!Number.isFinite(dealId) || dealId <= 0) throw new Error("deal_id is required.");

  const deal = await getDeal(dealId);
  const labels = collectLabelIds(deal);
  const config = COLLECTIVES_BY_PIPELINE[pipelineId(deal) || 0];
  const pid = personId(deal);
  const person = pid ? await getPerson(pid) : null;
  const rawPhone = primaryPhone(person) || dealPhone(deal);
  const recipient = interaktRecipient(rawPhone);
  const alreadySent = await hasSentActivity(dealId);

  if (!config) {
    return { status: "ignored", reason: "Unsupported pipeline for webinar CTA.", deal_id: dealId };
  }
  if (!labels.has(SCHEDULED_WEBINAR_AWAITING_LABEL_ID)) {
    return { status: "ignored", reason: "Deal is not labeled Scheduled Webinar Awaiting.", deal_id: dealId };
  }
  if (alreadySent) {
    return { status: "skipped", reason: "Webinar registration CTA was already logged.", deal_id: dealId };
  }

  const plan = {
    template_name: TEMPLATE_NAME,
    whatsapp_template_id: TEMPLATE_ID,
    recipient,
    raw_phone_present: Boolean(rawPhone),
    body_values: [firstName(deal, person), config.label],
    button_values: { "1": [config.registrationUrl] },
    callback_data: `pipedrive_deal:${dealId}:webinar_registration_cta`,
    registration_url: config.registrationUrl,
  };

  if (dry_run) {
    return {
      dry_run: true,
      status: "would_send",
      deal_id: dealId,
      deal_title: deal.title || null,
      collective: config.label,
      plan,
    };
  }

  try {
    assertRecipientReady(recipient, rawPhone);
    const interaktResponse = await sendInteraktTemplate({
      recipient,
      bodyValues: plan.body_values,
      buttonValues: plan.button_values,
      callbackData: plan.callback_data,
    });
    const activity = await createPipedriveActivity(
      dealId,
      "Webinar registration link sent",
      [
        "Sent the webinar registration link on WhatsApp.",
        `Collective: ${config.label}`,
        `Template: ${TEMPLATE_NAME}`,
      ].join("<br>"),
      { personId: pid },
    );
    return {
      dry_run: false,
      status: "sent",
      deal_id: dealId,
      collective: config.label,
      interakt_response: interaktResponse,
      audit_activity_id: Number(activity?.id) || null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const activity = await createPipedriveActivity(
      dealId,
      "WhatsApp failed to deliver",
      [
        "Could not send the webinar registration link.",
        `Reason: ${message}`,
        `Template: ${TEMPLATE_NAME}`,
      ].join("<br>"),
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
