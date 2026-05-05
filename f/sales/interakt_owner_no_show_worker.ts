import * as wmill from "windmill-client";

const PIPEDRIVE_VARIABLE_PATH = "f/collectives/zoom_collective_to_pipedrive/pipedrive_api_key";
const INTERAKT_API_KEY_PATH = "f/sales/calendar_prebook_1on1/interakt_api_key";
const INTERAKT_BASE_URL_PATH = "f/sales/calendar_prebook_1on1/interakt_base_url";
const OWNER_BOOKING_LINK_MAP_PATH = "f/sales/calendar_prebook_1on1/owner_booking_link_map";
const DEFAULT_PIPEDRIVE_DOMAIN = "beforest";
const ONE_ON_ONE_NO_SHOW_LABEL_ID = 108;
const NO_SHOW_TEMPLATE_NAME = "collective_1on1_no_show_rebook";
const NO_SHOW_TEMPLATE_ID = "1483962136798583";
const BEFOREST_ADMIN_USER_ID = 18891506;

const DEAL_FIELDS = {
  phone: "7f1ebc80670dad0d9f6ea3d5f2585c923395305a",
};

const PIPEDRIVE_OWNER_ALIASES: Record<number, string> = {
  22251956: "Vivekanand",
  13490118: "Rakesh",
};

type Deal = {
  id: number;
  title: string;
  owner_id?: number | { id?: number; name?: string };
  person_id?: number | { id?: number };
  custom_fields?: Record<string, unknown>;
  [key: string]: unknown;
};

type Person = {
  phones?: Array<{ value?: string; primary?: boolean }>;
  phone?: Array<{ value?: string; primary?: boolean }>;
};

