import * as wmill from "windmill-client";

type GraphMetric = {
  name: string;
  values?: Array<{ value: number; end_time?: string }>;
  total_value?: {
    value?: number;
    breakdowns?: Array<{
      dimension_keys?: string[];
      results?: Array<{
        dimension_values?: string[];
        value?: number;
      }>;
    }>;
  };
};

type MediaItem = {
  id: string;
  caption?: string;
  timestamp: string;
  media_type: string;
  permalink?: string;
  like_count?: number;
  comments_count?: number;
};

type MediaInsights = {
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  total_interactions: number;
  views: number;
  profile_visits: number | null;
  follows: number | null;
  profile_activity: number | null;
  bio_link_clicks: number | null;
};

type DemographicBreakdown = "gender" | "age" | "city" | "country";

type DemographicRow = {
  label: string;
  value: number;
  percent: number;
};

const GRAPH_BASE = "https://graph.facebook.com/v23.0";
const DEFAULT_TOKEN_PATH = "f/marketing/instagram/facebook_api_token";
const DASHBOARD_PASSCODE_PATH = "f/marketing/instagram/dashboard_passcode";

function toDate(value: string, fallback: Date): Date {
  if (!value) return fallback;
  const parsed = new Date(`${value}T00:00:00+05:30`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date: ${value}. Use YYYY-MM-DD.`);
  }
  return parsed;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function unixSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

function formatDateInKolkata(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function pct(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 10000) / 100;
}

function valueFor(metrics: GraphMetric[], name: string): number {
  const metric = metrics.find((item) => item.name === name);
  if (!metric) return 0;
  if (metric.total_value) return Number(metric.total_value.value || 0);
  return (metric.values || []).reduce((sum, row) => sum + Number(row.value || 0), 0);
}

function dailyValues(metrics: GraphMetric[], name: string) {
  const metric = metrics.find((item) => item.name === name);
  return (metric?.values || []).map((row) => ({
    date: row.end_time ? row.end_time.slice(0, 10) : "",
    value: Number(row.value || 0),
  }));
}

function countryName(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return code;
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code;
  } catch {
    return code;
  }
}

function demographicLabel(breakdown: DemographicBreakdown, value: string): string {
  if (breakdown === "gender") {
    return ({ F: "Female", M: "Male", U: "Unspecified" } as Record<string, string>)[value] || value;
  }
  if (breakdown === "country") return countryName(value);
  return value || "Unspecified";
}

function demographicRows(metrics: GraphMetric[], breakdown: DemographicBreakdown, limit = 45): DemographicRow[] {
  const metric = metrics.find((item) => item.name === "follower_demographics");
  const breakdownData = metric?.total_value?.breakdowns?.find((item) => item.dimension_keys?.includes(breakdown));
  const rows = breakdownData?.results || [];
  const total = rows.reduce((sum, row) => sum + Number(row.value || 0), 0);
  return rows
    .map((row) => ({
      label: demographicLabel(breakdown, String(row.dimension_values?.[0] || "Unspecified")),
      value: Number(row.value || 0),
      percent: pct(Number(row.value || 0), total),
    }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

function breakdownValue(metrics: GraphMetric[], metricName: string, dimensionValue: string): number {
  const metric = metrics.find((item) => item.name === metricName);
  const breakdown = metric?.total_value?.breakdowns?.[0];
  const row = breakdown?.results?.find((item) => item.dimension_values?.includes(dimensionValue));
  return Number(row?.value || 0);
}

function daysInWindow(start: Date, untilExclusive: Date): Date[] {
  const days: Date[] = [];
  for (let day = new Date(start); day < untilExclusive; day = addDays(day, 1)) {
    days.push(day);
  }
  return days.slice(0, 45);
}

function laterDate(a: Date, b: Date): Date {
  return a > b ? a : b;
}

function earlierDate(a: Date, b: Date): Date {
  return a < b ? a : b;
}

async function dailyTotalValueMetrics(igId: string, token: string, start: Date, untilExclusive: Date, metrics: string[]) {
  const days = daysInWindow(start, untilExclusive);
  const rows = await Promise.all(
    days.map(async (day) => {
      const nextDay = addDays(day, 1);
      const result = await graphGet<{ data: GraphMetric[] }>(`/${igId}/insights`, token, {
        metric: metrics.join(","),
        period: "day",
        metric_type: "total_value",
        since: unixSeconds(day),
        until: unixSeconds(nextDay),
      });
      return {
        date: formatDateInKolkata(day),
        values: Object.fromEntries(metrics.map((metric) => [metric, valueFor(result.data, metric)])),
      };
    }),
  );

  return Object.fromEntries(
    metrics.map((metric) => [
      metric,
      rows.map((row) => ({ date: row.date, value: Number(row.values[metric] || 0) })),
    ]),
  );
}

async function getFollowerDemographics(igId: string, token: string, warnings: string[]) {
  const breakdowns: DemographicBreakdown[] = ["gender", "age", "city", "country"];
  const results = await Promise.all(
    breakdowns.map(async (breakdown) => {
      try {
        const response = await graphGet<{ data: GraphMetric[] }>(`/${igId}/insights`, token, {
          metric: "follower_demographics",
          period: "lifetime",
          metric_type: "total_value",
          breakdown,
        });
        return [breakdown, demographicRows(response.data, breakdown)] as const;
      } catch {
        warnings.push(`Follower ${breakdown} demographics are unavailable from Meta for this refresh.`);
        return [breakdown, []] as const;
      }
    }),
  );

  return {
    timeframe: "lifetime",
    note: "Aggregated lifetime follower-base demographics from Meta. This is not followers gained in the selected window. Profession is not exposed by the Instagram Graph API.",
    gender: results.find(([breakdown]) => breakdown === "gender")?.[1] || [],
    age: results.find(([breakdown]) => breakdown === "age")?.[1] || [],
    city: results.find(([breakdown]) => breakdown === "city")?.[1] || [],
    country: results.find(([breakdown]) => breakdown === "country")?.[1] || [],
  };
}

async function graphGet<T>(path: string, token: string, params: Record<string, string | number> = {}): Promise<T> {
  const url = new URL(`${GRAPH_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  url.searchParams.set("access_token", token);
  const response = await fetch(url.toString());
  const body = await response.json();
  if (!response.ok || body.error) {
    throw new Error(body.error?.message || `Graph API request failed: ${response.status}`);
  }
  return body as T;
}

async function graphGetUrl<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok || body.error) {
    throw new Error(body.error?.message || `Graph API request failed: ${response.status}`);
  }
  return body as T;
}

