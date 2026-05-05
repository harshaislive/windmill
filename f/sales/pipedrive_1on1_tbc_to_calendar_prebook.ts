import * as wmill from "windmill-client";

const PIPEDRIVE_VARIABLE_PATH = "f/collectives/zoom_collective_to_pipedrive/pipedrive_api_key";
const DEFAULT_PIPEDRIVE_DOMAIN = "beforest";
const CALENDAR_PREBOOK_SCRIPT_PATH = "f/sales/calendar_prebook_1on1";

const ONE_ON_ONE_TBC_LABEL_ID = 115;
const INITIAL_EVENT_SCHEDULED_STAGE_IDS = new Set([1, 14, 21, 30]);

const DEAL_FIELDS = {
  oneOnOneMeetingDateTime: "d6fd8c9877d20bfd678ecb37f21e5b33bd2717fd",
  meetingUrl: "c818768b64d54270c74b931b4581082b543c8571",
};

type PipedriveWebhookBody = Record<string, any>;

type Deal = Record<string, any> & {
  id?: number;
  title?: string;
  stage_id?: number | { id?: number };
  label?: string | number | Array<string | number>;
  labels?: Array<string | number | { id?: number | string }>;
  label_ids?: Array<string | number>;
  custom_fields?: Record<string, unknown>;
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

function extractDealId(body: PipedriveWebhookBody): number | null {
  return (
    asNumber(body?.current?.id) ||
    asNumber(body?.data?.id) ||
    asNumber(body?.deal_id) ||
    asNumber(body?.id) ||
    asNumber(body?.meta?.entity_id) ||
    asNumber(body?.meta?.id)
  );
}

function stageId(deal: Deal): number | null {
  if (typeof deal.stage_id === "object") return asNumber(deal.stage_id?.id);
  return asNumber(deal.stage_id);
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

function customFieldValue(deal: Deal, key: string): string {
  return asString(deal.custom_fields?.[key] ?? deal[key]);
}

async function pipedriveRequest(method: string, path: string): Promise<any> {
  const apiToken = await wmill.getVariable(PIPEDRIVE_VARIABLE_PATH);
  const url = new URL(`https://${DEFAULT_PIPEDRIVE_DOMAIN}.pipedrive.com/api/v2/${path}`);
  url.searchParams.set("api_token", apiToken);

  const response = await fetch(url, { method });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(`Pipedrive ${method} ${path} failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload.data;
}

async function getDeal(dealId: number): Promise<Deal> {
  return await pipedriveRequest("GET", `deals/${dealId}`);
}

function prebookEligibility(deal: Deal) {
  const labels = collectLabelIds(deal);
  const currentStageId = stageId(deal);
  const meetingDateTime = customFieldValue(deal, DEAL_FIELDS.oneOnOneMeetingDateTime);
  const meetingUrl = customFieldValue(deal, DEAL_FIELDS.meetingUrl);

  const checks = {
    has_one_on_one_tbc_label: labels.has(ONE_ON_ONE_TBC_LABEL_ID),
    is_initial_event_scheduled_stage: currentStageId !== null && INITIAL_EVENT_SCHEDULED_STAGE_IDS.has(currentStageId),
    has_no_existing_meeting: !meetingDateTime && !meetingUrl,
  };

  return {
    eligible: Object.values(checks).every(Boolean),
    checks,
    stage_id: currentStageId,
    label_ids: Array.from(labels),
    existing_meeting: {
      one_on_one_meeting_date_time: meetingDateTime || null,
      meeting_url: meetingUrl || null,
    },
  };
}

export async function main(body: PipedriveWebhookBody, dry_run = false) {
  const dealId = extractDealId(body || {});
  if (!dealId) {
    return {
      status: "ignored",
      reason: "No deal id found in Pipedrive webhook payload.",
    };
  }

  const deal = await getDeal(dealId);
  const eligibility = prebookEligibility(deal);

  if (!eligibility.eligible) {
    return {
      status: "ignored",
      reason: "Deal is not eligible for 1on1 prebooking.",
      deal_id: dealId,
      deal_title: deal.title || null,
      ...eligibility,
    };
  }

  if (dry_run) {
    const calendarPreview = await wmill.runScriptByPath(CALENDAR_PREBOOK_SCRIPT_PATH, {
      deal_id: dealId,
      dry_run: true,
    });
    return {
      status: "dry_run_ready",
      deal_id: dealId,
      deal_title: deal.title || null,
      ...eligibility,
      calendar_preview: calendarPreview,
    };
  }

  const calendarResult = await wmill.runScriptByPath(CALENDAR_PREBOOK_SCRIPT_PATH, {
    deal_id: dealId,
    dry_run: false,
  });

  return {
    status: "prebooked",
    deal_id: dealId,
    deal_title: deal.title || null,
    ...eligibility,
    calendar_result: calendarResult,
  };
}
