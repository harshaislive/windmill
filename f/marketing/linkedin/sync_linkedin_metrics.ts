import * as wmill from "windmill-client";

const BASE = "f/marketing";
const API_VARIABLE_CANDIDATES = [
  `${BASE}/maton_api_key`,
  `${BASE}/linkedin/maton_api_key`,
  `${BASE}/youtube_maton_api_key`,
];
const ORG_URN_VARIABLES = [
  `${BASE}/linkedin/organization_urn`,
  `${BASE}/linkedin_organization_urn`,
];
const VANITY_VARIABLES = [
  `${BASE}/linkedin/organization_vanity_name`,
  `${BASE}/linkedin_organization_vanity_name`,
];
const APP_SLUG_VARIABLES = [
  `${BASE}/linkedin/maton_app_slug`,
  `${BASE}/linkedin_maton_app_slug`,
];
const DEFAULT_APP_SLUG = "linkedin";
const DEFAULT_VANITY_NAME = "beforest";
const LINKEDIN_VERSION = "202605";

type Row = Record<string, unknown>;

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
      if (nextChunk.trimStart().startsWith("::date") && typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return `'${value}'`;
      }
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
        args: { ...args, database: "datatable://main" },
      });
    return {
      execute: run,
      fetch: run,
      then(resolve: (value: unknown) => void, reject: (reason?: unknown) => void) {
        return run().then(resolve, reject);
      },
      async fetchOne() {
        const rows = await run();
        return Array.isArray(rows) ? rows[0] : rows;
      },
    };
  };
}

