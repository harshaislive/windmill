import * as wmill from "windmill-client";


type PipedriveUsageLogArgs = {
  method: string;
  rawEndpoint: string;
  statusCode?: number;
  success: boolean;
  durationMs?: number;
  rateLimitRemaining?: number;
  rateLimitReset?: string;
  retryAfter?: string;
  errorMessage?: string;
  requestFingerprint?: string;
};

async function logPipedriveApiUsage(_args: PipedriveUsageLogArgs) {
  return;
}

function pipedriveRateLimitRemaining(response: Response): number | undefined {
  const value = Number(response.headers.get("x-ratelimit-remaining") || response.headers.get("x-rate-limit-remaining"));
  return Number.isFinite(value) ? value : undefined;
}

function pipedriveEndpointForLog(url: URL): string {
  return url.pathname;
}

const PIPEDRIVE_VARIABLE_PATH = "f/collectives/zoom_collective_to_pipedrive/pipedrive_api_key";
const DEFAULT_PIPEDRIVE_DOMAIN = "beforest";
const TEAM_SCHEDULING_NOTICE_SCRIPT_PATH = "f/sales/send_1on1_team_scheduling_notice";
const GIS_STORY_CTA_SCRIPT_PATH = "f/sales/send_gis_story_cta";
const GIS_LABEL_IDS_VARIABLE_PATH = "f/sales/gis_label_ids";

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

type GisLabelIds = {
  gisAwaiting: number;
  gisSent: number;
  gisOpened: number;
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

async function pipedriveRequest(
  method: string,
  path: string,
  options: {
    apiVersion?: "v1" | "v2";
    body?: Record<string, unknown>;
    params?: Record<string, string | number | boolean | undefined>;
  } = {},
): Promise<any> {
  const apiToken = await wmill.getVariable(PIPEDRIVE_VARIABLE_PATH);
  const url = new URL(`https://${DEFAULT_PIPEDRIVE_DOMAIN}.pipedrive.com/api/${options.apiVersion || "v2"}/${path}`);
  url.searchParams.set("api_token", apiToken);
  for (const [key, value] of Object.entries(options.params || {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const startedAt = Date.now();

  const response = await fetch(url, {
    method,
    headers: options.body ? { "content-type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  await logPipedriveApiUsage({
    method,
    rawEndpoint: pipedriveEndpointForLog(url),
    statusCode: response.status,
    success: response.ok && payload?.success !== false,
    durationMs: Date.now() - startedAt,
    rateLimitRemaining: pipedriveRateLimitRemaining(response),
    rateLimitReset: response.headers.get("x-ratelimit-reset") || response.headers.get("x-rate-limit-reset") || "",
    retryAfter: response.headers.get("retry-after") || "",
    errorMessage: response.ok && payload?.success !== false ? "" : JSON.stringify(payload).slice(0, 800),
    requestFingerprint: method.toUpperCase() + " " + pipedriveEndpointForLog(url),
  });
  if (!response.ok || payload?.success === false) {
    throw new Error(`Pipedrive ${method} ${path} failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload.data;
}

async function getDeal(dealId: number): Promise<Deal> {
  return await pipedriveRequest("GET", `deals/${dealId}`);
}

async function loadGisLabelIds(): Promise<GisLabelIds> {
  const raw = await wmill.getVariable(GIS_LABEL_IDS_VARIABLE_PATH).catch(() => "");
  if (!raw) {
    throw new Error(
      `Missing GIS label IDs. Set ${GIS_LABEL_IDS_VARIABLE_PATH} to {"gisAwaiting":123,"gisSent":124,"gisOpened":125}.`,
    );
  }
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

function nextStepEligibility(deal: Deal) {
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
  const eligibility = nextStepEligibility(deal);

  if (eligibility.eligible) {
    if (dry_run) {
      const noticePreview = await wmill.runScriptByPath(TEAM_SCHEDULING_NOTICE_SCRIPT_PATH, {
        deal_id: dealId,
        dry_run: true,
      });
      return {
        status: "dry_run_1on1_team_scheduling_notice",
        deal_id: dealId,
        deal_title: deal.title || null,
        ...eligibility,
        notice_preview: noticePreview,
      };
    }

    const noticeJobId = await wmill.runScriptByPathAsync(TEAM_SCHEDULING_NOTICE_SCRIPT_PATH, {
      deal_id: dealId,
      dry_run: false,
    }, 0);
    return {
      status: "1on1_team_scheduling_notice_queued",
      deal_id: dealId,
      deal_title: deal.title || null,
      ...eligibility,
      notice_job_id: noticeJobId,
    };
  }

  const gisLabels = await loadGisLabelIds();
  if (eligibility.label_ids.includes(gisLabels.gisAwaiting)) {
    if (dry_run) {
      const gisPreview = await wmill.runScriptByPath(GIS_STORY_CTA_SCRIPT_PATH, {
        deal_id: dealId,
        dry_run: true,
      });
      return {
        status: "dry_run_gis_story_cta",
        deal_id: dealId,
        deal_title: deal.title || null,
        ...eligibility,
        gis_preview: gisPreview,
      };
    }

    const gisJobId = await wmill.runScriptByPathAsync(GIS_STORY_CTA_SCRIPT_PATH, {
      deal_id: dealId,
      dry_run: false,
    }, 0);
    return {
      status: "gis_story_cta_queued",
      deal_id: dealId,
      deal_title: deal.title || null,
      ...eligibility,
      gis_job_id: gisJobId,
    };
  }

  return {
    status: "ignored",
    reason: "Deal is not eligible for 1on1 team scheduling notice or GIS CTA.",
    deal_id: dealId,
    deal_title: deal.title || null,
    ...eligibility,
  };
}
