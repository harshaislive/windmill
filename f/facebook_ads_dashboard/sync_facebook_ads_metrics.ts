import * as wmill from "windmill-client";

declare const process: { env: Record<string, string | undefined> };

type ActionRow = { action_type?: string; value?: string | number };
type InsightRow = Record<string, any> & {
  campaign_id?: string;
  campaign_name?: string;
  ad_id?: string;
  ad_name?: string;
  spend?: string;
  reach?: string;
  impressions?: string;
  frequency?: string;
  actions?: ActionRow[];
  conversions?: ActionRow[];
  date_start?: string;
};

const ROOT = "f/facebook_ads_dashboard";
const TYPEFORM_SUBMIT = "offsite_conversion.fb_pixel_custom.TypeformSubmit";
const TYPEFORM_FIRST_INTERACTION = "offsite_conversion.fb_pixel_custom.TypeformFirstInteraction";
const LEAD_INTENT_WORDS = [
  "interested",
  "location",
  "details",
  "price",
  "cost",
  "visit",
  "call",
  "contact",
  "share",
  "send",
  "dm",
  "brochure",
  "invite",
  "booking",
  "available",
  "where",
  "address",
];
const RISK_WORDS = [
  "fraud",
  "fake",
  "scam",
  "careful",
  "complaint",
  "cheat",
  "illegal",
  "destroy",
  "problem",
  "issue",
  "risk",
  "beware",
];

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeRate(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function actionValue(rows: ActionRow[] | undefined, keys: string[]): number {
  if (!Array.isArray(rows)) return 0;
  const found = rows.find((row) => keys.includes(String(row.action_type)));
  return num(found?.value);
}

function dateInTimezone(date = new Date(), timezone = "Asia/Kolkata") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function addDays(date: string, days: number) {
  const current = new Date(`${date}T00:00:00+05:30`);
  current.setUTCDate(current.getUTCDate() + days);
  return dateInTimezone(current, "Asia/Kolkata");
}

function normalizeGraphVersion(value: string): string {
  return value.replace(/^\/+/, "").startsWith("v") ? value.replace(/^\/+/, "") : `v${value.replace(/^\/+/, "")}`;
}

function normalizeAdAccountId(value: string): string {
  const trimmed = value.trim().replace(/^\/+/, "");
  return trimmed.startsWith("act_") ? trimmed : `act_${trimmed}`;
}

async function requiredVariable(name: string): Promise<string> {
  const value = await wmill.getVariable(`${ROOT}/${name}`);
  if (!value || value.startsWith("__ADD_")) {
    throw new Error(`Missing Windmill variable ${ROOT}/${name}`);
  }
  return value;
}

function apiCandidates(path: string) {
  const base = (process.env.BASE_INTERNAL_URL || process.env.BASE_URL || "").replace(/\/+$/, "");
  if (!base) throw new Error("BASE_INTERNAL_URL or BASE_URL is required for datatable access.");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (base.endsWith("/api")) return [`${base}${normalized}`];
  return [`${base}/api${normalized}`, `${base}${normalized}`];
}

async function apiPost(path: string, body: unknown) {
  const token = process.env.WM_TOKEN;
  if (!token) throw new Error("WM_TOKEN is required for datatable access.");
  let lastError = "";
  for (const candidate of apiCandidates(path)) {
    const response = await fetch(candidate, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (response.ok) return await response.json();
    lastError = `${response.status} ${await response.text().catch(() => "")}`;
    if (response.status !== 404) break;
  }
  throw new Error(`Windmill API request failed for ${path}: ${lastError}`);
}

function datatable(workspace: string) {
  return (strings: TemplateStringsArray, ...values: unknown[]) => {
    const args = Object.fromEntries(values.map((value, index) => [`arg${index + 1}`, value]));
    const comments = values.map((_, index) => `-- $${index + 1} arg${index + 1}`).join("\n");
    const placeholder = (value: unknown, nextChunk: string, index: number) => {
      if (nextChunk.trimStart().startsWith("::")) return `$${index + 1}`;
      if (typeof value === "number") return Number.isInteger(value) ? `$${index + 1}::BIGINT` : `$${index + 1}::DOUBLE PRECISION`;
      if (typeof value === "boolean") return `$${index + 1}::BOOLEAN`;
      if (value === null || value === undefined || typeof value === "string") return `$${index + 1}::TEXT`;
      return `$${index + 1}::JSONB`;
    };
    const content = strings.reduce((query, chunk, index) => {
      return query + chunk + (index < values.length ? placeholder(values[index], strings[index + 1], index) : "");
    }, comments ? `${comments}\n\n` : "");

    const run = () =>
      apiPost(`/w/${workspace}/jobs/run_inline/preview`, {
        language: "postgresql",
        content,
        args: {
          ...args,
          database: "datatable://main",
        },
      });

    return {
      execute: run,
      fetch: run,
      async fetchOne() {
        const rows = await run();
        return Array.isArray(rows) ? rows[0] : rows;
      },
    };
  };
}

async function graphGet(pathOrUrl: string, token: string, params: Record<string, any> = {}) {
  const url = pathOrUrl.startsWith("http")
    ? new URL(pathOrUrl)
    : new URL(`https://graph.facebook.com/${pathOrUrl.replace(/^\/+/, "")}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  url.searchParams.set("access_token", token);
  const response = await fetch(url);
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.error?.message || `Meta API request failed: ${url.pathname}`);
  }
  return json;
}

async function graphGetAll(path: string, token: string, params: Record<string, any>) {
  const rows: any[] = [];
  let json = await graphGet(path, token, params);
  rows.push(...(json.data || []));
  while (json.paging?.next) {
    json = await graphGet(json.paging.next, token);
    rows.push(...(json.data || []));
  }
  return rows;
}

function normalizeInsight(row: InsightRow) {
  const spend = num(row.spend);
  const reach = num(row.reach);
  const impressions = num(row.impressions);
  const link_clicks = actionValue(row.actions, ["link_click"]);
  const website_visits = actionValue(row.actions, ["landing_page_view", "omni_landing_page_view"]);
  const typeform_submits = actionValue(row.conversions, [TYPEFORM_SUBMIT]);
  const typeform_first_interactions = actionValue(row.conversions, [TYPEFORM_FIRST_INTERACTION]);
  const shares = actionValue(row.actions, ["post"]);
  const comments = actionValue(row.actions, ["comment", "onsite_conversion.post_net_comment"]);
  return {
    ...row,
    metric_date: row.date_start,
    spend,
    reach,
    impressions,
    frequency: num(row.frequency),
    link_clicks,
    website_visits,
    typeform_submits,
    typeform_first_interactions,
    shares,
    comments,
  };
}

async function fetchInsights(adAccountId: string, token: string, graphVersion: string, level: "campaign" | "ad", startDate: string, endDate: string) {
  const fields = level === "campaign"
    ? "campaign_id,campaign_name,spend,reach,impressions,frequency,actions,conversions,date_start,date_stop"
    : "ad_id,ad_name,campaign_id,campaign_name,spend,reach,impressions,frequency,actions,conversions,date_start,date_stop";
  const rows = await graphGetAll(`/${graphVersion}/${adAccountId}/insights`, token, {
    level,
    time_increment: 1,
    time_range: JSON.stringify({ since: startDate, until: endDate }),
    limit: 500,
    fields,
  });
  return rows.map(normalizeInsight);
}

async function fetchCreativeMap(adRows: ReturnType<typeof normalizeInsight>[], token: string, graphVersion: string) {
  const uniqueAdIds = [...new Set(adRows.map((row) => row.ad_id).filter(Boolean))].slice(0, 250);
  const map: Record<string, any> = {};
  await Promise.all(uniqueAdIds.map(async (adId) => {
    try {
      const meta = await graphGet(`/${graphVersion}/${adId}`, token, {
        fields: "creative{name,thumbnail_url,title,body,effective_object_story_id}",
      });
      map[String(adId)] = meta.creative || {};
    } catch {
      map[String(adId)] = {};
    }
  }));
  return map;
}

async function ensureTables(sql: ReturnType<typeof datatable>) {
  await sql`
    CREATE TABLE IF NOT EXISTS fb_ads_campaign_daily_metrics (
      metric_date DATE NOT NULL,
      campaign_id TEXT NOT NULL,
      campaign_name TEXT NOT NULL,
      spend NUMERIC NOT NULL DEFAULT 0,
      reach INTEGER NOT NULL DEFAULT 0,
      impressions INTEGER NOT NULL DEFAULT 0,
      frequency NUMERIC NOT NULL DEFAULT 0,
      link_clicks INTEGER NOT NULL DEFAULT 0,
      website_visits INTEGER NOT NULL DEFAULT 0,
      typeform_submits INTEGER NOT NULL DEFAULT 0,
      typeform_first_interactions INTEGER NOT NULL DEFAULT 0,
      shares INTEGER NOT NULL DEFAULT 0,
      comments INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (metric_date, campaign_id)
    )
  `.execute();
  await sql`
    CREATE TABLE IF NOT EXISTS fb_ads_creative_daily_metrics (
      metric_date DATE NOT NULL,
      ad_id TEXT NOT NULL,
      ad_name TEXT NOT NULL,
      campaign_id TEXT,
      campaign_name TEXT,
      spend NUMERIC NOT NULL DEFAULT 0,
      reach INTEGER NOT NULL DEFAULT 0,
      impressions INTEGER NOT NULL DEFAULT 0,
      frequency NUMERIC NOT NULL DEFAULT 0,
      link_clicks INTEGER NOT NULL DEFAULT 0,
      website_visits INTEGER NOT NULL DEFAULT 0,
      typeform_submits INTEGER NOT NULL DEFAULT 0,
      typeform_first_interactions INTEGER NOT NULL DEFAULT 0,
      shares INTEGER NOT NULL DEFAULT 0,
      comments INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (metric_date, ad_id)
    )
  `.execute();
  await sql`
    CREATE TABLE IF NOT EXISTS fb_ads_creative_metadata (
      ad_id TEXT PRIMARY KEY,
      creative_name TEXT,
      thumbnail_url TEXT,
      title TEXT,
      body TEXT,
      effective_object_story_id TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute();
  await sql`
    CREATE TABLE IF NOT EXISTS fb_ads_comment_response_snapshots (
      snapshot_key TEXT PRIMARY KEY,
      snapshot_at TIMESTAMPTZ NOT NULL,
      comments_checked INTEGER NOT NULL DEFAULT 0,
      answered_comments INTEGER NOT NULL DEFAULT 0,
      unanswered_count INTEGER NOT NULL DEFAULT 0,
      response_rate NUMERIC NOT NULL DEFAULT 0,
      lead_intent_comments INTEGER NOT NULL DEFAULT 0,
      risk_comments INTEGER NOT NULL DEFAULT 0,
      top_creative_name TEXT,
      top_creative_unanswered_count INTEGER NOT NULL DEFAULT 0,
      unanswered_comments_json JSONB NOT NULL DEFAULT '[]'::JSONB,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute();
  await sql`
    CREATE TABLE IF NOT EXISTS fb_ads_sync_runs (
      run_id BIGSERIAL PRIMARY KEY,
      started_at TIMESTAMPTZ NOT NULL,
      completed_at TIMESTAMPTZ,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      campaign_rows INTEGER NOT NULL DEFAULT 0,
      creative_rows INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      error_message TEXT
    )
  `.execute();
}

async function upsertCampaignRows(sql: ReturnType<typeof datatable>, rows: ReturnType<typeof normalizeInsight>[]) {
  if (!rows.length) return;
  const payload = rows.map((row) => ({
    metric_date: row.metric_date,
    campaign_id: row.campaign_id || "unknown",
    campaign_name: row.campaign_name || "Unknown",
    spend: row.spend,
    reach: row.reach,
    impressions: row.impressions,
    frequency: row.frequency,
    link_clicks: row.link_clicks,
    website_visits: row.website_visits,
    typeform_submits: row.typeform_submits,
    typeform_first_interactions: row.typeform_first_interactions,
    shares: row.shares,
    comments: row.comments,
  }));
  await sql`
    INSERT INTO fb_ads_campaign_daily_metrics (
      metric_date, campaign_id, campaign_name, spend, reach, impressions, frequency,
      link_clicks, website_visits, typeform_submits, typeform_first_interactions, shares, comments, updated_at
    )
    SELECT
      metric_date::DATE,
      campaign_id,
      campaign_name,
      spend,
      reach,
      impressions,
      frequency,
      link_clicks,
      website_visits,
      typeform_submits,
      typeform_first_interactions,
      shares,
      comments,
      NOW()
    FROM jsonb_to_recordset(${payload}::JSONB) AS row(
      metric_date TEXT,
      campaign_id TEXT,
      campaign_name TEXT,
      spend NUMERIC,
      reach INTEGER,
      impressions INTEGER,
      frequency NUMERIC,
      link_clicks INTEGER,
      website_visits INTEGER,
      typeform_submits INTEGER,
      typeform_first_interactions INTEGER,
      shares INTEGER,
      comments INTEGER
    )
    ON CONFLICT (metric_date, campaign_id) DO UPDATE SET
      campaign_name = EXCLUDED.campaign_name,
      spend = EXCLUDED.spend,
      reach = EXCLUDED.reach,
      impressions = EXCLUDED.impressions,
      frequency = EXCLUDED.frequency,
      link_clicks = EXCLUDED.link_clicks,
      website_visits = EXCLUDED.website_visits,
      typeform_submits = EXCLUDED.typeform_submits,
      typeform_first_interactions = EXCLUDED.typeform_first_interactions,
      shares = EXCLUDED.shares,
      comments = EXCLUDED.comments,
      updated_at = NOW()
  `.execute();
}

async function upsertCreativeRows(sql: ReturnType<typeof datatable>, rows: ReturnType<typeof normalizeInsight>[]) {
  if (!rows.length) return;
  const payload = rows.map((row) => ({
    metric_date: row.metric_date,
    ad_id: row.ad_id || "unknown",
    ad_name: row.ad_name || "Unknown",
    campaign_id: row.campaign_id || null,
    campaign_name: row.campaign_name || null,
    spend: row.spend,
    reach: row.reach,
    impressions: row.impressions,
    frequency: row.frequency,
    link_clicks: row.link_clicks,
    website_visits: row.website_visits,
    typeform_submits: row.typeform_submits,
    typeform_first_interactions: row.typeform_first_interactions,
    shares: row.shares,
    comments: row.comments,
  }));
  await sql`
    INSERT INTO fb_ads_creative_daily_metrics (
      metric_date, ad_id, ad_name, campaign_id, campaign_name, spend, reach, impressions, frequency,
      link_clicks, website_visits, typeform_submits, typeform_first_interactions, shares, comments, updated_at
    )
    SELECT
      metric_date::DATE,
      ad_id,
      ad_name,
      campaign_id,
      campaign_name,
      spend,
      reach,
      impressions,
      frequency,
      link_clicks,
      website_visits,
      typeform_submits,
      typeform_first_interactions,
      shares,
      comments,
      NOW()
    FROM jsonb_to_recordset(${payload}::JSONB) AS row(
      metric_date TEXT,
      ad_id TEXT,
      ad_name TEXT,
      campaign_id TEXT,
      campaign_name TEXT,
      spend NUMERIC,
      reach INTEGER,
      impressions INTEGER,
      frequency NUMERIC,
      link_clicks INTEGER,
      website_visits INTEGER,
      typeform_submits INTEGER,
      typeform_first_interactions INTEGER,
      shares INTEGER,
      comments INTEGER
    )
    ON CONFLICT (metric_date, ad_id) DO UPDATE SET
      ad_name = EXCLUDED.ad_name,
      campaign_id = EXCLUDED.campaign_id,
      campaign_name = EXCLUDED.campaign_name,
      spend = EXCLUDED.spend,
      reach = EXCLUDED.reach,
      impressions = EXCLUDED.impressions,
      frequency = EXCLUDED.frequency,
      link_clicks = EXCLUDED.link_clicks,
      website_visits = EXCLUDED.website_visits,
      typeform_submits = EXCLUDED.typeform_submits,
      typeform_first_interactions = EXCLUDED.typeform_first_interactions,
      shares = EXCLUDED.shares,
      comments = EXCLUDED.comments,
      updated_at = NOW()
  `.execute();
}

async function upsertCreativeMetadata(sql: ReturnType<typeof datatable>, creativeMap: Record<string, any>) {
  const payload = Object.entries(creativeMap).map(([adId, creative]) => ({
    ad_id: adId,
    creative_name: creative?.name || creative?.title || null,
    thumbnail_url: creative?.thumbnail_url || null,
    title: creative?.title || null,
    body: creative?.body || null,
    effective_object_story_id: creative?.effective_object_story_id || null,
  }));
  if (!payload.length) return;
  await sql`
    INSERT INTO fb_ads_creative_metadata (
      ad_id, creative_name, thumbnail_url, title, body, effective_object_story_id, updated_at
    )
    SELECT
      ad_id,
      creative_name,
      thumbnail_url,
      title,
      body,
      effective_object_story_id,
      NOW()
    FROM jsonb_to_recordset(${payload}::JSONB) AS row(
      ad_id TEXT,
      creative_name TEXT,
      thumbnail_url TEXT,
      title TEXT,
      body TEXT,
      effective_object_story_id TEXT
    )
    ON CONFLICT (ad_id) DO UPDATE SET
      creative_name = EXCLUDED.creative_name,
      thumbnail_url = EXCLUDED.thumbnail_url,
      title = EXCLUDED.title,
      body = EXCLUDED.body,
      effective_object_story_id = EXCLUDED.effective_object_story_id,
      updated_at = NOW()
  `.execute();
}

function includesAny(text: string, words: string[]) {
  const lower = text.toLowerCase();
  return words.some((word) => lower.includes(word));
}

function groupBy<T>(rows: T[], getKey: (row: T) => string | undefined) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = getKey(row) || "unknown";
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  return groups;
}

async function graphComments(objectId: string, pageToken: string, graphVersion: string) {
  return await graphGetAll(`/${graphVersion}/${objectId}/comments`, pageToken, {
    fields: "id,from{name,id},message,created_time,comment_count,comments{from{name,id},message,created_time}",
    filter: "stream",
    limit: 100,
  });
}

async function fetchCommunity(pageId: string, pageToken: string, graphVersion: string, creativeMap: Record<string, any>) {
  const storyTargets = Object.entries(creativeMap)
    .filter(([, creative]) => creative?.effective_object_story_id)
    .map(([adId, creative]) => ({
      ad_id: adId,
      story_id: creative.effective_object_story_id,
      creative_name: creative.name || creative.title || adId,
    }))
    .slice(0, 40);

  let pagePosts: any[] = [];
  try {
    pagePosts = await graphGetAll(`/${graphVersion}/${pageId}/posts`, pageToken, {
      fields: "id,message,created_time,permalink_url",
      limit: 40,
    });
  } catch {
    pagePosts = [];
  }

  const targets = [
    ...pagePosts.map((post) => ({ story_id: post.id, creative_name: "Page post", ad_id: "" })),
    ...storyTargets,
  ];
  const unanswered: any[] = [];
  let commentsChecked = 0;
  let answeredComments = 0;

  for (const target of targets) {
    let comments: any[] = [];
    try {
      comments = await graphComments(target.story_id, pageToken, graphVersion);
    } catch {
      comments = [];
    }
    for (const comment of comments) {
      commentsChecked += 1;
      const replies = comment.comments?.data || [];
      const beforestReply = replies.some((reply: any) => String(reply.from?.id || "") === String(pageId));
      if (beforestReply) {
        answeredComments += 1;
      } else {
        const text = comment.message || "";
        unanswered.push({
          comment_id: comment.id,
          creative_name: target.creative_name,
          ad_id: target.ad_id,
          username: comment.from?.name || "Unknown",
          text,
          created_time: comment.created_time,
          lead_intent: includesAny(text, LEAD_INTENT_WORDS),
          risk: includesAny(text, RISK_WORDS),
        });
      }
    }
  }

  const topCreative = [...groupBy(unanswered, (row) => row.creative_name).entries()]
    .map(([creative_name, rows]) => ({ creative_name, unanswered_count: rows.length }))
    .sort((a, b) => b.unanswered_count - a.unanswered_count)[0] || null;

  return {
    comments_checked: commentsChecked,
    answered_comments: answeredComments,
    unanswered_count: unanswered.length,
    response_rate: safeRate(answeredComments, commentsChecked),
    lead_intent_comments: unanswered.filter((row) => row.lead_intent).length,
    risk_comments: unanswered.filter((row) => row.risk).length,
    top_creative_name: topCreative?.creative_name || null,
    top_creative_unanswered_count: topCreative?.unanswered_count || 0,
    unanswered: unanswered.slice(0, 50),
  };
}

async function upsertCommunity(sql: ReturnType<typeof datatable>, community: Awaited<ReturnType<typeof fetchCommunity>>) {
  await sql`
    INSERT INTO fb_ads_comment_response_snapshots (
      snapshot_key, snapshot_at, comments_checked, answered_comments, unanswered_count, response_rate,
      lead_intent_comments, risk_comments, top_creative_name, top_creative_unanswered_count,
      unanswered_comments_json, updated_at
    )
    VALUES (
      'latest', NOW(), ${community.comments_checked}, ${community.answered_comments}, ${community.unanswered_count},
      ${community.response_rate}, ${community.lead_intent_comments}, ${community.risk_comments},
      ${community.top_creative_name}, ${community.top_creative_unanswered_count}, ${community.unanswered}, NOW()
    )
    ON CONFLICT (snapshot_key) DO UPDATE SET
      snapshot_at = EXCLUDED.snapshot_at,
      comments_checked = EXCLUDED.comments_checked,
      answered_comments = EXCLUDED.answered_comments,
      unanswered_count = EXCLUDED.unanswered_count,
      response_rate = EXCLUDED.response_rate,
      lead_intent_comments = EXCLUDED.lead_intent_comments,
      risk_comments = EXCLUDED.risk_comments,
      top_creative_name = EXCLUDED.top_creative_name,
      top_creative_unanswered_count = EXCLUDED.top_creative_unanswered_count,
      unanswered_comments_json = EXCLUDED.unanswered_comments_json,
      updated_at = NOW()
  `.execute();
}

export async function main(lookback_days = 30, end_date = "", timezone = "Asia/Kolkata", include_community = false) {
  const workspace =
    process.env.WM_WORKSPACE ||
    process.env.WORKSPACE ||
    process.env.WM_WORKSPACE_ID ||
    "beforest-automations";
  const sql = datatable(workspace);
  await ensureTables(sql);

  const endDate = end_date || dateInTimezone(new Date(), timezone);
  const startDate = addDays(endDate, -(Math.max(1, Number(lookback_days)) - 1));
  const startedAt = new Date().toISOString();

  try {
    const [userToken, pageToken, pageId, rawGraphVersion, rawAdAccountId] = await Promise.all([
      requiredVariable("META_FB_USER_TOKEN"),
      requiredVariable("META_FB_PAGE_TOKEN"),
      requiredVariable("META_FB_PAGE_ID"),
      requiredVariable("META_GRAPH_VERSION"),
      requiredVariable("META_AD_ACCOUNT_ID"),
    ]);
    const graphVersion = normalizeGraphVersion(rawGraphVersion);
    const adAccountId = normalizeAdAccountId(rawAdAccountId);

    const [campaignRows, creativeRows] = await Promise.all([
      fetchInsights(adAccountId, userToken, graphVersion, "campaign", startDate, endDate),
      fetchInsights(adAccountId, userToken, graphVersion, "ad", startDate, endDate),
    ]);
    const creativeMap = await fetchCreativeMap(creativeRows, userToken, graphVersion);

    await upsertCampaignRows(sql, campaignRows);
    await upsertCreativeRows(sql, creativeRows);
    await upsertCreativeMetadata(sql, creativeMap);
    const community = include_community
      ? await fetchCommunity(pageId, pageToken, graphVersion, creativeMap)
      : {
          unanswered_count: 0,
          comments_checked: 0,
          answered_comments: 0,
          response_rate: 0,
          lead_intent_comments: 0,
          risk_comments: 0,
        };
    if (include_community) {
      await upsertCommunity(sql, community as Awaited<ReturnType<typeof fetchCommunity>>);
    }

    await sql`
      INSERT INTO fb_ads_sync_runs (
        started_at, completed_at, start_date, end_date, campaign_rows, creative_rows, status, error_message
      )
      VALUES (
        ${startedAt}::TEXT::TIMESTAMPTZ, NOW(), ${startDate}::TEXT::DATE, ${endDate}::TEXT::DATE,
        ${campaignRows.length}, ${creativeRows.length}, 'success', null
      )
    `.execute();

    return {
      ok: true,
      start_date: startDate,
      end_date: endDate,
      campaign_rows: campaignRows.length,
      creative_rows: creativeRows.length,
      community_included: include_community,
      community_unanswered: community.unanswered_count,
    };
  } catch (error: any) {
    await sql`
      INSERT INTO fb_ads_sync_runs (
        started_at, completed_at, start_date, end_date, campaign_rows, creative_rows, status, error_message
      )
      VALUES (
        ${startedAt}::TEXT::TIMESTAMPTZ, NOW(), ${startDate}::TEXT::DATE, ${endDate}::TEXT::DATE,
        0, 0, 'failed', ${error?.message || String(error)}
      )
    `.execute();
    throw error;
  }
}
