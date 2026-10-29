import * as wmill from "windmill-client";

const BASE = "f/marketing";
const API_VARIABLE_CANDIDATES = [
  `${BASE}/youtube/maton_api_key`,
  `${BASE}/youtube_maton_api_key`,
  `${BASE}/maton_api_key`,
];
const ANALYTICS_BASE = "https://api.maton.ai/youtube-analytics/v2/reports";
const REPORTING_BASE = "https://api.maton.ai/youtube-reporting/v2/reports";

type ReportRow = Record<string, unknown>;

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

function titleCaseCode(value: unknown) {
  return String(value || "Unknown")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function countryName(code: unknown) {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(String(code)) || String(code);
  } catch {
    return String(code);
  }
}

function labelFor(kind: string, value: unknown) {
  if (kind === "country") return countryName(value);
  if (kind === "ageGroup") return String(value).replace("age", "");
  return titleCaseCode(value);
}

async function getMatonApiKey() {
  for (const path of API_VARIABLE_CANDIDATES) {
    const value = await wmill.getVariable(path).catch(() => "");
    if (value?.trim()) return value.trim();
  }
  throw new Error(`Missing Maton API key variable. Add one of: ${API_VARIABLE_CANDIDATES.join(", ")}`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function matonReport(apiKey: string, base: string, params: Record<string, string | number>) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  const label = `${base.includes("youtube-reporting") ? "reporting" : "analytics"}:${params.dimensions || "summary"}:${params.metrics}`;
  let lastError = "";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const text = await response.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
    if (response.ok) {
      const columns = (data.columnHeaders || []).map((column: { name: string }) => column.name);
      return (data.rows || []).map((row: unknown[]) =>
        Object.fromEntries(columns.map((column: string, index: number) => [column, row[index]])),
      ) as ReportRow[];
    }
    lastError = data?.error?.message || data?.message || text || response.statusText;
    if (response.status < 500 && !/internal error/i.test(lastError)) break;
    await sleep(1000 * attempt);
  }
  throw new Error(`${label} failed: ${lastError}`);
}

async function youtubeTitle(videoId: string) {
  try {
    const url = new URL("https://www.youtube.com/oembed");
    url.searchParams.set("format", "json");
    url.searchParams.set("url", `https://www.youtube.com/watch?v=${videoId}`);
    const response = await fetch(url.toString());
    if (!response.ok) return videoId;
    const payload = await response.json();
    return payload.title || videoId;
  } catch {
    return videoId;
  }
}