async function getToken(variablePath: string): Promise<string> {
  const token = (await wmill.getVariable(variablePath)).trim();
  if (!token || token === "CHANGE_ME_FACEBOOK_LONG_LIVED_ACCESS_TOKEN") {
    throw new Error(`Facebook token variable is not configured: ${variablePath}`);
  }
  return token;
}

async function requireDashboardPasscode(input: string): Promise<void> {
  const configured = (await wmill.getVariable(DASHBOARD_PASSCODE_PATH)).trim();
  if (!configured) {
    throw new Error(`Dashboard passcode is not configured: ${DASHBOARD_PASSCODE_PATH}`);
  }
  if (input.trim() !== configured) {
    throw new Error("Invalid dashboard passcode.");
  }
}

async function findBeforestInstagram(token: string, pageName: string, igUsername?: string) {
  const accounts = await graphGet<{
    data: Array<{
      id: string;
      name: string;
      instagram_business_account?: {
        id: string;
        username: string;
        name?: string;
        followers_count?: number;
        follows_count?: number;
        media_count?: number;
      };
    }>;
  }>("/me/accounts", token, {
    fields: "id,name,instagram_business_account{id,username,name,followers_count,follows_count,media_count}",
  });

  const page = accounts.data.find((item) => {
    const ig = item.instagram_business_account;
    if (!ig) return false;
    if (igUsername) return ig.username.toLowerCase() === igUsername.toLowerCase();
    return item.name.toLowerCase() === pageName.toLowerCase();
  });

  if (!page?.instagram_business_account) {
    throw new Error(`Could not find connected Instagram business account for ${igUsername || pageName}`);
  }

  return {
    page_id: page.id,
    page_name: page.name,
    ig_id: page.instagram_business_account.id,
    ig_username: page.instagram_business_account.username,
    ig_name: page.instagram_business_account.name || page.instagram_business_account.username,
    followers_count: Number(page.instagram_business_account.followers_count || 0),
    follows_count: Number(page.instagram_business_account.follows_count || 0),
    media_count: Number(page.instagram_business_account.media_count || 0),
  };
}

async function listMediaInWindow(igId: string, token: string, since: Date, untilExclusive: Date, maxMedia: number) {
  const rows: MediaItem[] = [];
  let nextUrl: string | undefined;
  let page = await graphGet<{ data: MediaItem[]; paging?: { next?: string } }>(`/${igId}/media`, token, {
    fields: "id,caption,timestamp,media_type,like_count,comments_count,permalink",
    limit: Math.min(100, maxMedia),
  });

  while (true) {
    for (const item of page.data || []) {
      const timestamp = new Date(item.timestamp);
      if (timestamp >= since && timestamp < untilExclusive) {
        rows.push(item);
      }
    }
    if (rows.length >= maxMedia) break;
    nextUrl = page.paging?.next;
    if (!nextUrl) break;
    const oldest = page.data?.length ? new Date(page.data[page.data.length - 1].timestamp) : undefined;
    if (oldest && oldest < since) break;
    page = await graphGetUrl<{ data: MediaItem[]; paging?: { next?: string } }>(nextUrl);
  }

  return rows.slice(0, maxMedia);
}

