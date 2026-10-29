import * as wmill from "windmill-client";

const DEFAULT_TOKEN_PATH = "f/marketing/instagram/facebook_api_token";
const DASHBOARD_PASSCODE_PATH = "f/marketing/instagram/dashboard_passcode";
const FUNNEL_SCRIPT_PATH = "f/marketing/instagram/fetch_ig_funnel";
const COMMENTS_SCRIPT_PATH = "f/marketing/instagram/fetch_ig_unanswered_comments";

type Row = Record<string, any>;

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

async function createTables(sql: any) {
  await sql`
    CREATE TABLE IF NOT EXISTS instagram_sync_runs (
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
  `.execute();
  await sql`CREATE INDEX IF NOT EXISTS instagram_sync_runs_status_date_idx ON instagram_sync_runs (status, snapshot_date DESC, completed_at DESC)`.execute();

  await sql`
    CREATE TABLE IF NOT EXISTS instagram_dashboard_snapshots (
      snapshot_key TEXT PRIMARY KEY,
      sync_run_id TEXT NOT NULL,
      snapshot_date DATE NOT NULL,
      window_start DATE NOT NULL,
      window_end DATE NOT NULL,
      generated_at TIMESTAMPTZ NOT NULL,
      funnel_payload JSONB NOT NULL,
      comments_payload JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `.execute();
  await sql`CREATE INDEX IF NOT EXISTS instagram_dashboard_snapshots_date_idx ON instagram_dashboard_snapshots (snapshot_date DESC, generated_at DESC)`.execute();
}

function countPayload(funnel: Row, comments: Row) {
  return {
    daily_reach: Array.isArray(funnel?.daily?.reach) ? funnel.daily.reach.length : 0,
    daily_profile_visits: Array.isArray(funnel?.daily?.profile_visits) ? funnel.daily.profile_visits.length : 0,
    daily_followers: Array.isArray(funnel?.daily?.followers) ? funnel.daily.followers.length : 0,
    daily_website_clicks: Array.isArray(funnel?.daily?.website_clicks) ? funnel.daily.website_clicks.length : 0,
    content: Array.isArray(funnel?.content) ? funnel.content.length : 0,
    unanswered_comments: Array.isArray(comments?.unanswered) ? comments.unanswered.length : 0,
    scanned_media: Number(comments?.scanned_media || 0),
  };
}

function number(value: unknown) {
  return Number(value || 0);
}

function percent(numerator: number, denominator: number) {
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}

