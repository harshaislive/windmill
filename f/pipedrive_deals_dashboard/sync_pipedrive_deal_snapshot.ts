import * as wmill from "windmill-client";

const PIPEDRIVE_VARIABLE_PATH = "f/collectives/zoom_collective_to_pipedrive/pipedrive_api_key";
const DEFAULT_PIPEDRIVE_DOMAIN = "beforest";
const TIMEZONE = "Asia/Kolkata";
const STALE_DAYS = 14;

type Deal = Record<string, any>;
type CountValue = {
  count: number;
  value: number;
  weighted_value: number;
};

type Bucket = {
  key: string;
  label: string;
  open: CountValue;
  won: CountValue;
  lost: CountValue;
  total: CountValue;
  no_activity: number;
  overdue_activity: number;
  stale_open: number;
  expected_close_overdue: number;
  avg_open_age_days: number;
  win_rate_closed: number;
};

function asString(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateInTimezone(date = new Date(), timezone = TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function parsePipedriveDate(raw: unknown): Date | null {
  const text = asString(raw);
  if (!text) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(text) ? `${text.replace(" ", "T")}Z` : text;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysBetween(from: Date | null, to: Date): number {
  if (!from) return 0;
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));
}

function isPlaceholder(value: string): boolean {
  return !value || /dummy|placeholder|changeme|replace/i.test(value);
}

async function pipedriveV1(method: string, path: string, query?: Record<string, unknown>) {
  const apiKey = await wmill.getVariable(PIPEDRIVE_VARIABLE_PATH);
  if (isPlaceholder(apiKey)) throw new Error(`Pipedrive API key missing at ${PIPEDRIVE_VARIABLE_PATH}.`);
  const url = new URL(`https://${DEFAULT_PIPEDRIVE_DOMAIN}.pipedrive.com/api/v1/${path.replace(/^\/+/, "")}`);
  url.searchParams.set("api_token", apiKey);
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, { method });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(`Pipedrive ${method} ${path} failed: ${response.status} ${JSON.stringify(payload).slice(0, 500)}`);
  }
  return payload;
}

async function fetchAllDeals(maxDeals: number) {
  const deals: Deal[] = [];
  let start = 0;
  while (deals.length < maxDeals) {
    const payload = await pipedriveV1("GET", "deals", {
      status: "all_not_deleted",
      start,
      limit: Math.min(500, maxDeals - deals.length),
      sort: "update_time DESC",
    });
    const page = Array.isArray(payload.data) ? payload.data : [];
    deals.push(...page);
    const pagination = payload.additional_data?.pagination;
    if (!pagination?.more_items_in_collection || !page.length) break;
    start = Number(pagination.next_start) || start + page.length;
  }
  return deals;
}

async function fetchLookups() {
  const [users, pipelines, stages] = await Promise.all([
    pipedriveV1("GET", "users", { limit: 500 }).catch(() => ({ data: [] })),
    pipedriveV1("GET", "pipelines").catch(() => ({ data: [] })),
    pipedriveV1("GET", "stages").catch(() => ({ data: [] })),
  ]);
  return {
    users: Object.fromEntries((users.data || []).map((user: any) => [String(user.id), user.name || user.email || `User ${user.id}`])),
    pipelines: Object.fromEntries((pipelines.data || []).map((pipeline: any) => [String(pipeline.id), pipeline.name || `Pipeline ${pipeline.id}`])),
    stages: Object.fromEntries((stages.data || []).map((stage: any) => [String(stage.id), stage.name || `Stage ${stage.id}`])),
  };
}

function ownerId(deal: Deal): string {
  const raw = deal.owner_id ?? deal.user_id;
  if (typeof raw === "number" || typeof raw === "string") return String(raw);
  if (raw && typeof raw === "object") return String(raw.id || raw.value || "");
  return "";
}

function ownerName(deal: Deal, users: Record<string, string>): string {
  const raw = deal.owner_id ?? deal.user_id;
  if (raw && typeof raw === "object" && raw.name) return String(raw.name);
  const id = ownerId(deal);
  return users[id] || (id ? `Owner ${id}` : "Unassigned");
}

function pipelineId(deal: Deal): string {
  const raw = deal.pipeline_id;
  if (typeof raw === "number" || typeof raw === "string") return String(raw);
  if (raw && typeof raw === "object") return String(raw.id || "");
  return "";
}

function pipelineName(deal: Deal, pipelines: Record<string, string>): string {
  const id = pipelineId(deal);
  return pipelines[id] || (id ? `Pipeline ${id}` : "Unassigned");
}

