import * as wmill from "windmill-client";
import { createHmac, timingSafeEqual } from "node:crypto";

const PIPEDRIVE_VARIABLE_PATH = "f/collectives/zoom_collective_to_pipedrive/pipedrive_api_key";
const INTERAKT_API_KEY_PATH = "f/sales/calendar_prebook_1on1/interakt_api_key";
const GIS_LABEL_IDS_VARIABLE_PATH = "f/sales/gis_label_ids";
const GIS_TOKEN_SECRET_VARIABLE_PATH = "f/sales/gis_tracking_token_secret";
const DEFAULT_PIPEDRIVE_DOMAIN = "beforest";
const BEFOREST_ADMIN_USER_ID = 18891506;
const APPROVED_CANVA_DESIGN_IDS = new Set([
  "DAGnglQsmYw",
  "DAFy6m9o82w",
  "DAESin37d1A",
  "DAFA7pBf2Ps",
  "DAEtWW1aqhU",
]);
const APPROVED_CANVA_SHORTLINKS = new Set([
  "vjfj5yn7486ujqb",
  "sg93jjmd2i08ji3",
]);

type GisLabelIds = {
  gisAwaiting: number;
  gisSent: number;
  gisOpened: number;
};

type TokenPayload = {
  deal_id?: number;
  person_id?: number | null;
  collective?: string;
  destination_url?: string;
  source?: string;
  iat?: string;
};

type HttpEventLike = {
  kind?: string;
  query?: Record<string, unknown>;
  queries?: Record<string, unknown>;
  http?: { query?: Record<string, unknown> };
  body?: unknown;
};

type Deal = Record<string, any> & {
  id?: number;
  label?: string | number | Array<string | number>;
  labels?: Array<string | number | { id?: number | string }>;
  label_ids?: Array<string | number>;
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

function escapeHtml(value: string): string {
  return value.replace(/[<>&]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[char] || char));
}

function collectLabelIds(deal: Deal): number[] {
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

  return Array.from(ids);
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

async function verifyToken(token: string): Promise<TokenPayload> {
  const [body, sig] = token.split(".");
  if (!body || !sig) throw new Error("Invalid GIS tracking token.");
  const expected = createHmac("sha256", await tokenSecret()).update(body).digest("base64url");
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(sig);
  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
    throw new Error("Invalid GIS tracking token signature.");
  }
  return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenPayload;
}

function tokenFromInput(t: unknown, event: HttpEventLike | null): string {
  if (typeof t === "string" && t.trim()) return t.trim();
  const direct = t as HttpEventLike | null;
  const query = event?.query || event?.queries || event?.http?.query || direct?.query || direct?.queries || direct?.http?.query || {};
  const body = (event?.body || direct?.body || {}) as Record<string, unknown>;
  return asString(query.t || query.token || body.t || body.token);
}

export async function preprocessor(event: HttpEventLike) {
  const query = event?.query || event?.queries || event?.http?.query || {};
  const body = (event?.body || {}) as Record<string, unknown>;
  const dryRunValue = query.dry_run || query.dryRun || body.dry_run || body.dryRun;
  return {
    t: tokenFromInput("", event),
    dry_run: ["true", "1", "yes"].includes(asString(dryRunValue).toLowerCase()),
  };
}

function assertDestination(url: string): string {
  const parsed = new URL(url);
  if (parsed.hostname === "storymaps.arcgis.com" && parsed.pathname.startsWith("/stories/")) {
    return parsed.toString();
  }
  const host = parsed.hostname.replace(/^www\./, "");
  const pathParts = parsed.pathname.split("/").filter(Boolean);
  if (host === "canva.com" && pathParts[0] === "design" && APPROVED_CANVA_DESIGN_IDS.has(pathParts[1])) {
    return parsed.toString();
  }
  if (host === "canva.link" && pathParts.length === 1 && APPROVED_CANVA_SHORTLINKS.has(pathParts[0])) {
    return parsed.toString();
  }
  throw new Error("Tracking token destination is not an approved brochure URL.");
}

function isCanvaBrochure(url: string): boolean {
  const host = new URL(url).hostname.replace(/^www\./, "");
  return host === "canva.com" || host === "canva.link";
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

async function getDeal(dealId: number): Promise<Deal> {
  const payload = await pipedriveRequest("GET", `deals/${dealId}`);
  return payload.data as Deal;
}

async function updateDealLabels(deal: Deal, addLabelId: number) {
  const payload = await pipedriveRequest("PUT", `deals/${Number(deal.id)}`, {
    apiVersion: "v1",
    body: { label: String(addLabelId) },
  });
  return payload.data;
}

async function createPipedriveActivity(dealId: number, payload: TokenPayload, destinationUrl: string) {
  const brochure = isCanvaBrochure(destinationUrl);
  const response = await pipedriveRequest("POST", "activities", {
    apiVersion: "v1",
    body: {
      deal_id: dealId,
      ...(payload.person_id ? { person_id: payload.person_id } : {}),
      user_id: BEFOREST_ADMIN_USER_ID,
      subject: brochure ? "Brochure opened" : "GIS story opened",
      type: "task",
      done: 1,
      due_date: todayInTimezone("Asia/Kolkata"),
      note: [
        brochure ? "Lead opened the brochure tracking link." : "Lead opened the GIS story tracking link.",
        `Collective: ${escapeHtml(asString(payload.collective))}`,
        `Source: ${escapeHtml(asString(payload.source))}`,
        `Destination: ${escapeHtml(destinationUrl)}`,
        `Sent token time: ${escapeHtml(asString(payload.iat))}`,
        `Opened at: ${escapeHtml(new Date().toISOString())}`,
      ].join("<br>"),
    },
  });
  return response.data;
}

function redirectResponse(destinationUrl: string, result: Record<string, unknown>) {
  return {
    ...result,
    windmill_status_code: 302,
    windmill_headers: {
      Location: destinationUrl,
      "Cache-Control": "no-store",
    },
  };
}

async function trackOpenBestEffort(dealId: number, payload: TokenPayload, destinationUrl: string) {
  try {
    const gisLabels = await loadGisLabelIds();
    const deal = await getDeal(dealId);
    const updatedDeal = await updateDealLabels(deal, gisLabels.gisOpened);
    const activity = await createPipedriveActivity(dealId, payload, destinationUrl);

    return {
      tracking_status: "tracked_open",
      updated_label_ids: collectLabelIds(updatedDeal),
      audit_activity_id: Number(activity?.id) || null,
    };
  } catch (error) {
    return {
      tracking_status: "tracking_failed_redirected",
      tracking_error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function main(t: unknown = "", dry_run = false, event: HttpEventLike | null = null) {
  const token = tokenFromInput(t, event);
  const payload = await verifyToken(token);
  const dealId = Number(payload.deal_id);
  if (!Number.isFinite(dealId) || dealId <= 0) throw new Error("GIS tracking token is missing a valid deal_id.");
  const destinationUrl = assertDestination(asString(payload.destination_url));

  if (dry_run) {
    return {
      dry_run: true,
      status: "would_track_open",
      deal_id: dealId,
      collective: payload.collective || null,
      destination_url: destinationUrl,
      would_redirect: true,
    };
  }

  const tracking = await trackOpenBestEffort(dealId, payload, destinationUrl);

  return redirectResponse(destinationUrl, {
    dry_run: false,
    status: tracking.tracking_status,
    deal_id: dealId,
    collective: payload.collective || null,
    ...tracking,
  });
}