function dateInTz(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function toNumber(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
}

function pct(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 10000) / 100;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function firstVariable(paths: string[]) {
  for (const path of paths) {
    const value = await wmill.getVariable(path).catch(() => "");
    if (value?.trim()) return value.trim();
  }
  return "";
}

async function getMatonApiKey() {
  const value = await firstVariable(API_VARIABLE_CANDIDATES);
  if (value) return value;
  throw new Error(`Missing Maton API key variable. Add ${BASE}/maton_api_key or keep ${BASE}/youtube_maton_api_key available.`);
}

function gatewayUrl(appSlug: string, nativePath: string, params: Record<string, string | number> = {}) {
  const cleanPath = nativePath.replace(/^\/+/, "");
  const url = new URL(`https://gateway.maton.ai/${appSlug}/${cleanPath}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  return url.toString();
}

async function linkedInGet(
  apiKey: string,
  appSlug: string,
  nativePath: string,
  params: Record<string, string | number> = {},
  useRestli2 = true,
) {
  const url = gatewayUrl(appSlug, nativePath, params);
  let lastError = "";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      "LinkedIn-Version": LINKEDIN_VERSION,
    };
    if (useRestli2) headers["X-Restli-Protocol-Version"] = "2.0.0";
    const response = await fetch(url, {
      headers,
    });
    const text = await response.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
    if (response.ok) return data;
    lastError = data?.message || data?.error?.message || text || response.statusText;
    if (response.status < 500 && response.status !== 429) break;
    await sleep(1000 * attempt);
  }
  throw new Error(`LinkedIn gateway request failed for ${nativePath}: ${lastError}`);
}

function elements(payload: any): Row[] {
  if (Array.isArray(payload?.elements)) return payload.elements;
  if (Array.isArray(payload?.data?.elements)) return payload.data.elements;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload)) return payload;
  return payload ? [payload] : [];
}

function findNumberDeep(value: any, names: string[]): number {
  let total = 0;
  const seen = new Set<unknown>();
  const visit = (node: any, key = "") => {
    if (node === null || node === undefined || seen.has(node)) return;
    if (typeof node === "object") seen.add(node);
    if (typeof node === "number" && names.some((name) => key.toLowerCase().includes(name))) {
      total += node;
      return;
    }
    if (typeof node !== "object") return;
    for (const [nextKey, nextValue] of Object.entries(node)) visit(nextValue, nextKey);
  };
  visit(value);
  return total;
}

function dateFromTimeRange(row: any, fallback: string) {
  const start = row?.timeRange?.start || row?.timeIntervals?.timeRange?.start;
  if (!start) return fallback;
  const date = new Date(Number(start));
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString().slice(0, 10);
}

function textFromPost(post: any) {
  return (
    post?.commentary ||
    post?.specificContent?.["com.linkedin.ugc.ShareContent"]?.shareCommentary?.text ||
    post?.content?.title ||
    post?.title ||
    post?.id ||
    "LinkedIn post"
  );
}

function postUrl(postId: string) {
  const id = postId.split(":").pop() || postId;
  return `https://www.linkedin.com/feed/update/${id}`;
}

function extractPageMetrics(row: any) {
  const views = findNumberDeep(row, ["view"]);
  const clicks = findNumberDeep(row, ["click"]);
  const uniqueVisitors = findNumberDeep(row, ["unique"]);
  return { views, clicks, uniqueVisitors };
}

function extractShareMetrics(row: any) {
  const stats = row?.totalShareStatistics || row;
  const impressions = toNumber(stats.impressionCount ?? stats.impressions) || findNumberDeep(stats, ["impression"]);
  const uniqueImpressions = toNumber(stats.uniqueImpressionsCount ?? stats.uniqueImpressions) || findNumberDeep(stats, ["uniqueimpression"]);
  const clicks = toNumber(stats.clickCount ?? stats.clicks) || findNumberDeep(stats, ["click"]);
  const likes = toNumber(stats.likeCount ?? stats.likes) || findNumberDeep(stats, ["like"]);
  const comments = toNumber(stats.commentCount ?? stats.comments) || findNumberDeep(stats, ["comment"]);
  const shares = toNumber(stats.shareCount ?? stats.shares) || findNumberDeep(stats, ["share"]);
  const reactions = toNumber(stats.reactionCount ?? stats.reactions) || findNumberDeep(stats, ["reaction"]);
  const engagements = likes + comments + shares + reactions + clicks;
  return {
    impressions,
    uniqueImpressions,
    clicks,
    likes,
    comments,
    shares,
    reactions,
    engagements,
    engagementRate: toNumber(stats.engagement) || pct(engagements, impressions),
  };
}

function extractFollowerGains(row: any) {
  const gains = row?.followerGains || row;
  const organic = toNumber(gains.organicFollowerGain);
  const paid = toNumber(gains.paidFollowerGain);
  const total = organic + paid || findNumberDeep(row, ["followergain"]);
  return { organic, paid, total };
}

function extractFollowerCount(payload: any) {
  const rows = elements(payload);
  const direct = rows.reduce((sum, row) => sum + findNumberDeep(row, ["followercount", "followercounts"]), 0);
  return direct || rows.reduce((sum, row) => sum + findNumberDeep(row, ["count"]), 0);
}

async function resolveOrganizationUrn(apiKey: string, appSlug: string) {
  const explicit = await firstVariable(ORG_URN_VARIABLES);
  if (explicit) return explicit;
  const vanityName = (await firstVariable(VANITY_VARIABLES)) || DEFAULT_VANITY_NAME;
  const payload = await linkedInGet(apiKey, appSlug, "rest/organizations", {
    q: "vanityName",
    vanityName,
  });
  const org = elements(payload)[0] as any;
  const id = org?.id || org?.localizedName || "";
  if (!id || String(id).startsWith("urn:")) return String(id);
  return `urn:li:organization:${id}`;
}

async function createTables(sql: any) {
  await sql`
    CREATE TABLE IF NOT EXISTS linkedin_sync_runs (
      sync_run_id TEXT PRIMARY KEY,
      snapshot_date DATE NOT NULL,
      window_start DATE NOT NULL,
      window_end DATE NOT NULL,
      status TEXT NOT NULL,
      organization_urn TEXT,
      started_at TIMESTAMPTZ NOT NULL,
      completed_at TIMESTAMPTZ,
      error TEXT,
      counts JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS linkedin_daily_metrics (
      snapshot_date DATE NOT NULL,
      metric_date DATE NOT NULL,
      window_start DATE NOT NULL,
      window_end DATE NOT NULL,
      impressions INTEGER DEFAULT 0,
      unique_impressions INTEGER DEFAULT 0,
      page_views INTEGER DEFAULT 0,
      unique_visitors INTEGER DEFAULT 0,
      clicks INTEGER DEFAULT 0,
      likes INTEGER DEFAULT 0,
      comments INTEGER DEFAULT 0,
      shares INTEGER DEFAULT 0,
      reactions INTEGER DEFAULT 0,
      engagements INTEGER DEFAULT 0,
      engagement_rate NUMERIC DEFAULT 0,
      followers_gained INTEGER DEFAULT 0,
      organic_followers_gained INTEGER DEFAULT 0,
      paid_followers_gained INTEGER DEFAULT 0,
      raw JSONB DEFAULT '{}'::jsonb,
      sync_run_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (snapshot_date, metric_date)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS linkedin_post_metrics (
      snapshot_date DATE NOT NULL,
      window_start DATE NOT NULL,
      window_end DATE NOT NULL,
      post_id TEXT NOT NULL,
      post_title TEXT,
      post_url TEXT,
      published_at TIMESTAMPTZ,
      impressions INTEGER DEFAULT 0,
      unique_impressions INTEGER DEFAULT 0,
      clicks INTEGER DEFAULT 0,
      likes INTEGER DEFAULT 0,
      comments INTEGER DEFAULT 0,
      shares INTEGER DEFAULT 0,
      reactions INTEGER DEFAULT 0,
      engagements INTEGER DEFAULT 0,
      engagement_rate NUMERIC DEFAULT 0,
      raw JSONB DEFAULT '{}'::jsonb,
      sync_run_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (snapshot_date, post_id)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS linkedin_follower_metrics (
      snapshot_date DATE PRIMARY KEY,
      window_start DATE NOT NULL,
      window_end DATE NOT NULL,
      follower_count INTEGER DEFAULT 0,
      followers_gained INTEGER DEFAULT 0,
      organic_followers_gained INTEGER DEFAULT 0,
      paid_followers_gained INTEGER DEFAULT 0,
      raw JSONB DEFAULT '{}'::jsonb,
      sync_run_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS linkedin_profile_growth (
      snapshot_date DATE NOT NULL,
      metric_date DATE NOT NULL,
      follower_count INTEGER DEFAULT 0,
      followers_gained INTEGER DEFAULT 0,
      page_views INTEGER DEFAULT 0,
      unique_visitors INTEGER DEFAULT 0,
      sync_run_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (snapshot_date, metric_date)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS linkedin_engagement_trends (
      snapshot_date DATE NOT NULL,
      metric_date DATE NOT NULL,
      impressions INTEGER DEFAULT 0,
      clicks INTEGER DEFAULT 0,
      likes INTEGER DEFAULT 0,
      comments INTEGER DEFAULT 0,
      shares INTEGER DEFAULT 0,
      reactions INTEGER DEFAULT 0,
      engagements INTEGER DEFAULT 0,
      engagement_rate NUMERIC DEFAULT 0,
      sync_run_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (snapshot_date, metric_date)
    )
  `;
}

async function clearSnapshot(sql: any, snapshotDate: string) {
  await sql`DELETE FROM linkedin_daily_metrics WHERE snapshot_date = ${snapshotDate}::date`;
  await sql`DELETE FROM linkedin_post_metrics WHERE snapshot_date = ${snapshotDate}::date`;
  await sql`DELETE FROM linkedin_follower_metrics WHERE snapshot_date = ${snapshotDate}::date`;
  await sql`DELETE FROM linkedin_profile_growth WHERE snapshot_date = ${snapshotDate}::date`;
  await sql`DELETE FROM linkedin_engagement_trends WHERE snapshot_date = ${snapshotDate}::date`;
}

export async function main(
  lookback_days = 30,
  end_date = "",
  timezone = "Asia/Kolkata",
  dry_run = false,
) {
  const workspace = process.env.WM_WORKSPACE_ID || process.env.WM_WORKSPACE || "beforest-automations";
  const sql = datatable(workspace);
  const startedAt = new Date().toISOString();
  const snapshotDate = dateInTz(new Date(), timezone);
  const windowEnd = end_date || addDays(snapshotDate, -1);
  const windowStart = addDays(windowEnd, -(lookback_days - 1));
  const startMs = new Date(`${windowStart}T00:00:00Z`).getTime();
  const endMs = new Date(`${addDays(windowEnd, 1)}T00:00:00Z`).getTime() - 1;
  const syncRunId = crypto.randomUUID();
  const counts: Record<string, number> = {};

  await createTables(sql);

  try {
    const apiKey = await getMatonApiKey();
    const appSlug = (await firstVariable(APP_SLUG_VARIABLES)) || DEFAULT_APP_SLUG;
    const organizationUrn = await resolveOrganizationUrn(apiKey, appSlug);
    if (!organizationUrn) throw new Error("Could not resolve LinkedIn organization URN. Add f/marketing/linkedin/organization_urn.");

    const commonWindow = {
      "timeIntervals.timeGranularityType": "DAY",
      "timeIntervals.timeRange.start": startMs,
      "timeIntervals.timeRange.end": endMs,
    };
    const [pageStats, followerStats, lifetimeFollowers, shareStats, lifetimeShareStats, posts] = await Promise.all([
      linkedInGet(apiKey, appSlug, "rest/organizationPageStatistics", {
        q: "organization",
        organization: organizationUrn,
        ...commonWindow,
      }, false),
      linkedInGet(apiKey, appSlug, "rest/organizationalEntityFollowerStatistics", {
        q: "organizationalEntity",
        organizationalEntity: organizationUrn,
        ...commonWindow,
      }, false),
      linkedInGet(apiKey, appSlug, "rest/organizationalEntityFollowerStatistics", {
        q: "organizationalEntity",
        organizationalEntity: organizationUrn,
      }),
      linkedInGet(apiKey, appSlug, "rest/organizationalEntityShareStatistics", {
        q: "organizationalEntity",
        organizationalEntity: organizationUrn,
        ...commonWindow,
      }, false),
      linkedInGet(apiKey, appSlug, "rest/organizationalEntityShareStatistics", {
        q: "organizationalEntity",
        organizationalEntity: organizationUrn,
      }),
      linkedInGet(apiKey, appSlug, "rest/posts", {
        q: "author",
        author: organizationUrn,
        count: 50,
        sortBy: "LAST_MODIFIED",
      }).catch((error) => ({ elements: [], error: error instanceof Error ? error.message : String(error) })),
    ]);

    const pageByDate = new Map<string, any>();
    for (const row of elements(pageStats)) pageByDate.set(dateFromTimeRange(row, windowEnd), row);
    const followerByDate = new Map<string, any>();
    for (const row of elements(followerStats)) followerByDate.set(dateFromTimeRange(row, windowEnd), row);
    const shareByDate = new Map<string, any>();
    for (const row of elements(shareStats)) shareByDate.set(dateFromTimeRange(row, windowEnd), row);
    const dates = Array.from(new Set([...pageByDate.keys(), ...followerByDate.keys(), ...shareByDate.keys()])).sort();
    const followerCount = extractFollowerCount(lifetimeFollowers);

    if (dry_run) {
      return {
        dry_run: true,
        snapshot_date: snapshotDate,
        window_start: windowStart,
        window_end: windowEnd,
        organization_urn: organizationUrn,
        counts: {
          daily: dates.length,
          page_stats: elements(pageStats).length,
          follower_stats: elements(followerStats).length,
          share_stats: elements(shareStats).length,
          lifetime_share_stats: elements(lifetimeShareStats).length,
          posts: elements(posts).length,
        },
      };
    }

    await sql`
      INSERT INTO linkedin_sync_runs (sync_run_id, snapshot_date, window_start, window_end, status, organization_urn, started_at)
      VALUES (${syncRunId}, ${snapshotDate}::date, ${windowStart}::date, ${windowEnd}::date, 'running', ${organizationUrn}, ${startedAt}::timestamptz)
    `;
    await clearSnapshot(sql, snapshotDate);

    let totalFollowerGain = 0;
    let organicFollowerGain = 0;
    let paidFollowerGain = 0;
    for (const metricDate of dates) {
      const page = pageByDate.get(metricDate) || {};
      const follower = followerByDate.get(metricDate) || {};
      const share = shareByDate.get(metricDate) || {};
      const pageMetrics = extractPageMetrics(page);
      const shareMetrics = extractShareMetrics(share);
      const followerGains = extractFollowerGains(follower);
      totalFollowerGain += followerGains.total;
      organicFollowerGain += followerGains.organic;
      paidFollowerGain += followerGains.paid;
      await sql`
        INSERT INTO linkedin_daily_metrics
          (snapshot_date, metric_date, window_start, window_end, impressions, unique_impressions, page_views, unique_visitors, clicks, likes, comments, shares, reactions, engagements, engagement_rate, followers_gained, organic_followers_gained, paid_followers_gained, raw, sync_run_id)
        VALUES
          (${snapshotDate}::date, ${metricDate}::date, ${windowStart}::date, ${windowEnd}::date, ${shareMetrics.impressions}, ${shareMetrics.uniqueImpressions}, ${pageMetrics.views}, ${pageMetrics.uniqueVisitors}, ${shareMetrics.clicks + pageMetrics.clicks}, ${shareMetrics.likes}, ${shareMetrics.comments}, ${shareMetrics.shares}, ${shareMetrics.reactions}, ${shareMetrics.engagements}, ${shareMetrics.engagementRate}, ${followerGains.total}, ${followerGains.organic}, ${followerGains.paid}, ${{ page, follower, share }}::jsonb, ${syncRunId})
      `;
      await sql`
        INSERT INTO linkedin_profile_growth
          (snapshot_date, metric_date, follower_count, followers_gained, page_views, unique_visitors, sync_run_id)
        VALUES
          (${snapshotDate}::date, ${metricDate}::date, ${followerCount}, ${followerGains.total}, ${pageMetrics.views}, ${pageMetrics.uniqueVisitors}, ${syncRunId})
      `;
      await sql`
        INSERT INTO linkedin_engagement_trends
          (snapshot_date, metric_date, impressions, clicks, likes, comments, shares, reactions, engagements, engagement_rate, sync_run_id)
        VALUES
          (${snapshotDate}::date, ${metricDate}::date, ${shareMetrics.impressions}, ${shareMetrics.clicks}, ${shareMetrics.likes}, ${shareMetrics.comments}, ${shareMetrics.shares}, ${shareMetrics.reactions}, ${shareMetrics.engagements}, ${shareMetrics.engagementRate}, ${syncRunId})
      `;
    }
    counts.daily = dates.length;

    await sql`
      INSERT INTO linkedin_follower_metrics
        (snapshot_date, window_start, window_end, follower_count, followers_gained, organic_followers_gained, paid_followers_gained, raw, sync_run_id)
      VALUES
        (${snapshotDate}::date, ${windowStart}::date, ${windowEnd}::date, ${followerCount}, ${totalFollowerGain}, ${organicFollowerGain}, ${paidFollowerGain}, ${lifetimeFollowers}::jsonb, ${syncRunId})
    `;

    const shareStatRows = elements(lifetimeShareStats)
      .filter((row: any) => row?.share || row?.ugcPost)
      .map((row: any) => {
        const id = String(row.share || row.ugcPost);
        return {
          id,
          commentary: id,
          metrics: extractShareMetrics(row),
          raw: row,
        };
      });
    const postRows = [...elements(posts), ...shareStatRows];
    const insertedPostIds = new Set<string>();
    for (const post of postRows) {
      const postId = String((post as any).id || (post as any).urn || crypto.randomUUID());
      if (insertedPostIds.has(postId)) continue;
      insertedPostIds.add(postId);
      const matchedStats = (post as any).metrics || extractShareMetrics(post);
      const createdAt = (post as any).createdAt || (post as any).created?.time || (post as any).publishedAt || null;
      await sql`
        INSERT INTO linkedin_post_metrics
          (snapshot_date, window_start, window_end, post_id, post_title, post_url, published_at, impressions, unique_impressions, clicks, likes, comments, shares, reactions, engagements, engagement_rate, raw, sync_run_id)
        VALUES
          (${snapshotDate}::date, ${windowStart}::date, ${windowEnd}::date, ${postId}, ${textFromPost(post).slice(0, 280)}, ${postUrl(postId)}, ${createdAt ? new Date(Number(createdAt)).toISOString() : null}::timestamptz, ${matchedStats.impressions}, ${matchedStats.uniqueImpressions}, ${matchedStats.clicks}, ${matchedStats.likes}, ${matchedStats.comments}, ${matchedStats.shares}, ${matchedStats.reactions}, ${matchedStats.engagements}, ${matchedStats.engagementRate}, ${(post as any).raw || post}::jsonb, ${syncRunId})
      `;
    }
    counts.posts = insertedPostIds.size;
    counts.followers = 1;

    await sql`
      UPDATE linkedin_sync_runs
      SET status = 'success', organization_urn = ${organizationUrn}, completed_at = ${new Date().toISOString()}::timestamptz, counts = ${counts}::jsonb
      WHERE sync_run_id = ${syncRunId}
    `;

    return {
      ok: true,
      sync_run_id: syncRunId,
      snapshot_date: snapshotDate,
      window_start: windowStart,
      window_end: windowEnd,
      organization_urn: organizationUrn,
      counts,
    };
  } catch (error) {
    await sql`
      UPDATE linkedin_sync_runs
      SET status = 'failed', completed_at = ${new Date().toISOString()}::timestamptz, error = ${error instanceof Error ? error.message : String(error)}
      WHERE sync_run_id = ${syncRunId}
    `;
    throw error;
  }
}