function stageName(deal: Deal, stages: Record<string, string>): string {
  const id = asString(deal.stage_id);
  return stages[id] || (id ? `Stage ${id}` : "Unassigned");
}

function emptyCountValue(): CountValue {
  return { count: 0, value: 0, weighted_value: 0 };
}

function emptyBucket(key: string, label: string): Bucket & { open_age_total: number } {
  return {
    key,
    label,
    open: emptyCountValue(),
    won: emptyCountValue(),
    lost: emptyCountValue(),
    total: emptyCountValue(),
    no_activity: 0,
    overdue_activity: 0,
    stale_open: 0,
    expected_close_overdue: 0,
    avg_open_age_days: 0,
    win_rate_closed: 0,
    open_age_total: 0,
  };
}

function addCountValue(target: CountValue, deal: Deal) {
  target.count += 1;
  target.value += asNumber(deal.value);
  target.weighted_value += asNumber(deal.weighted_value);
}

function statusOf(deal: Deal) {
  const status = asString(deal.status).toLowerCase();
  return status === "won" || status === "lost" ? status : "open";
}

function activityHealth(deal: Deal, today: string, now: Date) {
  const nextDate = asString(deal.next_activity_date);
  const updateDays = daysBetween(parsePipedriveDate(deal.update_time || deal.add_time), now);
  return {
    no_activity: !nextDate,
    overdue_activity: Boolean(nextDate && nextDate < today),
    stale_open: updateDays >= STALE_DAYS,
    expected_close_overdue: Boolean(asString(deal.expected_close_date) && asString(deal.expected_close_date) < today),
  };
}

function applyToBucket(bucket: Bucket & { open_age_total: number }, deal: Deal, today: string, now: Date) {
  const status = statusOf(deal);
  addCountValue(bucket.total, deal);
  addCountValue(bucket[status], deal);
  if (status === "open") {
    const health = activityHealth(deal, today, now);
    if (health.no_activity) bucket.no_activity += 1;
    if (health.overdue_activity) bucket.overdue_activity += 1;
    if (health.stale_open) bucket.stale_open += 1;
    if (health.expected_close_overdue) bucket.expected_close_overdue += 1;
    bucket.open_age_total += daysBetween(parsePipedriveDate(deal.add_time), now);
  }
}

function finalizeBucket(bucket: Bucket & { open_age_total: number }): Bucket {
  const closed = bucket.won.count + bucket.lost.count;
  return {
    ...bucket,
    avg_open_age_days: bucket.open.count ? Math.round(bucket.open_age_total / bucket.open.count) : 0,
    win_rate_closed: closed ? Math.round((bucket.won.count / closed) * 1000) / 10 : 0,
  };
}

function topRows<T extends { open: CountValue; won: CountValue; lost: CountValue }>(rows: T[], limit = 20) {
  return rows
    .sort((a, b) => b.open.value - a.open.value || b.open.count - a.open.count || b.won.value - a.won.value)
    .slice(0, limit);
}

