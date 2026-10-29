type Row = Record<string, any>;

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

function toNumber(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
}

function pct(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 10000) / 100;
}

function deltaPercent(current: number, previous: number) {
  if (!previous) return 0;
  return Math.round(((current - previous) / previous) * 10000) / 100;
}

function summarizeDaily(rows: Row[]) {
  const totals = rows.reduce(
    (sum, row) => ({
      impressions: sum.impressions + toNumber(row.impressions),
      uniqueImpressions: sum.uniqueImpressions + toNumber(row.unique_impressions),
      pageViews: sum.pageViews + toNumber(row.page_views),
      uniqueVisitors: sum.uniqueVisitors + toNumber(row.unique_visitors),
      clicks: sum.clicks + toNumber(row.clicks),
      likes: sum.likes + toNumber(row.likes),
      comments: sum.comments + toNumber(row.comments),
      shares: sum.shares + toNumber(row.shares),
      reactions: sum.reactions + toNumber(row.reactions),
      engagements: sum.engagements + toNumber(row.engagements),
      followersGained: sum.followersGained + toNumber(row.followers_gained),
    }),
    {
      impressions: 0,
      uniqueImpressions: 0,
      pageViews: 0,
      uniqueVisitors: 0,
      clicks: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      reactions: 0,
      engagements: 0,
      followersGained: 0,
    },
  );
  return {
    ...totals,
    engagementRate: pct(totals.engagements, totals.impressions),
    clickRate: pct(totals.clicks, totals.impressions),
    followerConversionRate: pct(totals.followersGained, totals.impressions),
  };
}

