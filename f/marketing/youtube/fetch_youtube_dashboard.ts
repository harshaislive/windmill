import * as wmill from "windmill-client";

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

function formatDuration(seconds: number) {
  const total = Math.max(0, Math.round(seconds || 0));
  const minutes = Math.floor(total / 60);
  const remaining = total % 60;
  if (minutes <= 0) return `${remaining}s`;
  return `${minutes}m ${String(remaining).padStart(2, "0")}s`;
}

function summarizeDaily(rows: Row[]) {
  const totals = rows.reduce(
    (sum, row) => ({
      views: sum.views + toNumber(row.views),
      watchTimeMinutes: sum.watchTimeMinutes + toNumber(row.watch_time_minutes),
      subscribersGained: sum.subscribersGained + toNumber(row.subscribers_gained),
      likes: sum.likes + toNumber(row.likes),
      comments: sum.comments + toNumber(row.comments),
      shares: sum.shares + toNumber(row.shares),
      weightedDuration: sum.weightedDuration + toNumber(row.average_view_duration) * toNumber(row.views),
    }),
    { views: 0, watchTimeMinutes: 0, subscribersGained: 0, likes: 0, comments: 0, shares: 0, weightedDuration: 0 },
  );
  const averageViewDuration = totals.views ? Math.round(totals.weightedDuration / totals.views) : 0;
  const engagements = totals.likes + totals.comments + totals.shares;
  return { ...totals, averageViewDuration, engagements, engagementRate: pct(engagements, totals.views) };
}