function asString(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function isPlaceholder(value: string): boolean {
  return !value || /dummy|placeholder|changeme|replace/i.test(value);
}

function parseDealId(route: Record<string, unknown>): number | null {
  const explicit = Number(route?.deal_id);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const text = [route?.callback_data, route?.button_text].map(asString).join(" ");
  const match = text.match(/pipedrive_deal:(\d+)/i) ?? text.match(/deal[_\s-]?id[:=]\s*(\d+)/i);
  return match?.[1] ? Number(match[1]) : null;
}

async function pipedriveV1(method: string, path: string, body?: Record<string, unknown>) {
  const url = new URL(`https://${DEFAULT_PIPEDRIVE_DOMAIN}.pipedrive.com/api/v1/${path.replace(/^\/+/, "")}`);
  url.searchParams.set("api_token", await wmill.getVariable(PIPEDRIVE_VARIABLE_PATH));
  const response = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(`Pipedrive v1 ${method} ${path} failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload.data;
}

async function pipedriveV2(method: string, path: string, body?: Record<string, unknown>) {
  const url = new URL(`https://${DEFAULT_PIPEDRIVE_DOMAIN}.pipedrive.com/api/v2/${path.replace(/^\/+/, "")}`);
  url.searchParams.set("api_token", await wmill.getVariable(PIPEDRIVE_VARIABLE_PATH));
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

async function getDeal(dealId: number): Promise<Deal> {
  return await pipedriveV2("GET", `deals/${dealId}`) as Deal;
}

async function getPerson(personId: number): Promise<Person> {
  return await pipedriveV2("GET", `persons/${personId}`) as Person;
}

function personId(deal: Deal): number | null {
  if (typeof deal.person_id === "number") return deal.person_id;
  if (deal.person_id && typeof deal.person_id === "object") return Number(deal.person_id.id) || null;
  return null;
}

function primaryPhone(person: Person | null): string {
  const phones = [...(person?.phones || []), ...(person?.phone || [])];
  return asString(phones.find((entry) => entry.primary)?.value || phones[0]?.value);
}

function dealPhone(deal: Deal): string {
  return asString(deal.custom_fields?.[DEAL_FIELDS.phone] ?? deal[DEAL_FIELDS.phone]);
}

function ownerId(deal: Deal): number | null {
  if (typeof deal.owner_id === "number") return deal.owner_id;
  if (deal.owner_id && typeof deal.owner_id === "object") return Number(deal.owner_id.id) || null;
  return null;
}

function ownerAlias(deal: Deal): string {
  const id = ownerId(deal);
  if (id && PIPEDRIVE_OWNER_ALIASES[id]) return PIPEDRIVE_OWNER_ALIASES[id];
  if (deal.owner_id && typeof deal.owner_id === "object") return asString(deal.owner_id.name) || "default";
  return "default";
}

function ownerDisplayName(owner: string): string {
  if (owner === "Rakesh") return "Sai Rakesh";
  if (owner === "Vivekanand") return "Vivekanand";
  return owner;
}

function interaktRecipient(rawPhone: string) {
  const cleaned = asString(rawPhone).replace(/[^\d+]/g, "");
  const digits = cleaned.replace(/\D/g, "");
  if (!digits) return {};
  if (cleaned.startsWith("+")) return { fullPhoneNumber: digits };
  if (digits.length === 10) return { countryCode: "+91", phoneNumber: digits };
  if (digits.length === 12 && digits.startsWith("91")) return { fullPhoneNumber: digits };
  return { fullPhoneNumber: digits };
}

async function buildNoShowPlan(deal: Deal) {
  const owner = ownerAlias(deal);
  const bookingLinks = JSON.parse(await wmill.getVariable(OWNER_BOOKING_LINK_MAP_PATH).catch(() => "{}")) as Record<string, string>;
  const bookingLink = asString(bookingLinks[owner] || bookingLinks.default);
  const pid = personId(deal);
  const person = pid ? await getPerson(pid).catch(() => null) : null;
  const phone = primaryPhone(person) || dealPhone(deal);
  return {
    template_name: NO_SHOW_TEMPLATE_NAME,
    whatsapp_template_id: NO_SHOW_TEMPLATE_ID,
    template_category: "marketing" as const,
    recipient: interaktRecipient(phone),
    raw_phone_present: Boolean(phone),
    body_values: [deal.title, ownerDisplayName(owner)],
    button_values: bookingLink ? { "1": [bookingLink] } : undefined,
    callback_data: `pipedrive_deal:${deal.id}:1on1_no_show_rebook`,
    owner,
    booking_link_present: Boolean(bookingLink),
  };
}

async function sendInteraktTemplate(plan: Awaited<ReturnType<typeof buildNoShowPlan>>) {
  if (!plan.raw_phone_present || (!("fullPhoneNumber" in plan.recipient) && !("phoneNumber" in plan.recipient))) {
    return { sent: false, skipped: true, reason: "missing_lead_phone" };
  }
  if (!plan.booking_link_present) {
    return { sent: false, skipped: true, reason: "missing_owner_booking_link" };
  }
  const apiKey = await wmill.getVariable(INTERAKT_API_KEY_PATH);
  if (!apiKey || isPlaceholder(apiKey)) {
    throw new Error(`Interakt API key is missing or still dummy at ${INTERAKT_API_KEY_PATH}.`);
  }
  const baseUrl = (await wmill.getVariable(INTERAKT_BASE_URL_PATH).catch(() => "https://api.interakt.ai")) || "https://api.interakt.ai";
  const authorization = apiKey.toLowerCase().startsWith("basic ") ? apiKey : `Basic ${apiKey}`;
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/v1/public/message/`, {
    method: "POST",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify({
      ...plan.recipient,
      callbackData: plan.callback_data,
      template_category: plan.template_category,
      type: "Template",
      template: {
        name: plan.template_name,
        languageCode: "en",
        bodyValues: plan.body_values,
        ...(plan.button_values ? { buttonValues: plan.button_values } : {}),
      },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.result === false) {
    throw new Error(`Interakt no-show rebook failed for deal ${plan.callback_data}: ${response.status} ${JSON.stringify(payload)}`);
  }
  return { sent: true, response: payload };
}

async function updateDealNoShow(dealId: number) {
  return await pipedriveV2("PATCH", `deals/${dealId}`, {
    label_ids: [ONE_ON_ONE_NO_SHOW_LABEL_ID],
  });
}

async function createPipedriveNote(dealId: number, content: string) {
  return await pipedriveV1("POST", "notes", { deal_id: dealId, content });
}

async function createPipedriveActivity(
  dealId: number,
  subject: string,
  note: string,
  options: { personId?: number | null; done?: 0 | 1 } = {},
) {
  return await pipedriveV1("POST", "activities", {
    deal_id: dealId,
    ...(options.personId ? { person_id: options.personId } : {}),
    user_id: BEFOREST_ADMIN_USER_ID,
    subject,
    type: "task",
    done: options.done ?? 1,
    due_date: todayInTimezone("Asia/Kolkata"),
    note,
  });
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

function safeJson(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(/[<>&]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[char] || char));
}

export async function main(route: Record<string, unknown>, dry_run = false) {
  const dealId = parseDealId(route || {});
  if (!dealId) {
    return {
      handled: false,
      action: "owner_not_attended",
      status: "missing_deal_id",
      dry_run,
      route,
    };
  }

  const deal = await getDeal(dealId);
  const plan = await buildNoShowPlan(deal);
  const noteContent = [
    "<strong>1on1 owner attendance outcome</strong>",
    "Result: Not attended / no-show",
    `Deal: ${deal.id} - ${deal.title}`,
    `Owner: ${ownerDisplayName(plan.owner)}`,
    `Lead rebook template: ${plan.template_name}`,
    `Booking link present: ${plan.booking_link_present ? "yes" : "no"}`,
    `Source: Interakt owner attendance button`,
  ].join("<br>");

  if (dry_run) {
    return {
      handled: true,
      action: "owner_not_attended",
      status: "dry_run_ready",
      deal_id: deal.id,
      deal_title: deal.title,
      pipedrive_update: { label_ids: [ONE_ON_ONE_NO_SHOW_LABEL_ID] },
      whatsapp: plan,
      note_preview: noteContent,
    };
  }

  const updatedDeal = await updateDealNoShow(deal.id);
  const note = await createPipedriveNote(deal.id, noteContent);
  const whatsappResult = await sendInteraktTemplate(plan);
  const inboundAudit = await createPipedriveActivity(
    deal.id,
    "Owner marked no-show",
    [
      `${ownerDisplayName(plan.owner)} marked that the lead did not attend.`,
    ].join("<br>"),
    { personId: personId(deal) },
  );
  const whatsappAudit = (whatsappResult as any)?.sent
    ? await createPipedriveActivity(
        deal.id,
        "Rebooking message sent",
        [
          "Sent WhatsApp asking the lead to book another 1on1.",
          `Owner: ${ownerDisplayName(plan.owner)}`,
        ].join("<br>"),
        { personId: personId(deal) },
      )
    : null;
  return {
    handled: true,
    action: "owner_not_attended",
    status: "completed",
    deal_id: deal.id,
    label_id: ONE_ON_ONE_NO_SHOW_LABEL_ID,
    updated_deal_id: Number(updatedDeal?.id) || deal.id,
    note_id: Number(note?.id) || null,
    inbound_audit_activity_id: Number((inboundAudit as any)?.id || (inboundAudit as any)?.data?.id) || null,
    whatsapp_audit_activity_id: Number((whatsappAudit as any)?.id || (whatsappAudit as any)?.data?.id) || null,
    whatsapp_sent: Boolean((whatsappResult as any)?.sent),
    whatsapp_result: whatsappResult,
    dry_run: false,
  };
}
