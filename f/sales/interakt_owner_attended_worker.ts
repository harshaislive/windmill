import * as wmill from "windmill-client";

const PIPEDRIVE_VARIABLE_PATH = "f/collectives/zoom_collective_to_pipedrive/pipedrive_api_key";
const DEFAULT_PIPEDRIVE_DOMAIN = "beforest";
const ONE_ON_ONE_ATTENDED_LABEL_ID = 107;
const BEFOREST_ADMIN_USER_ID = 18891506;

const EVENT_ATTENDED_STAGE_BY_PIPELINE: Record<number, number> = {
  1: 2,
  2: 15,
  3: 22,
  4: 31,
};

type Deal = {
  id: number;
  title: string;
  pipeline_id?: number;
  owner_id?: number | { id?: number; name?: string };
  [key: string]: unknown;
};

function asString(value: unknown): string {
  return value == null ? "" : String(value).trim();
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

async function createPipedriveNote(dealId: number, content: string) {
  return await pipedriveV1("POST", "notes", { deal_id: dealId, content });
}

async function createPipedriveActivity(dealId: number, subject: string, note: string, done: 0 | 1 = 1) {
  return await pipedriveV1("POST", "activities", {
    deal_id: dealId,
    user_id: BEFOREST_ADMIN_USER_ID,
    subject,
    type: "task",
    done,
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

async function updateDealAttended(deal: Deal) {
  const pipelineId = Number(deal.pipeline_id);
  const stageId = EVENT_ATTENDED_STAGE_BY_PIPELINE[pipelineId];
  return await pipedriveV2("PATCH", `deals/${deal.id}`, {
    label_ids: [ONE_ON_ONE_ATTENDED_LABEL_ID],
    ...(stageId ? { stage_id: stageId } : {}),
  });
}

export async function main(route: Record<string, unknown>, dry_run = false) {
  const dealId = parseDealId(route || {});
  if (!dealId) {
    return {
      handled: false,
      action: "owner_attended",
      status: "missing_deal_id",
      dry_run,
      route,
    };
  }

  const deal = await getDeal(dealId);
  const pipelineId = Number(deal.pipeline_id);
  const stageId = EVENT_ATTENDED_STAGE_BY_PIPELINE[pipelineId] || null;
  const noteContent = [
    "<strong>1on1 owner attendance outcome</strong>",
    "Result: Attended",
    `Deal: ${deal.id} - ${deal.title}`,
    `Stage target: ${stageId || "not changed - unknown pipeline"}`,
    `Source: Interakt owner attendance button`,
  ].join("<br>");

  if (dry_run) {
    return {
      handled: true,
      action: "owner_attended",
      status: "dry_run_ready",
      deal_id: deal.id,
      deal_title: deal.title,
      pipedrive_update: {
        label_ids: [ONE_ON_ONE_ATTENDED_LABEL_ID],
        stage_id: stageId,
      },
      note_preview: noteContent,
    };
  }

  const updatedDeal = await updateDealAttended(deal);
  const note = await createPipedriveNote(deal.id, noteContent);
  const auditActivity = await createPipedriveActivity(
    deal.id,
    "Owner marked attended",
    [
      "Owner confirmed the 1on1 happened.",
      stageId ? "Deal moved to the attended stage." : "Stage was not changed.",
    ].join("<br>"),
  );
  return {
    handled: true,
    action: "owner_attended",
    status: "completed",
    deal_id: deal.id,
    label_id: ONE_ON_ONE_ATTENDED_LABEL_ID,
    stage_id: stageId,
    updated_deal_id: Number(updatedDeal?.id) || deal.id,
    note_id: Number(note?.id) || null,
    audit_activity_id: Number((auditActivity as any)?.id || (auditActivity as any)?.data?.id) || null,
    dry_run: false,
  };
}
