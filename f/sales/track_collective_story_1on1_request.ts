import * as wmill from "windmill-client";

const PIPEDRIVE_VARIABLE_PATH = "f/collectives/zoom_collective_to_pipedrive/pipedrive_api_key";
const DEFAULT_PIPEDRIVE_DOMAIN = "beforest";
const BEFOREST_ADMIN_USER_ID = 18891506;

type CollectiveConfig = {
  label: string;
  typeformUrl: string;
};

const COLLECTIVES: Record<string, CollectiveConfig> = {
  bhopal: {
    label: "Bhopal Collective",
    typeformUrl: "https://form.typeform.com/to/i1b6g9ZU",
  },
  mumbai: {
    label: "Mumbai Collective",
    typeformUrl: "https://form.typeform.com/to/s9YSmglR",
  },
  poomaale2: {
    label: "Poomaale Collective 2.0",
    typeformUrl: "https://form.typeform.com/to/Prnzj8zH",
  },
  hammiyala: {
    label: "Hammiyala Collective",
    typeformUrl: "https://form.typeform.com/to/RqtSprR9",
  },
};

function asString(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function normalCollective(value: unknown): string {
  const raw = asString(value).toLowerCase();
  if (["poomaale", "poomaale-2", "poomaale_2", "poomaale2", "poomaale 2", "poomaale 2.0"].includes(raw)) return "poomaale2";
  return raw.replace(/[^a-z0-9]/g, "");
}

function appendHiddenFields(baseUrl: string, fields: Record<string, string>) {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(fields)) {
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
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

async function pipedriveV1(method: string, path: string, body?: Record<string, unknown>) {
  const apiToken = await wmill.getVariable(PIPEDRIVE_VARIABLE_PATH);
  const url = new URL(`https://${DEFAULT_PIPEDRIVE_DOMAIN}.pipedrive.com/api/v1/${path.replace(/^\/+/, "")}`);
  url.searchParams.set("api_token", apiToken);
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

async function logPipedriveClick(dealId: number, personId: number | null, collective: CollectiveConfig, destination: string) {
  if (!dealId) return null;
  const payload = await pipedriveV1("POST", "activities", {
    deal_id: dealId,
    ...(personId ? { person_id: personId } : {}),
    user_id: BEFOREST_ADMIN_USER_ID,
    subject: "Collective Story 1on1 request clicked",
    type: "task",
    done: 1,
    due_date: todayInTimezone("Asia/Kolkata"),
    note: [
      "Lead clicked the 1on1 request CTA from the Collective Story.",
      `Collective: ${collective.label}`,
      "Source: story_bottom_cta",
      `Redirect: ${destination}`,
    ].join("<br>"),
  });
  return payload.data;
}

export async function main(
  collective = "",
  pipedrive_deal_id = "",
  pipedrive_person_id = "",
  tracking_token = "",
  dry_run = false,
  event: any = null,
) {
  const query = event?.query || event?.queries || {};
  const key = normalCollective(collective || query.collective);
  const dealIdRaw = pipedrive_deal_id || query.pipedrive_deal_id || query.deal_id;
  const personIdRaw = pipedrive_person_id || query.pipedrive_person_id || query.person_id;
  const trackingTokenRaw = tracking_token || query.tracking_token || query.t;
  const config = COLLECTIVES[key];
  if (!config) {
    return {
      windmill_status_code: 400,
      error: "Unsupported collective.",
      supported_collectives: Object.keys(COLLECTIVES),
    };
  }

  const dealId = Number(asString(dealIdRaw)) || 0;
  const personId = Number(asString(personIdRaw)) || null;
  const destination = appendHiddenFields(config.typeformUrl, {
    collective: key,
    source: "collective_story",
    story_cta: "bottom_1on1_request",
    pipedrive_deal_id: dealId ? String(dealId) : "",
    pipedrive_person_id: personId ? String(personId) : "",
    tracking_token: asString(trackingTokenRaw),
  });

  if (dry_run) {
    return {
      dry_run: true,
      collective: key,
      destination,
      would_log_pipedrive_activity: Boolean(dealId),
    };
  }

  const activity = await logPipedriveClick(dealId, personId, config, destination);
  return {
    windmill_status_code: 302,
    windmill_headers: {
      Location: destination,
      "Cache-Control": "no-store",
    },
    collective: key,
    logged_activity_id: Number(activity?.id) || null,
  };
}