async function ensureTables(sql: any) {
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

export async function main(snapshot_date = "", selected_post_id = "") {
  const workspace = process.env.WM_WORKSPACE_ID || process.env.WM_WORKSPACE || "beforest-automations";
  const sql = datatable(workspace);
  await ensureTables(sql);
  const latest = snapshot_date
    ? await sql`SELECT * FROM linkedin_sync_runs WHERE snapshot_date = ${snapshot_date}::date ORDER BY completed_at DESC LIMIT 1`.fetchOne()
    : await sql`SELECT * FROM linkedin_sync_runs WHERE status = 'success' ORDER BY snapshot_date DESC, completed_at DESC LIMIT 1`.fetchOne();

  if (!latest) {
    return {
      ready: false,
      message: "No successful LinkedIn metric sync has run yet.",
      totals: {},
      daily: [],
      posts: [],
      warnings: [],
    };
  }

  const snapshotDate = latest.snapshot_date;
  const [daily, posts, followers, snapshots, snapshotDailyRows] = await Promise.all([
    sql`SELECT * FROM linkedin_daily_metrics WHERE snapshot_date = ${snapshotDate}::date ORDER BY metric_date ASC`.fetch(),
    sql`SELECT * FROM linkedin_post_metrics WHERE snapshot_date = ${snapshotDate}::date ORDER BY impressions DESC, published_at DESC NULLS LAST`.fetch(),
    sql`SELECT * FROM linkedin_follower_metrics WHERE snapshot_date = ${snapshotDate}::date LIMIT 1`.fetchOne(),
    sql`SELECT snapshot_date, window_start, window_end, completed_at, counts FROM linkedin_sync_runs WHERE status = 'success' ORDER BY snapshot_date DESC, completed_at DESC`.fetch(),
    sql`
      SELECT daily.snapshot_date, daily.impressions, daily.unique_impressions, daily.page_views, daily.unique_visitors, daily.clicks, daily.likes, daily.comments, daily.shares, daily.reactions, daily.engagements, daily.followers_gained
      FROM linkedin_daily_metrics daily
      WHERE EXISTS (
        SELECT 1 FROM linkedin_sync_runs runs
        WHERE runs.status = 'success' AND runs.snapshot_date = daily.snapshot_date
      )
      ORDER BY daily.snapshot_date ASC, daily.metric_date ASC
    `.fetch(),
  ]);

  const dailyRows = daily as Row[];
  const totals = summarizeDaily(dailyRows);
  const postsMapped = (posts as Row[]).map((row) => ({
    postId: row.post_id,
    title: row.post_title,
    url: row.post_url,
    publishedAt: row.published_at,
    impressions: toNumber(row.impressions),
    uniqueImpressions: toNumber(row.unique_impressions),
    clicks: toNumber(row.clicks),
    likes: toNumber(row.likes),
    comments: toNumber(row.comments),
    shares: toNumber(row.shares),
    reactions: toNumber(row.reactions),
    engagements: toNumber(row.engagements),
    engagementRate: toNumber(row.engagement_rate),
  }));
  const selectedPostId = selected_post_id || postsMapped[0]?.postId || "";
  const selectedPost = postsMapped.find((post) => post.postId === selectedPostId) || postsMapped[0] || null;
  const selectedPostSnapshots = selectedPostId
    ? await sql`SELECT snapshot_date, window_start, window_end, post_id, post_title, post_url, published_at, impressions, unique_impressions, clicks, likes, comments, shares, reactions, engagements, engagement_rate FROM linkedin_post_metrics WHERE post_id = ${selectedPostId} ORDER BY snapshot_date ASC`.fetch()
    : [];

  const bySnapshot = new Map<string, Row[]>();
  for (const row of snapshotDailyRows as Row[]) {
    const key = String(row.snapshot_date);
    bySnapshot.set(key, [...(bySnapshot.get(key) || []), row]);
  }
  const snapshotSummaries = [...bySnapshot.entries()].map(([date, rows]) => {
    const summary = summarizeDaily(rows);
    return {
      snapshotDate: date,
      impressions: summary.impressions,
      pageViews: summary.pageViews,
      engagements: summary.engagements,
      engagementRate: summary.engagementRate,
      followersGained: summary.followersGained,
    };
  });
  const previousSnapshot = snapshotSummaries[snapshotSummaries.length - 2] || null;
  const latestSnapshot = snapshotSummaries[snapshotSummaries.length - 1] || null;
  const latestDelta =
    latestSnapshot && previousSnapshot
      ? {
          impressions: latestSnapshot.impressions - previousSnapshot.impressions,
          impressionsPercent: deltaPercent(latestSnapshot.impressions, previousSnapshot.impressions),
          pageViews: latestSnapshot.pageViews - previousSnapshot.pageViews,
          engagements: latestSnapshot.engagements - previousSnapshot.engagements,
          followersGained: latestSnapshot.followersGained - previousSnapshot.followersGained,
        }
      : null;

  return {
    ready: true,
    source: "Windmill datatables",
    snapshotDate,
    syncRunId: latest.sync_run_id,
    organizationUrn: latest.organization_urn,
    startDate: dailyRows[0]?.metric_date || latest.window_start,
    endDate: dailyRows[dailyRows.length - 1]?.metric_date || latest.window_end,
    storedStartDate: latest.window_start,
    storedEndDate: latest.window_end,
    generatedAt: latest.completed_at || latest.created_at,
    availableSnapshots: (snapshots as Row[]).map((row) => ({
      snapshotDate: row.snapshot_date,
      windowStart: row.window_start,
      windowEnd: row.window_end,
      completedAt: row.completed_at,
    })),
    totals: {
      ...totals,
      followerCount: toNumber((followers as Row)?.follower_count),
      organicFollowersGained: toNumber((followers as Row)?.organic_followers_gained),
      paidFollowersGained: toNumber((followers as Row)?.paid_followers_gained),
    },
    growth: {
      snapshotsCount: snapshotSummaries.length,
      latest: latestSnapshot,
      previous: previousSnapshot,
      latestDelta,
      trend: snapshotSummaries,
    },
    funnel: [
      { label: "Impressions", value: totals.impressions, note: "Post reach surface" },
      { label: "Page Views", value: totals.pageViews, rate: pct(totals.pageViews, totals.impressions), note: "Company page visits" },
      { label: "Engagements", value: totals.engagements, rate: totals.engagementRate, note: "Clicks + reactions + comments + shares" },
      { label: "Followers", value: totals.followersGained, rate: totals.followerConversionRate, note: "Followers gained" },
    ],
    daily: dailyRows.map((row) => ({
      date: row.metric_date,
      impressions: toNumber(row.impressions),
      pageViews: toNumber(row.page_views),
      uniqueVisitors: toNumber(row.unique_visitors),
      clicks: toNumber(row.clicks),
      likes: toNumber(row.likes),
      comments: toNumber(row.comments),
      shares: toNumber(row.shares),
      reactions: toNumber(row.reactions),
      engagements: toNumber(row.engagements),
      engagementRate: toNumber(row.engagement_rate),
      followersGained: toNumber(row.followers_gained),
    })),
    posts: postsMapped,
    selectedPost,
    selectedPostSnapshots: (selectedPostSnapshots as Row[]).map((row) => ({
      snapshotDate: row.snapshot_date,
      windowStart: row.window_start,
      windowEnd: row.window_end,
      postId: row.post_id,
      title: row.post_title,
      url: row.post_url,
      publishedAt: row.published_at,
      impressions: toNumber(row.impressions),
      clicks: toNumber(row.clicks),
      likes: toNumber(row.likes),
      comments: toNumber(row.comments),
      shares: toNumber(row.shares),
      reactions: toNumber(row.reactions),
      engagements: toNumber(row.engagements),
      engagementRate: toNumber(row.engagement_rate),
    })),
    warnings: [],
  };
}