function mergeDailyRows(payloads: Row[], key: string) {
  const byDate = new Map<string, number>();
  for (const payload of payloads) {
    for (const row of payload?.daily?.[key] || []) {
      byDate.set(String(row.date), number(row.value));
    }
  }
  return [...byDate.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function mergeFunnelPayloads(payloads: Row[], windowStart: string, windowEnd: string) {
  const latest = payloads[payloads.length - 1] || {};
  const stageValue = (key: string) => payloads.reduce((sum, payload) => {
    const stage = (payload?.funnel || []).find((row: Row) => row.key === key);
    return sum + number(stage?.value);
  }, 0);
  const reach = stageValue("reach");
  const profileVisits = stageValue("profile_visits");
  const newFollowers = stageValue("followers");
  const websiteClicks = stageValue("website_clicks");
  const engagementKeys = ["views", "accounts_engaged", "total_interactions", "likes", "comments", "shares", "saves", "story_replies"];
  const engagement = Object.fromEntries(engagementKeys.map((key) => [
    key,
    payloads.reduce((sum, payload) => sum + number(payload?.engagement?.[key]), 0),
  ]));
  engagement.engagement_rate_by_reach = percent(engagement.accounts_engaged, reach);
  const contentById = new Map<string, Row>();
  for (const payload of payloads) {
    for (const row of payload?.content || []) contentById.set(String(row.id), row);
  }
  const warnings = [...new Set(payloads.flatMap((payload) => payload?.warnings || []))];
  warnings.unshift("This 31-day calendar month is combined from a 30-day Meta request and a 1-day request. Additive metrics and daily trends cover the full month; unique-account totals such as Reach and Accounts Engaged may include people seen in both chunks.");
  const followerDataAvailable = payloads.every((payload) => payload?.availability?.new_followers?.available === true);
  const followerAvailabilityMessage = followerDataAvailable
    ? ""
    : payloads.find((payload) => payload?.availability?.new_followers?.available === false)?.availability?.new_followers?.message
      || "Meta does not provide historical follower-gain data for this selected period.";

  return {
    ...latest,
    ok: true,
    generated_at: new Date().toISOString(),
    window: { start_date: windowStart, end_date: windowEnd, timezone: "Asia/Kolkata" },
    warnings,
    availability: {
      ...(latest?.availability || {}),
      new_followers: {
        available: followerDataAvailable,
        message: followerAvailabilityMessage,
      },
    },
    funnel: [
      { key: "reach", label: "Reach", value: reach, conversion_from_previous: 100, owner_hint: "Content head: broaden reach and viral hooks" },
      { key: "profile_visits", label: "Profile visits", value: profileVisits, conversion_from_previous: percent(profileVisits, reach), owner_hint: "Content/profile: make the account promise clearer" },
      {
        key: "followers",
        label: "New followers",
        value: newFollowers,
        conversion_from_previous: followerDataAvailable ? percent(newFollowers, profileVisits) : 0,
        available: followerDataAvailable,
        availability_message: followerAvailabilityMessage,
        owner_hint: followerDataAvailable
          ? "Content head: give visitors a reason to follow"
          : followerAvailabilityMessage,
      },
      { key: "website_clicks", label: "Website taps", value: websiteClicks, conversion_from_previous: percent(websiteClicks, profileVisits), owner_hint: "Marketing: sharpen CTA and link-in-bio path" },
    ],
    rates: {
      profile_visit_rate: percent(profileVisits, reach),
      follow_rate_from_profile: followerDataAvailable ? percent(newFollowers, profileVisits) : null,
      website_tap_rate_from_profile: percent(websiteClicks, profileVisits),
      website_tap_rate_from_reach: percent(websiteClicks, reach),
      final_reach_to_website_rate: percent(websiteClicks, reach),
    },
    engagement,
    daily: {
      reach: mergeDailyRows(payloads, "reach"),
      profile_visits: mergeDailyRows(payloads, "profile_visits"),
      followers: mergeDailyRows(payloads, "followers"),
      website_clicks: mergeDailyRows(payloads, "website_clicks"),
    },
    content: [...contentById.values()].sort((a, b) => number(b.total_interactions) - number(a.total_interactions)),
  };
}

function isLatestWindow(endDate: string, snapshotDate: string) {
  return !endDate || endDate === addDays(snapshotDate, -1);
}

export async function main(
  lookback_days = 30,
  end_date = "",
  timezone = "Asia/Kolkata",
  facebook_token_variable_path = DEFAULT_TOKEN_PATH,
  page_name = "Beforest",
  ig_username = "beforestfarming",
  max_media = 60,
  max_comments_per_media = 100,
  dry_run = false,
) {
  const sql = wmill.datatable();
  const startedAt = new Date().toISOString();
  const snapshotDate = dateInTz(new Date(), timezone);
  const windowEnd = end_date || addDays(snapshotDate, -1);
  const windowStart = addDays(windowEnd, -(Math.max(1, lookback_days) - 1));
  const syncRunId = crypto.randomUUID();

  await createTables(sql);
  await sql`
    INSERT INTO instagram_sync_runs (sync_run_id, snapshot_date, window_start, window_end, status, started_at)
    VALUES (${syncRunId}, to_date(${snapshotDate}, 'YYYY-MM-DD'), to_date(${windowStart}, 'YYYY-MM-DD'), to_date(${windowEnd}, 'YYYY-MM-DD'), 'running', ${startedAt}::timestamptz)
  `.execute();

  try {
    const dashboardPasscode = (await wmill.getVariable(DASHBOARD_PASSCODE_PATH)).trim();
    if (!dashboardPasscode) throw new Error(`Dashboard passcode is not configured: ${DASHBOARD_PASSCODE_PATH}`);

    const fetchFunnel = (startDate: string, endDate: string) => wmill.runScriptByPath(FUNNEL_SCRIPT_PATH, {
      start_date: startDate,
      end_date: endDate,
      facebook_token_variable_path,
      page_name,
      ig_username,
      max_media,
      dashboard_passcode: dashboardPasscode,
    });
    let funnelPayload: Row;
    if (lookback_days <= 30) {
      funnelPayload = await fetchFunnel(windowStart, windowEnd);
    } else if (lookback_days === 31) {
      const firstWindowEnd = addDays(windowStart, 29);
      const firstPayload = await fetchFunnel(windowStart, firstWindowEnd);
      const secondPayload = await fetchFunnel(addDays(firstWindowEnd, 1), windowEnd);
      funnelPayload = mergeFunnelPayloads([firstPayload, secondPayload], windowStart, windowEnd);
    } else {
      throw new Error("Instagram dashboard sync supports up to 30 days, or a 31-day calendar month.");
    }
    const commentsPayload = isLatestWindow(end_date, snapshotDate)
      ? await wmill.runScriptByPath(COMMENTS_SCRIPT_PATH, {
          lookback_days,
          max_media,
          max_comments_per_media,
          facebook_token_variable_path,
          page_name,
          ig_username,
          dashboard_passcode: dashboardPasscode,
        })
      : {
          ok: true,
          availability: "not_available_for_historical_window",
          message: "Comment-response status is available only for the latest rolling window. Historical dashboard ranges do not show current comments.",
          generated_at: new Date().toISOString(),
          scanned_media: 0,
          total_comments: 0,
          answered_comments: 0,
          unanswered_count: 0,
          unanswered: [],
        };
    const counts = countPayload(funnelPayload, commentsPayload);

    if (dry_run) {
      await sql`
        UPDATE instagram_sync_runs
        SET status = 'success', completed_at = ${new Date().toISOString()}::timestamptz, counts = ${counts}::jsonb
        WHERE sync_run_id = ${syncRunId}
      `.execute();
      return { dry_run: true, sync_run_id: syncRunId, snapshot_date: snapshotDate, window_start: windowStart, window_end: windowEnd, counts };
    }

    const windowKey = `window:${windowStart}:${windowEnd}`;
    const snapshotKeys = [`date:${snapshotDate}`, windowKey];
    if (!end_date) snapshotKeys.unshift("latest");
    for (const key of snapshotKeys) {
      await sql`
        INSERT INTO instagram_dashboard_snapshots
          (snapshot_key, sync_run_id, snapshot_date, window_start, window_end, generated_at, funnel_payload, comments_payload)
        VALUES
          (${key}, ${syncRunId}, to_date(${snapshotDate}, 'YYYY-MM-DD'), to_date(${windowStart}, 'YYYY-MM-DD'), to_date(${windowEnd}, 'YYYY-MM-DD'), ${new Date().toISOString()}::timestamptz, ${funnelPayload}::jsonb, ${commentsPayload}::jsonb)
        ON CONFLICT (snapshot_key) DO UPDATE SET
          sync_run_id = EXCLUDED.sync_run_id,
          snapshot_date = EXCLUDED.snapshot_date,
          window_start = EXCLUDED.window_start,
          window_end = EXCLUDED.window_end,
          generated_at = EXCLUDED.generated_at,
          funnel_payload = EXCLUDED.funnel_payload,
          comments_payload = EXCLUDED.comments_payload
      `.execute();
    }

    await sql`
      UPDATE instagram_sync_runs
      SET status = 'success', completed_at = ${new Date().toISOString()}::timestamptz, counts = ${counts}::jsonb
      WHERE sync_run_id = ${syncRunId}
    `.execute();

    return { ok: true, sync_run_id: syncRunId, snapshot_date: snapshotDate, window_start: windowStart, window_end: windowEnd, counts };
  } catch (error) {
    await sql`
      UPDATE instagram_sync_runs
      SET status = 'failed', completed_at = ${new Date().toISOString()}::timestamptz, error = ${error instanceof Error ? error.message : String(error)}
      WHERE sync_run_id = ${syncRunId}
    `.execute();
    throw error;
  }
}