async function createTables(sql: any) {
  await sql`
    CREATE TABLE IF NOT EXISTS youtube_sync_runs (
      sync_run_id TEXT PRIMARY KEY,
      snapshot_date DATE NOT NULL,
      window_start DATE NOT NULL,
      window_end DATE NOT NULL,
      status TEXT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL,
      completed_at TIMESTAMPTZ,
      error TEXT,
      counts JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS youtube_daily_metrics (
      snapshot_date DATE NOT NULL,
      metric_date DATE NOT NULL,
      window_start DATE NOT NULL,
      window_end DATE NOT NULL,
      views INTEGER DEFAULT 0,
      watch_time_minutes NUMERIC DEFAULT 0,
      average_view_duration NUMERIC DEFAULT 0,
      subscribers_gained INTEGER DEFAULT 0,
      likes INTEGER DEFAULT 0,
      comments INTEGER DEFAULT 0,
      shares INTEGER DEFAULT 0,
      sync_run_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (snapshot_date, metric_date)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS youtube_top_videos (
      snapshot_date DATE NOT NULL,
      window_start DATE NOT NULL,
      window_end DATE NOT NULL,
      video_id TEXT NOT NULL,
      video_title TEXT,
      video_url TEXT,
      views INTEGER DEFAULT 0,
      watch_time_minutes NUMERIC DEFAULT 0,
      average_view_duration NUMERIC DEFAULT 0,
      subscribers_gained INTEGER DEFAULT 0,
      likes INTEGER DEFAULT 0,
      comments INTEGER DEFAULT 0,
      shares INTEGER DEFAULT 0,
      engagements INTEGER DEFAULT 0,
      quality_score NUMERIC DEFAULT 0,
      sync_run_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (snapshot_date, video_id)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS youtube_traffic_sources (
      snapshot_date DATE NOT NULL,
      window_start DATE NOT NULL,
      window_end DATE NOT NULL,
      source_key TEXT NOT NULL,
      source_label TEXT,
      views INTEGER DEFAULT 0,
      watch_time_minutes NUMERIC DEFAULT 0,
      average_view_duration NUMERIC DEFAULT 0,
      sync_run_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (snapshot_date, source_key)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS youtube_audience_demographics (
      snapshot_date DATE NOT NULL,
      window_start DATE NOT NULL,
      window_end DATE NOT NULL,
      demographic_type TEXT NOT NULL,
      demographic_key TEXT NOT NULL,
      demographic_label TEXT,
      viewer_percentage NUMERIC DEFAULT 0,
      sync_run_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (snapshot_date, demographic_type, demographic_key)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS youtube_device_metrics (
      snapshot_date DATE NOT NULL,
      window_start DATE NOT NULL,
      window_end DATE NOT NULL,
      device_type TEXT NOT NULL,
      operating_system TEXT NOT NULL DEFAULT '',
      label TEXT,
      views INTEGER DEFAULT 0,
      watch_time_minutes NUMERIC DEFAULT 0,
      average_view_duration NUMERIC DEFAULT 0,
      sync_run_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (snapshot_date, device_type, operating_system)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS youtube_playback_locations (
      snapshot_date DATE NOT NULL,
      window_start DATE NOT NULL,
      window_end DATE NOT NULL,
      playback_location_key TEXT NOT NULL,
      playback_location_label TEXT,
      views INTEGER DEFAULT 0,
      watch_time_minutes NUMERIC DEFAULT 0,
      sync_run_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (snapshot_date, playback_location_key)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS youtube_subscriber_split (
      snapshot_date DATE NOT NULL,
      window_start DATE NOT NULL,
      window_end DATE NOT NULL,
      subscribed_status TEXT NOT NULL,
      subscribed_status_label TEXT,
      views INTEGER DEFAULT 0,
      watch_time_minutes NUMERIC DEFAULT 0,
      sync_run_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (snapshot_date, subscribed_status)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS youtube_country_metrics (
      snapshot_date DATE NOT NULL,
      window_start DATE NOT NULL,
      window_end DATE NOT NULL,
      country_code TEXT NOT NULL,
      country_label TEXT,
      views INTEGER DEFAULT 0,
      watch_time_minutes NUMERIC DEFAULT 0,
      average_view_duration NUMERIC DEFAULT 0,
      sync_run_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (snapshot_date, country_code)
    )
  `;
}

async function clearSnapshot(sql: any, snapshotDate: string) {
  await sql`DELETE FROM youtube_daily_metrics WHERE snapshot_date = ${snapshotDate}::date`;
  await sql`DELETE FROM youtube_top_videos WHERE snapshot_date = ${snapshotDate}::date`;
  await sql`DELETE FROM youtube_traffic_sources WHERE snapshot_date = ${snapshotDate}::date`;
  await sql`DELETE FROM youtube_audience_demographics WHERE snapshot_date = ${snapshotDate}::date`;
  await sql`DELETE FROM youtube_device_metrics WHERE snapshot_date = ${snapshotDate}::date`;
  await sql`DELETE FROM youtube_playback_locations WHERE snapshot_date = ${snapshotDate}::date`;
  await sql`DELETE FROM youtube_subscriber_split WHERE snapshot_date = ${snapshotDate}::date`;
  await sql`DELETE FROM youtube_country_metrics WHERE snapshot_date = ${snapshotDate}::date`;
}