export async function main(snapshot_date = "", start_date = "", end_date = "", selected_video_id = "") {
  const workspace = process.env.WM_WORKSPACE_ID || process.env.WM_WORKSPACE || "beforest-automations";
  const sql = datatable(workspace);
  const latest = snapshot_date
    ? await sql`SELECT * FROM youtube_sync_runs WHERE snapshot_date = ${snapshot_date}::date ORDER BY completed_at DESC LIMIT 1`.fetchOne()
    : await sql`SELECT * FROM youtube_sync_runs WHERE status = 'success' ORDER BY snapshot_date DESC, completed_at DESC LIMIT 1`.fetchOne();

  if (!latest) {
    return {
      ready: false,
      message: "No successful YouTube metric sync has run yet.",
      tabs: [],
      totals: {},
      daily: [],
      topVideos: [],
      reporting: {},
      warnings: [],
    };
  }

  const snapshotDate = latest.snapshot_date;
  const requestedStartDate = /^\d{4}-\d{2}-\d{2}$/.test(start_date) ? start_date : "";
  const requestedEndDate = /^\d{4}-\d{2}-\d{2}$/.test(end_date) ? end_date : "";
  const [daily, videos, traffic, audience, devices, playback, subscribed, countries, snapshots, snapshotDailyRows] = await Promise.all([
    sql`SELECT * FROM youtube_daily_metrics WHERE snapshot_date = ${snapshotDate}::date ORDER BY metric_date ASC`.fetch(),
    sql`SELECT * FROM youtube_top_videos WHERE snapshot_date = ${snapshotDate}::date ORDER BY views DESC`.fetch(),
    sql`SELECT * FROM youtube_traffic_sources WHERE snapshot_date = ${snapshotDate}::date ORDER BY views DESC`.fetch(),
    sql`SELECT * FROM youtube_audience_demographics WHERE snapshot_date = ${snapshotDate}::date ORDER BY demographic_type, viewer_percentage DESC`.fetch(),
    sql`SELECT * FROM youtube_device_metrics WHERE snapshot_date = ${snapshotDate}::date ORDER BY views DESC`.fetch(),
    sql`SELECT * FROM youtube_playback_locations WHERE snapshot_date = ${snapshotDate}::date ORDER BY views DESC`.fetch(),
    sql`SELECT * FROM youtube_subscriber_split WHERE snapshot_date = ${snapshotDate}::date ORDER BY views DESC`.fetch(),
    sql`SELECT * FROM youtube_country_metrics WHERE snapshot_date = ${snapshotDate}::date ORDER BY views DESC`.fetch(),
    sql`SELECT snapshot_date, window_start, window_end, completed_at, counts FROM youtube_sync_runs WHERE status = 'success' ORDER BY snapshot_date DESC, completed_at DESC`.fetch(),
    sql`
      SELECT daily.snapshot_date, daily.views, daily.watch_time_minutes, daily.average_view_duration, daily.subscribers_gained, daily.likes, daily.comments, daily.shares
      FROM youtube_daily_metrics daily
      WHERE EXISTS (
        SELECT 1 FROM youtube_sync_runs runs
        WHERE runs.status = 'success' AND runs.snapshot_date = daily.snapshot_date
      )
      ORDER BY daily.snapshot_date ASC, daily.metric_date ASC
    `.fetch(),
  ]);

  const dailyRows = daily as Row[];
  const dataStartDate = dailyRows[0]?.metric_date || latest.window_start;
  const dataEndDate = dailyRows[dailyRows.length - 1]?.metric_date || latest.window_end;
  const filteredDaily = dailyRows.filter((row) => {
    const metricDate = String(row.metric_date || "");
    return (!requestedStartDate || metricDate >= requestedStartDate) && (!requestedEndDate || metricDate <= requestedEndDate);
  });

  const totals = summarizeDaily(filteredDaily);
  const videosMapped = (videos as Row[]).map((row) => ({
    videoId: row.video_id,
    title: row.video_title,
    url: row.video_url,
    views: toNumber(row.views),
    watchTimeMinutes: toNumber(row.watch_time_minutes),
    averageViewDuration: toNumber(row.average_view_duration),
    subscribersGained: toNumber(row.subscribers_gained),
    likes: toNumber(row.likes),
    comments: toNumber(row.comments),
    shares: toNumber(row.shares),
    engagements: toNumber(row.engagements),
    qualityScore: toNumber(row.quality_score),
  }));
  const selectedVideoId = selected_video_id || videosMapped[0]?.videoId || "";
  const selectedVideo = videosMapped.find((video) => video.videoId === selectedVideoId) || videosMapped[0] || null;
  const selectedVideoSnapshots = selectedVideoId
    ? await sql`SELECT snapshot_date, window_start, window_end, video_id, video_title, video_url, views, watch_time_minutes, average_view_duration, subscribers_gained, likes, comments, shares, engagements, quality_score FROM youtube_top_videos WHERE video_id = ${selectedVideoId} ORDER BY snapshot_date ASC`.fetch()
    : [];

  const summariesBySnapshot = new Map<string, Row[]>();
  for (const row of snapshotDailyRows as Row[]) {
    const key = String(row.snapshot_date);
    summariesBySnapshot.set(key, [...(summariesBySnapshot.get(key) || []), row]);
  }
  const snapshotSummaries = [...summariesBySnapshot.entries()].map(([date, rows]) => {
    const summary = summarizeDaily(rows);
    return {
      snapshotDate: date,
      views: summary.views,
      watchHours: Math.round((summary.watchTimeMinutes / 60) * 10) / 10,
      subscribersGained: summary.subscribersGained,
      engagements: summary.engagements,
      engagementRate: summary.engagementRate,
      averageViewDuration: summary.averageViewDuration,
    };
  });
  const previousSnapshot = snapshotSummaries[snapshotSummaries.length - 2] || null;
  const latestSnapshot = snapshotSummaries[snapshotSummaries.length - 1] || null;
  const pairs = snapshotSummaries.slice(1).map((current, index) => ({ current, previous: snapshotSummaries[index] }));
  const averageDelta = (key: "views" | "watchHours" | "subscribersGained" | "engagements") => {
    if (!pairs.length) return 0;
    return Math.round((pairs.reduce((sum, pair) => sum + (Number(pair.current[key]) - Number(pair.previous[key])), 0) / pairs.length) * 10) / 10;
  };

  return {
    ready: true,
    source: "Windmill datatables",
    snapshotDate,
    syncRunId: latest.sync_run_id,
    startDate: filteredDaily[0]?.metric_date || requestedStartDate || dataStartDate,
    endDate: filteredDaily[filteredDaily.length - 1]?.metric_date || requestedEndDate || dataEndDate,
    storedStartDate: latest.window_start,
    storedEndDate: latest.window_end,
    dataStartDate,
    dataEndDate,
    dailyRowCount: dailyRows.length,
    noDataForFilter: Boolean((requestedStartDate || requestedEndDate) && !filteredDaily.length),
    filterApplied: Boolean(requestedStartDate || requestedEndDate),
    generatedAt: latest.completed_at || latest.created_at,
    availableSnapshots: (snapshots as Row[]).map((row) => ({
      snapshotDate: row.snapshot_date,
      windowStart: row.window_start,
      windowEnd: row.window_end,
      completedAt: row.completed_at,
    })),
    growth: {
      snapshotsCount: snapshotSummaries.length,
      latest: latestSnapshot,
      previous: previousSnapshot,
      latestDelta: latestSnapshot && previousSnapshot ? {
        views: latestSnapshot.views - previousSnapshot.views,
        viewsPercent: deltaPercent(latestSnapshot.views, previousSnapshot.views),
        watchHours: Math.round((latestSnapshot.watchHours - previousSnapshot.watchHours) * 10) / 10,
        watchHoursPercent: deltaPercent(latestSnapshot.watchHours, previousSnapshot.watchHours),
        subscribersGained: latestSnapshot.subscribersGained - previousSnapshot.subscribersGained,
        engagements: latestSnapshot.engagements - previousSnapshot.engagements,
      } : null,
      averageDelta: {
        views: averageDelta("views"),
        watchHours: averageDelta("watchHours"),
        subscribersGained: averageDelta("subscribersGained"),
        engagements: averageDelta("engagements"),
      },
      trend: snapshotSummaries,
    },
    totals: {
      views: totals.views,
      watchTimeMinutes: totals.watchTimeMinutes,
      averageViewDuration: totals.averageViewDuration,
      subscribersGained: totals.subscribersGained,
      likes: totals.likes,
      comments: totals.comments,
      shares: totals.shares,
      engagements: totals.engagements,
      engagementRate: totals.engagementRate,
    },
    display: {
      watchHours: Math.round((totals.watchTimeMinutes / 60) * 10) / 10,
      averageViewDuration: formatDuration(totals.averageViewDuration),
    },
    funnel: [
      { label: "Views", value: totals.views, note: "Channel views" },
      { label: "Engaged Views", value: totals.engagements, rate: pct(totals.engagements, totals.views), note: "Likes + comments + shares" },
      { label: "Subscribers", value: totals.subscribersGained, rate: pct(totals.subscribersGained, totals.views), note: "Subscribers gained" },
    ],
    daily: filteredDaily.map((row) => ({
      date: row.metric_date,
      views: toNumber(row.views),
      watchTimeMinutes: toNumber(row.watch_time_minutes),
      averageViewDuration: toNumber(row.average_view_duration),
      subscribersGained: toNumber(row.subscribers_gained),
      likes: toNumber(row.likes),
      comments: toNumber(row.comments),
      shares: toNumber(row.shares),
    })),
    topVideos: videosMapped,
    selectedVideo,
    selectedVideoSnapshots: (selectedVideoSnapshots as Row[]).map((row) => ({
      snapshotDate: row.snapshot_date,
      windowStart: row.window_start,
      windowEnd: row.window_end,
      videoId: row.video_id,
      title: row.video_title,
      url: row.video_url,
      views: toNumber(row.views),
      watchTimeMinutes: toNumber(row.watch_time_minutes),
      averageViewDuration: toNumber(row.average_view_duration),
      subscribersGained: toNumber(row.subscribers_gained),
      likes: toNumber(row.likes),
      comments: toNumber(row.comments),
      shares: toNumber(row.shares),
      engagements: toNumber(row.engagements),
      qualityScore: toNumber(row.quality_score),
    })),
    reporting: {
      trafficSources: (traffic as Row[]).map((row) => ({
        key: row.source_key,
        label: row.source_label,
        views: toNumber(row.views),
        estimatedMinutesWatched: toNumber(row.watch_time_minutes),
        averageViewDuration: toNumber(row.average_view_duration),
      })),
      audience: (audience as Row[]).map((row) => ({
        type: row.demographic_type,
        key: row.demographic_key,
        label: row.demographic_label,
        viewerPercentage: toNumber(row.viewer_percentage),
      })),
      devices: (devices as Row[])
        .filter((row) => row.device_type)
        .map((row) => ({
          key: row.device_type,
          label: row.label,
          views: toNumber(row.views),
          estimatedMinutesWatched: toNumber(row.watch_time_minutes),
          averageViewDuration: toNumber(row.average_view_duration),
        })),
      operatingSystems: (devices as Row[])
        .filter((row) => row.operating_system)
        .map((row) => ({
          key: row.operating_system,
          label: row.label,
          views: toNumber(row.views),
          estimatedMinutesWatched: toNumber(row.watch_time_minutes),
        })),
      playbackLocations: (playback as Row[]).map((row) => ({
        key: row.playback_location_key,
        label: row.playback_location_label,
        views: toNumber(row.views),
        estimatedMinutesWatched: toNumber(row.watch_time_minutes),
      })),
      subscribedStatus: (subscribed as Row[]).map((row) => ({
        key: row.subscribed_status,
        label: row.subscribed_status_label,
        views: toNumber(row.views),
        estimatedMinutesWatched: toNumber(row.watch_time_minutes),
      })),
      countries: (countries as Row[]).map((row) => ({
        key: row.country_code,
        label: row.country_label,
        views: toNumber(row.views),
        estimatedMinutesWatched: toNumber(row.watch_time_minutes),
        averageViewDuration: toNumber(row.average_view_duration),
      })),
    },
    warnings: [],
  };
}