function summarize(deals: Deal[], lookups: Awaited<ReturnType<typeof fetchLookups>>) {
  const now = new Date();
  const today = dateInTimezone(now);
  const totals = emptyBucket("all", "All deals");
  const owners = new Map<string, ReturnType<typeof emptyBucket>>();
  const collectives = new Map<string, ReturnType<typeof emptyBucket>>();
  const ownerCollectives = new Map<string, ReturnType<typeof emptyBucket> & { owner: string; collective: string }>();
  const stages = new Map<string, ReturnType<typeof emptyBucket> & { collective: string; stage: string }>();
  const lostReasons = new Map<string, { reason: string; count: number; value: number }>();

  for (const deal of deals) {
    const owner = ownerName(deal, lookups.users);
    const ownerKey = ownerId(deal) || owner;
    const collective = pipelineName(deal, lookups.pipelines);
    const collectiveKey = pipelineId(deal) || collective;
    const stage = stageName(deal, lookups.stages);
    const status = statusOf(deal);

    applyToBucket(totals, deal, today, now);
    if (!owners.has(ownerKey)) owners.set(ownerKey, emptyBucket(ownerKey, owner));
    applyToBucket(owners.get(ownerKey)!, deal, today, now);
    if (!collectives.has(collectiveKey)) collectives.set(collectiveKey, emptyBucket(collectiveKey, collective));
    applyToBucket(collectives.get(collectiveKey)!, deal, today, now);

    const matrixKey = `${ownerKey}:${collectiveKey}`;
    if (!ownerCollectives.has(matrixKey)) ownerCollectives.set(matrixKey, { ...emptyBucket(matrixKey, `${owner} / ${collective}`), owner, collective });
    applyToBucket(ownerCollectives.get(matrixKey)!, deal, today, now);

    if (status === "open") {
      const stageKey = `${collectiveKey}:${asString(deal.stage_id) || stage}`;
      if (!stages.has(stageKey)) stages.set(stageKey, { ...emptyBucket(stageKey, `${collective} / ${stage}`), collective, stage });
      applyToBucket(stages.get(stageKey)!, deal, today, now);
    }

    if (status === "lost") {
      const reason = asString(deal.lost_reason) || "No reason captured";
      const row = lostReasons.get(reason) || { reason, count: 0, value: 0 };
      row.count += 1;
      row.value += asNumber(deal.value);
      lostReasons.set(reason, row);
    }
  }

  const recentDeals = [...deals]
    .sort((a, b) => (parsePipedriveDate(b.update_time || b.add_time)?.getTime() || 0) - (parsePipedriveDate(a.update_time || a.add_time)?.getTime() || 0))
    .slice(0, 120)
    .map((deal) => ({
      id: deal.id,
      title: deal.title,
      owner: ownerName(deal, lookups.users),
      collective: pipelineName(deal, lookups.pipelines),
      stage: stageName(deal, lookups.stages),
      status: statusOf(deal),
      value: asNumber(deal.value),
      weighted_value: asNumber(deal.weighted_value),
      currency: asString(deal.currency),
      add_time: deal.add_time,
      update_time: deal.update_time,
      expected_close_date: deal.expected_close_date,
      next_activity_date: deal.next_activity_date,
      lost_reason: deal.lost_reason,
    }));

  return {
    ok: true,
    ready: true,
    generated_at: now.toISOString(),
    snapshot_date: today,
    timezone: TIMEZONE,
    source: {
      deal_count: deals.length,
      stale_days: STALE_DAYS,
    },
    totals: finalizeBucket(totals),
    owners: topRows([...owners.values()].map(finalizeBucket), 50),
    collectives: topRows([...collectives.values()].map(finalizeBucket), 50),
    owner_collectives: topRows([...ownerCollectives.values()].map(finalizeBucket), 200),
    stages: topRows([...stages.values()].map(finalizeBucket), 100),
    lost_reasons: [...lostReasons.values()].sort((a, b) => b.count - a.count || b.value - a.value).slice(0, 30),
    recent_deals: recentDeals,
  };
}

async function ensureTable(sql: ReturnType<typeof wmill.datatable>) {
  await sql`
    CREATE TABLE IF NOT EXISTS pipedrive_deal_snapshot_cache_v2 (
      snapshot_key TEXT PRIMARY KEY,
      snapshot_date DATE NOT NULL,
      generated_at TIMESTAMPTZ NOT NULL,
      deal_count INTEGER NOT NULL DEFAULT 0,
      payload TEXT NOT NULL
    )
  `.execute();
  await sql`CREATE INDEX IF NOT EXISTS pipedrive_deal_snapshot_cache_v2_generated_at_idx ON pipedrive_deal_snapshot_cache_v2 (generated_at DESC)`.execute();
}

async function writeSnapshot(payload: Record<string, any>) {
  const sql = wmill.datatable("main");
  await ensureTable(sql);
  const generatedAt = payload.generated_at;
  const snapshotDate = payload.snapshot_date;
  const dealCount = payload.source?.deal_count || 0;
  for (const key of ["latest", `date:${snapshotDate}`]) {
    await sql`
      INSERT INTO pipedrive_deal_snapshot_cache_v2 (snapshot_key, snapshot_date, generated_at, deal_count, payload)
      VALUES (${key}, ${snapshotDate}::DATE, ${generatedAt}::TIMESTAMPTZ, ${dealCount}, ${JSON.stringify(payload)})
      ON CONFLICT (snapshot_key) DO UPDATE
      SET snapshot_date = EXCLUDED.snapshot_date,
          generated_at = EXCLUDED.generated_at,
          deal_count = EXCLUDED.deal_count,
          payload = EXCLUDED.payload
    `.execute();
  }
}

export async function main(max_deals = 10000, dry_run = false) {
  const maxDeals = Math.max(1, Math.min(50000, Number(max_deals) || 10000));
  const [deals, lookups] = await Promise.all([fetchAllDeals(maxDeals), fetchLookups()]);
  const payload = summarize(deals, lookups);
  if (!dry_run) await writeSnapshot(payload);
  return { ...payload, dry_run };
}