function withQualityScores(videos: ReportRow[]) {
  const mapped = videos.map((row) => ({
    video_id: String(row.video),
    views: toNumber(row.views),
    watch_time_minutes: toNumber(row.estimatedMinutesWatched),
    average_view_duration: toNumber(row.averageViewDuration),
    subscribers_gained: toNumber(row.subscribersGained),
    likes: toNumber(row.likes),
    comments: toNumber(row.comments),
    shares: toNumber(row.shares),
  }));
  const max = mapped.reduce(
    (acc, row) => ({
      views: Math.max(acc.views, row.views),
      watch_time_minutes: Math.max(acc.watch_time_minutes, row.watch_time_minutes),
      average_view_duration: Math.max(acc.average_view_duration, row.average_view_duration),
      subscribers_gained: Math.max(acc.subscribers_gained, row.subscribers_gained),
      engagements: Math.max(acc.engagements, row.likes + row.comments + row.shares),
    }),
    { views: 1, watch_time_minutes: 1, average_view_duration: 1, subscribers_gained: 1, engagements: 1 },
  );
  return mapped.map((row) => {
    const engagements = row.likes + row.comments + row.shares;
    const quality_score = Math.round(
      (row.views / max.views) * 25 +
        (row.watch_time_minutes / max.watch_time_minutes) * 30 +
        (row.average_view_duration / max.average_view_duration) * 20 +
        (row.subscribers_gained / max.subscribers_gained) * 15 +
        (engagements / max.engagements) * 10,
    );
    return { ...row, engagements, quality_score };
  });
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
  const syncRunId = crypto.randomUUID();
  const counts: Record<string, number> = {};

  await createTables(sql);
  await sql`
    INSERT INTO youtube_sync_runs (sync_run_id, snapshot_date, window_start, window_end, status, started_at)
    VALUES (${syncRunId}, ${snapshotDate}::date, ${windowStart}::date, ${windowEnd}::date, 'running', ${startedAt}::timestamptz)
  `;

  try {
    const apiKey = await getMatonApiKey();
    const daily = await matonReport(apiKey, ANALYTICS_BASE, {
      ids: "channel==MINE",
      startDate: windowStart,
      endDate: windowEnd,
      dimensions: "day",
      metrics: "views,estimatedMinutesWatched,averageViewDuration,subscribersGained,likes,comments,shares",
    });
    const videosRaw = await matonReport(apiKey, ANALYTICS_BASE, {
      ids: "channel==MINE",
      startDate: windowStart,
      endDate: windowEnd,
      dimensions: "video",
      sort: "-views",
      maxResults: 25,
      metrics: "views,estimatedMinutesWatched,averageViewDuration,likes,comments,shares,subscribersGained",
    });
    const [traffic, countries, devices, operatingSystems, subscribed, playback, gender, age] = await Promise.all([
      matonReport(apiKey, REPORTING_BASE, {
        ids: "channel==MINE",
        startDate: windowStart,
        endDate: windowEnd,
        dimensions: "insightTrafficSourceType",
        metrics: "views,estimatedMinutesWatched,averageViewDuration",
        sort: "-views",
        maxResults: 20,
      }),
      matonReport(apiKey, REPORTING_BASE, {
        ids: "channel==MINE",
        startDate: windowStart,
        endDate: windowEnd,
        dimensions: "country",
        metrics: "views,estimatedMinutesWatched,averageViewDuration",
        sort: "-views",
        maxResults: 20,
      }),
      matonReport(apiKey, REPORTING_BASE, {
        ids: "channel==MINE",
        startDate: windowStart,
        endDate: windowEnd,
        dimensions: "deviceType",
        metrics: "views,estimatedMinutesWatched,averageViewDuration",
        sort: "-views",
        maxResults: 20,
      }),
      matonReport(apiKey, REPORTING_BASE, {
        ids: "channel==MINE",
        startDate: windowStart,
        endDate: windowEnd,
        dimensions: "operatingSystem",
        metrics: "views,estimatedMinutesWatched",
        sort: "-views",
        maxResults: 20,
      }),
      matonReport(apiKey, REPORTING_BASE, {
        ids: "channel==MINE",
        startDate: windowStart,
        endDate: windowEnd,
        dimensions: "subscribedStatus",
        metrics: "views,estimatedMinutesWatched",
        sort: "-views",
        maxResults: 10,
      }),
      matonReport(apiKey, REPORTING_BASE, {
        ids: "channel==MINE",
        startDate: windowStart,
        endDate: windowEnd,
        dimensions: "insightPlaybackLocationType",
        metrics: "views,estimatedMinutesWatched",
        sort: "-views",
        maxResults: 20,
      }),
      matonReport(apiKey, REPORTING_BASE, {
        ids: "channel==MINE",
        startDate: windowStart,
        endDate: windowEnd,
        dimensions: "gender",
        metrics: "viewerPercentage",
        sort: "gender",
      }),
      matonReport(apiKey, REPORTING_BASE, {
        ids: "channel==MINE",
        startDate: windowStart,
        endDate: windowEnd,
        dimensions: "ageGroup",
        metrics: "viewerPercentage",
        sort: "ageGroup",
      }),
    ]);

    if (dry_run) {
      return {
        dry_run: true,
        snapshot_date: snapshotDate,
        window_start: windowStart,
        window_end: windowEnd,
        counts: {
          daily: daily.length,
          videos: videosRaw.length,
          traffic: traffic.length,
          countries: countries.length,
          devices: devices.length,
          operating_systems: operatingSystems.length,
          subscribed: subscribed.length,
          playback: playback.length,
          gender: gender.length,
          age: age.length,
        },
      };
    }

    await clearSnapshot(sql, snapshotDate);

    for (const row of daily) {
      await sql`
        INSERT INTO youtube_daily_metrics
          (snapshot_date, metric_date, window_start, window_end, views, watch_time_minutes, average_view_duration, subscribers_gained, likes, comments, shares, sync_run_id)
        VALUES
          (${snapshotDate}::date, ${String(row.day)}::date, ${windowStart}::date, ${windowEnd}::date, ${toNumber(row.views)}, ${toNumber(row.estimatedMinutesWatched)}, ${toNumber(row.averageViewDuration)}, ${toNumber(row.subscribersGained)}, ${toNumber(row.likes)}, ${toNumber(row.comments)}, ${toNumber(row.shares)}, ${syncRunId})
      `;
    }
    counts.daily = daily.length;

    const videos = withQualityScores(videosRaw);
    for (const row of videos) {
      const title = await youtubeTitle(row.video_id);
      await sql`
        INSERT INTO youtube_top_videos
          (snapshot_date, window_start, window_end, video_id, video_title, video_url, views, watch_time_minutes, average_view_duration, subscribers_gained, likes, comments, shares, engagements, quality_score, sync_run_id)
        VALUES
          (${snapshotDate}::date, ${windowStart}::date, ${windowEnd}::date, ${row.video_id}, ${title}, ${`https://www.youtube.com/watch?v=${row.video_id}`}, ${row.views}, ${row.watch_time_minutes}, ${row.average_view_duration}, ${row.subscribers_gained}, ${row.likes}, ${row.comments}, ${row.shares}, ${row.engagements}, ${row.quality_score}, ${syncRunId})
      `;
    }
    counts.videos = videos.length;

    for (const row of traffic) {
      await sql`
        INSERT INTO youtube_traffic_sources
          (snapshot_date, window_start, window_end, source_key, source_label, views, watch_time_minutes, average_view_duration, sync_run_id)
        VALUES
          (${snapshotDate}::date, ${windowStart}::date, ${windowEnd}::date, ${String(row.insightTrafficSourceType)}, ${labelFor("source", row.insightTrafficSourceType)}, ${toNumber(row.views)}, ${toNumber(row.estimatedMinutesWatched)}, ${toNumber(row.averageViewDuration)}, ${syncRunId})
      `;
    }
    counts.traffic = traffic.length;

    for (const row of [...age.map((r) => ({ ...r, type: "age_group", key: r.ageGroup })), ...gender.map((r) => ({ ...r, type: "gender", key: r.gender }))]) {
      await sql`
        INSERT INTO youtube_audience_demographics
          (snapshot_date, window_start, window_end, demographic_type, demographic_key, demographic_label, viewer_percentage, sync_run_id)
        VALUES
          (${snapshotDate}::date, ${windowStart}::date, ${windowEnd}::date, ${String(row.type)}, ${String(row.key)}, ${labelFor(String(row.type === "age_group" ? "ageGroup" : "gender"), row.key)}, ${toNumber(row.viewerPercentage)}, ${syncRunId})
      `;
    }
    counts.audience = age.length + gender.length;

    for (const row of devices) {
      await sql`
        INSERT INTO youtube_device_metrics
          (snapshot_date, window_start, window_end, device_type, operating_system, label, views, watch_time_minutes, average_view_duration, sync_run_id)
        VALUES
          (${snapshotDate}::date, ${windowStart}::date, ${windowEnd}::date, ${String(row.deviceType)}, '', ${labelFor("device", row.deviceType)}, ${toNumber(row.views)}, ${toNumber(row.estimatedMinutesWatched)}, ${toNumber(row.averageViewDuration)}, ${syncRunId})
      `;
    }
    for (const row of operatingSystems) {
      await sql`
        INSERT INTO youtube_device_metrics
          (snapshot_date, window_start, window_end, device_type, operating_system, label, views, watch_time_minutes, average_view_duration, sync_run_id)
        VALUES
          (${snapshotDate}::date, ${windowStart}::date, ${windowEnd}::date, '', ${String(row.operatingSystem)}, ${labelFor("os", row.operatingSystem)}, ${toNumber(row.views)}, ${toNumber(row.estimatedMinutesWatched)}, 0, ${syncRunId})
      `;
    }
    counts.device_metrics = devices.length + operatingSystems.length;

    for (const row of playback) {
      await sql`
        INSERT INTO youtube_playback_locations
          (snapshot_date, window_start, window_end, playback_location_key, playback_location_label, views, watch_time_minutes, sync_run_id)
        VALUES
          (${snapshotDate}::date, ${windowStart}::date, ${windowEnd}::date, ${String(row.insightPlaybackLocationType)}, ${labelFor("playback", row.insightPlaybackLocationType)}, ${toNumber(row.views)}, ${toNumber(row.estimatedMinutesWatched)}, ${syncRunId})
      `;
    }
    counts.playback = playback.length;

    for (const row of subscribed) {
      await sql`
        INSERT INTO youtube_subscriber_split
          (snapshot_date, window_start, window_end, subscribed_status, subscribed_status_label, views, watch_time_minutes, sync_run_id)
        VALUES
          (${snapshotDate}::date, ${windowStart}::date, ${windowEnd}::date, ${String(row.subscribedStatus)}, ${labelFor("subscribed", row.subscribedStatus)}, ${toNumber(row.views)}, ${toNumber(row.estimatedMinutesWatched)}, ${syncRunId})
      `;
    }
    counts.subscriber_split = subscribed.length;

    for (const row of countries) {
      await sql`
        INSERT INTO youtube_country_metrics
          (snapshot_date, window_start, window_end, country_code, country_label, views, watch_time_minutes, average_view_duration, sync_run_id)
        VALUES
          (${snapshotDate}::date, ${windowStart}::date, ${windowEnd}::date, ${String(row.country)}, ${countryName(row.country)}, ${toNumber(row.views)}, ${toNumber(row.estimatedMinutesWatched)}, ${toNumber(row.averageViewDuration)}, ${syncRunId})
      `;
    }
    counts.countries = countries.length;

    await sql`
      UPDATE youtube_sync_runs
      SET status = 'success', completed_at = ${new Date().toISOString()}::timestamptz, counts = ${counts}::jsonb
      WHERE sync_run_id = ${syncRunId}
    `;

    return {
      ok: true,
      sync_run_id: syncRunId,
      snapshot_date: snapshotDate,
      window_start: windowStart,
      window_end: windowEnd,
      counts,
    };
  } catch (error) {
    await sql`
      UPDATE youtube_sync_runs
      SET status = 'failed', completed_at = ${new Date().toISOString()}::timestamptz, error = ${error instanceof Error ? error.message : String(error)}
      WHERE sync_run_id = ${syncRunId}
    `;
    throw error;
  }
}