async function getMediaInsightValue(mediaId: string, token: string, metric: string): Promise<number> {
  const response = await graphGet<{ data: GraphMetric[] }>(`/${mediaId}/insights`, token, {
    metric,
  }).catch(() => ({ data: [] }));
  return valueFor(response.data, metric);
}

async function getMediaInsightOptional(mediaId: string, token: string, metric: string): Promise<number | null> {
  try {
    const response = await graphGet<{ data: GraphMetric[] }>(`/${mediaId}/insights`, token, { metric });
    return valueFor(response.data, metric);
  } catch {
    return null;
  }
}

async function getMediaInsights(item: MediaItem, token: string): Promise<MediaInsights> {
  const [
    reach,
    likes,
    comments,
    shares,
    saved,
    totalInteractions,
    views,
    profileVisits,
    follows,
  ] = await Promise.all([
    getMediaInsightValue(item.id, token, "reach"),
    getMediaInsightValue(item.id, token, "likes"),
    getMediaInsightValue(item.id, token, "comments"),
    getMediaInsightValue(item.id, token, "shares"),
    getMediaInsightValue(item.id, token, "saved"),
    getMediaInsightValue(item.id, token, "total_interactions"),
    getMediaInsightValue(item.id, token, "views"),
    getMediaInsightOptional(item.id, token, "profile_visits"),
    getMediaInsightOptional(item.id, token, "follows"),
  ]);
  const profileActivity = await graphGet<{ data: GraphMetric[] }>(`/${item.id}/insights`, token, {
    metric: "profile_activity",
    period: "lifetime",
    metric_type: "total_value",
    breakdown: "action_type",
  }).catch(() => null);
  const fallbackLikes = Number(item.like_count || 0);
  const fallbackComments = Number(item.comments_count || 0);
  const safeLikes = likes || fallbackLikes;
  const safeComments = comments || fallbackComments;
  const safeTotalInteractions = totalInteractions || safeLikes + safeComments + shares + saved;
  return {
    reach,
    likes: safeLikes,
    comments: safeComments,
    shares,
    saves: saved,
    total_interactions: safeTotalInteractions,
    views,
    profile_visits: profileVisits,
    follows,
    profile_activity: profileActivity ? valueFor(profileActivity.data, "profile_activity") : null,
    bio_link_clicks: profileActivity ? breakdownValue(profileActivity.data, "profile_activity", "bio_link_clicked") : null,
  };
}

export async function main(
  start_date = "",
  end_date = "",
  facebook_token_variable_path = DEFAULT_TOKEN_PATH,
  page_name = "Beforest",
  ig_username = "beforestfarming",
  max_media = 40,
  dashboard_passcode = "",
) {
  await requireDashboardPasscode(dashboard_passcode);
  const today = new Date();
  const defaultEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const defaultStart = addDays(defaultEnd, -9);
  const start = toDate(start_date, defaultStart);
  const endInclusive = toDate(end_date, defaultEnd);
  const untilExclusive = addDays(endInclusive, 1);
  const token = await getToken(facebook_token_variable_path);
  const account = await findBeforestInstagram(token, page_name, ig_username);

  const totalInsights = await graphGet<{ data: GraphMetric[] }>(`/${account.ig_id}/insights`, token, {
    metric: "reach,profile_views,website_clicks,accounts_engaged,total_interactions,likes,comments,shares,saves,replies,views",
    period: "day",
    metric_type: "total_value",
    since: unixSeconds(start),
    until: unixSeconds(untilExclusive),
  });

  const dailyInsights = await graphGet<{ data: GraphMetric[] }>(`/${account.ig_id}/insights`, token, {
    metric: "reach",
    period: "day",
    since: unixSeconds(start),
    until: unixSeconds(untilExclusive),
  });
  const dailyTotals = await dailyTotalValueMetrics(account.ig_id, token, start, untilExclusive, ["profile_views", "website_clicks"]);
  const todayKolkata = toDate(formatDateInKolkata(new Date()), defaultEnd);
  const followerWindowStart = addDays(todayKolkata, -30);
  const followerWindowEnd = todayKolkata;
  const followerStart = laterDate(start, followerWindowStart);
  const followerUntil = earlierDate(untilExclusive, followerWindowEnd);
  const warnings: string[] = [];
  let followerRows: Array<{ date: string; value: number }> = [];

  if (followerStart < followerUntil) {
    const followerInsights = await graphGet<{ data: GraphMetric[] }>(`/${account.ig_id}/insights`, token, {
      metric: "follower_count",
      period: "day",
      since: unixSeconds(followerStart),
      until: unixSeconds(followerUntil),
    });
    followerRows = dailyValues(followerInsights.data, "follower_count");
  }
  if (followerStart > start || followerUntil < untilExclusive) {
    warnings.push(`New followers are available only for the last 30 days excluding today; this window includes unsupported dates.`);
  }
  const followerDataAvailable = followerStart <= start && followerUntil >= untilExclusive && followerRows.length > 0;
  const followerAvailabilityMessage = followerDataAvailable
    ? ""
    : "Meta does not provide historical follower-gain data for this selected period.";

  const demographics = await getFollowerDemographics(account.ig_id, token, warnings);

  const reach = valueFor(totalInsights.data, "reach");
  const profileVisits = valueFor(totalInsights.data, "profile_views");
  const newFollowers = followerRows.reduce((sum, row) => sum + Number(row.value || 0), 0);
  const websiteClicks = valueFor(totalInsights.data, "website_clicks");

  const funnel = [
    { key: "reach", label: "Reach", value: reach, conversion_from_previous: 100, owner_hint: "Content head: broaden reach and viral hooks" },
    { key: "profile_visits", label: "Profile visits", value: profileVisits, conversion_from_previous: pct(profileVisits, reach), owner_hint: "Content/profile: make the account promise clearer" },
    {
      key: "followers",
      label: "New followers",
      value: newFollowers,
      conversion_from_previous: followerDataAvailable ? pct(newFollowers, profileVisits) : 0,
      available: followerDataAvailable,
      availability_message: followerAvailabilityMessage,
      owner_hint: followerDataAvailable
        ? "Content head: give visitors a reason to follow"
        : followerAvailabilityMessage,
    },
    { key: "website_clicks", label: "Website taps", value: websiteClicks, conversion_from_previous: pct(websiteClicks, profileVisits), owner_hint: "Marketing: sharpen CTA and link-in-bio path" },
  ];

  const media = await listMediaInWindow(account.ig_id, token, start, untilExclusive, max_media);
  const mediaWithInsights = await Promise.all(
    media.map(async (item) => {
      const insights = await getMediaInsights(item, token).catch(() => ({
        reach: 0,
        likes: Number(item.like_count || 0),
        comments: Number(item.comments_count || 0),
        shares: 0,
        saves: 0,
        total_interactions: 0,
        views: 0,
        profile_visits: null,
        follows: null,
        profile_activity: null,
        bio_link_clicks: null,
      }));
      return {
        id: item.id,
        timestamp: item.timestamp,
        media_type: item.media_type,
        caption: (item.caption || "").slice(0, 220),
        permalink: item.permalink,
        ...insights,
        engagement_rate: pct(insights.total_interactions, insights.reach),
      };
    }),
  );

  mediaWithInsights.sort((a, b) => b.total_interactions - a.total_interactions);

  return {
    ok: true,
    generated_at: new Date().toISOString(),
    window: {
      start_date: start_date || formatDateInKolkata(start),
      end_date: end_date || formatDateInKolkata(endInclusive),
      timezone: "Asia/Kolkata",
    },
    account,
    warnings,
    demographics,
    availability: {
      new_followers: {
        available: followerDataAvailable,
        message: followerAvailabilityMessage,
      },
    },
    funnel,
    rates: {
      profile_visit_rate: pct(profileVisits, reach),
      follow_rate_from_profile: followerDataAvailable ? pct(newFollowers, profileVisits) : null,
      website_tap_rate_from_profile: pct(websiteClicks, profileVisits),
      website_tap_rate_from_reach: pct(websiteClicks, reach),
      final_reach_to_website_rate: pct(websiteClicks, reach),
    },
    engagement: {
      views: valueFor(totalInsights.data, "views"),
      accounts_engaged: valueFor(totalInsights.data, "accounts_engaged"),
      total_interactions: valueFor(totalInsights.data, "total_interactions"),
      likes: valueFor(totalInsights.data, "likes"),
      comments: valueFor(totalInsights.data, "comments"),
      shares: valueFor(totalInsights.data, "shares"),
      saves: valueFor(totalInsights.data, "saves"),
      story_replies: valueFor(totalInsights.data, "replies"),
      engagement_rate_by_reach: pct(valueFor(totalInsights.data, "accounts_engaged"), reach),
    },
    daily: {
      reach: dailyValues(dailyInsights.data, "reach"),
      profile_visits: dailyTotals.profile_views || [],
      followers: followerRows,
      website_clicks: dailyTotals.website_clicks || [],
    },
    content: mediaWithInsights,
  };
}
