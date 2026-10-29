type DailyRow = Record<string, any> & {
  metric_date: string;
  spend: number;
  reach: number;
  impressions: number;
  frequency: number;
  link_clicks: number;
  website_visits: number;
  typeform_submits: number;
  shares: number;
  comments: number;
};

declare const process: { env: Record<string, string | undefined> };

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeRate(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
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

function previousWindow(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00+05:30`);
  const end = new Date(`${endDate}T00:00:00+05:30`);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  const previousEnd = addDays(startDate, -1);
  const previousStart = addDays(previousEnd, -(days - 1));
  return { start_date: previousStart, end_date: previousEnd };
}

function apiCandidates(path: string) {
  const base = (process.env.BASE_INTERNAL_URL || process.env.BASE_URL || "").replace(/\/+$/, "");
  if (!base) throw new Error("BASE_INTERNAL_URL or BASE_URL is required to read dashboard datatables.");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (base.endsWith("/api")) return [`${base}${normalized}`];
  return [`${base}/api${normalized}`, `${base}${normalized}`];
}

async function apiPost(path: string, body: unknown) {
  const token = process.env.WM_TOKEN;
  if (!token) throw new Error("WM_TOKEN is required to read dashboard datatables.");
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

async function tableExists(sql: ReturnType<typeof datatable>, tableName: string) {
  const row = await sql`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ${tableName}
    ) AS exists
  `.fetchOne();
  return Boolean(row?.exists);
}

function summarize(rows: DailyRow[]) {
  const spend = rows.reduce((sum, row) => sum + num(row.spend), 0);
  const reach = rows.reduce((sum, row) => sum + num(row.reach), 0);
  const impressions = rows.reduce((sum, row) => sum + num(row.impressions), 0);
  const link_clicks = rows.reduce((sum, row) => sum + num(row.link_clicks), 0);
  const website_visits = rows.reduce((sum, row) => sum + num(row.website_visits), 0);
  const typeform_submits = rows.reduce((sum, row) => sum + num(row.typeform_submits), 0);
  const shares = rows.reduce((sum, row) => sum + num(row.shares), 0);
  const comments = rows.reduce((sum, row) => sum + num(row.comments), 0);
  const frequency = safeRate(rows.reduce((sum, row) => sum + num(row.frequency) * num(row.reach), 0), reach);
  return {
    spend,
    reach,
    impressions,
    link_clicks,
    website_visits,
    typeform_submits,
    shares,
    comments,
    frequency,
    ctr: safeRate(link_clicks, impressions),
    cpc: safeRate(spend, link_clicks),
    cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
    cpl: typeform_submits > 0 ? spend / typeform_submits : null,
    click_rate: safeRate(link_clicks, reach),
    website_visit_rate: safeRate(website_visits, link_clicks),
    typeform_submit_rate: safeRate(typeform_submits, website_visits),
  };
}

function groupBy<T>(rows: T[], getKey: (row: T) => string | undefined) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = getKey(row) || "unknown";
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  return groups;
}

function dailySeries(rows: DailyRow[], metric: string) {
  return [...groupBy(rows, (row) => String(row.metric_date).slice(0, 10)).entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayRows]) => {
      if (metric === "daily_cpl") {
        const totals = summarize(dayRows);
        return { date, value: totals.typeform_submits > 0 ? totals.spend / totals.typeform_submits : 0 };
      }
      return { date, value: dayRows.reduce((sum: number, row: any) => sum + num(row[metric]), 0) };
    });
}

function delta(current: number | null, previous: number | null, lowerIsBetter = false) {
  if (current === null || previous === null || previous === 0) return { value: null, good: null };
  const value = (current - previous) / previous;
  return { value, good: lowerIsBetter ? value <= 0 : value >= 0 };
}

function campaignStatus(current: any, previous: any, accountCpl: number | null) {
  const cplOk = accountCpl !== null && current.cpl !== null && current.cpl <= accountCpl;
  const ctrDeclining = previous?.ctr ? current.ctr < previous.ctr * 0.85 : false;
  const cplIncreasing = previous?.cpl && current.cpl ? current.cpl > previous.cpl * 1.15 : false;
  if (cplOk && current.typeform_submits >= 2) return "Scale";
  if (current.spend > 1000 && current.typeform_submits === 0) return "Weak";
  if (current.frequency > 3 && ctrDeclining) return "Fatigue";
  if (ctrDeclining || cplIncreasing) return "Watch";
  return "Healthy";
}

function buildInsights(totals: any, previous: any) {
  const insights: Array<{ title: string; body: string; tone: string }> = [];
  if (totals.ctr < 0.008) {
    insights.push({ title: "Weak Creative or Hook", body: "CTR is below 0.8%. Refresh the first frame, headline, or offer clarity.", tone: "amber" });
  }
  if (totals.website_visits > 0 && safeRate(totals.typeform_submits, totals.website_visits) < 0.02) {
    insights.push({ title: "Landing Page or Typeform Issue", body: "Website visits are not converting into Typeform submits strongly enough.", tone: "pink" });
  }
  if (totals.typeform_submits > previous.typeform_submits && totals.cpl !== null && previous.cpl !== null && totals.cpl < previous.cpl) {
    insights.push({ title: "Strong Scale Candidate", body: "Typeform submits increased while CPL decreased versus the previous period.", tone: "green" });
  }
  if (previous.reach > 0 && totals.reach < previous.reach * 0.8) {
    insights.push({ title: "Delivery or Budget Issue", body: "Reach dropped more than 20% versus the previous period.", tone: "amber" });
  }
  if (totals.shares > 0) {
    insights.push({ title: "Content Resonance Signal", body: "Top creatives are generating shares. Use these themes for the next creative batch.", tone: "blue" });
  }
  return insights.slice(0, 5);
}

function emptyPayload(startDate: string, endDate: string, message: string) {
  const totals = summarize([]);
  return {
    ok: true,
    ready: false,
    message,
    generated_at: new Date().toISOString(),
    window: { start_date: startDate, end_date: endDate, timezone: "Asia/Kolkata" },
    previous_window: previousWindow(startDate, endDate),
    funnel: [
      { key: "reach", label: "Reach", value: 0, conversion_from_previous: 100, owner_hint: "Unique people reached by ads." },
      { key: "link_clicks", label: "Link Clicks", value: 0, conversion_from_previous: 0, owner_hint: "People clicking ad links." },
      { key: "website_visits", label: "Website Visits", value: 0, conversion_from_previous: 0, owner_hint: "Landing page views from ad traffic." },
      { key: "typeform_submits", label: "Typeform Submits", value: 0, conversion_from_previous: 0, owner_hint: "Meta pixel TypeformSubmit conversions." },
    ],
    totals,
    previous_totals: totals,
    deltas: {},
    daily: { typeform_submits: [], daily_cpl: [], reach: [], spend: [], link_clicks: [] },
    campaigns: [],
    creatives: [],
    top_creatives: [],
    creatives_to_review: [],
    community: {
      comments_checked: 0,
      answered_comments: 0,
      unanswered_count: 0,
      response_rate: 0,
      lead_intent_comments: 0,
      risk_comments: 0,
      top_creative_needing_replies: null,
      unanswered: [],
    },
    insights: [{ title: "Metrics Not Synced", body: message, tone: "amber" }],
  };
}

export async function main(start_date?: string, end_date?: string) {
  const today = dateInTimezone(new Date(), "Asia/Kolkata");
  const endDate = end_date || today;
  const startDate = start_date || addDays(endDate, -6);
  const previous = previousWindow(startDate, endDate);
  const workspace =
    process.env.WM_WORKSPACE ||
    process.env.WORKSPACE ||
    process.env.WM_WORKSPACE_ID ||
    "beforest-automations";
  const sql = datatable(workspace);

  const ready = await tableExists(sql, "fb_ads_campaign_daily_metrics");
  if (!ready) {
    return emptyPayload(startDate, endDate, "Dashboard datatables do not exist yet. Run f/facebook_ads_dashboard/sync_facebook_ads_metrics once.");
  }

  const [campaignRowsRaw, previousCampaignRowsRaw, creativeRowsRaw, communitySnapshot] = await Promise.all([
    sql`
      SELECT *
      FROM fb_ads_campaign_daily_metrics
      WHERE metric_date >= ${startDate}::TEXT::DATE
        AND metric_date <= ${endDate}::TEXT::DATE
      ORDER BY metric_date ASC
    `.fetch(),
    sql`
      SELECT *
      FROM fb_ads_campaign_daily_metrics
      WHERE metric_date >= ${previous.start_date}::TEXT::DATE
        AND metric_date <= ${previous.end_date}::TEXT::DATE
      ORDER BY metric_date ASC
    `.fetch(),
    sql`
      SELECT
        d.*,
        COALESCE(m.creative_name, d.ad_name) AS creative_name,
        m.thumbnail_url,
        m.effective_object_story_id
      FROM fb_ads_creative_daily_metrics d
      LEFT JOIN fb_ads_creative_metadata m
        ON m.ad_id = d.ad_id
      WHERE d.metric_date >= ${startDate}::TEXT::DATE
        AND d.metric_date <= ${endDate}::TEXT::DATE
      ORDER BY d.metric_date ASC
    `.fetch(),
    sql`
      SELECT *
      FROM fb_ads_comment_response_snapshots
      WHERE snapshot_key = 'latest'
      LIMIT 1
    `.fetchOne(),
  ]);
  const campaignRows = campaignRowsRaw as DailyRow[];
  const previousCampaignRows = previousCampaignRowsRaw as DailyRow[];
  const creativeRows = creativeRowsRaw as Array<DailyRow & {
    ad_id: string;
    ad_name: string;
    campaign_id?: string;
    campaign_name?: string;
    creative_name?: string;
    thumbnail_url?: string;
    effective_object_story_id?: string;
  }>;

  const totals = summarize(campaignRows);
  const previousTotals = summarize(previousCampaignRows);
  const previousCampaignMap = new Map(
    [...groupBy(previousCampaignRows, (row) => row.campaign_id).entries()]
      .map(([id, rows]) => [id, summarize(rows)]),
  );

  const campaigns = [...groupBy(campaignRows, (row) => row.campaign_id).entries()].map(([campaign_id, rows]) => {
    const metrics = summarize(rows);
    return {
      campaign_id,
      campaign_name: rows[0]?.campaign_name || campaign_id,
      ...metrics,
      status: campaignStatus(metrics, previousCampaignMap.get(campaign_id), totals.cpl),
    };
  }).sort((a, b) => b.typeform_submits - a.typeform_submits || (a.cpl ?? Infinity) - (b.cpl ?? Infinity));

  const creatives = [...groupBy(creativeRows, (row) => row.ad_id).entries()].map(([ad_id, rows]) => {
    const metrics = summarize(rows);
    return {
      ad_id,
      ad_name: rows[0]?.ad_name || ad_id,
      campaign_id: rows[0]?.campaign_id,
      campaign_name: rows[0]?.campaign_name,
      creative_name: rows[0]?.creative_name || rows[0]?.ad_name || ad_id,
      thumbnail_url: rows[0]?.thumbnail_url,
      effective_object_story_id: rows[0]?.effective_object_story_id,
      ...metrics,
    };
  }).sort((a, b) => b.typeform_submits - a.typeform_submits || (a.cpl ?? Infinity) - (b.cpl ?? Infinity));

  const avgCreativeSubmits = safeRate(
    creatives.reduce((sum, row) => sum + row.typeform_submits, 0),
    creatives.length,
  );
  const topCreatives = creatives.filter((row) => row.typeform_submits > 0).slice(0, 8);
  const creativesToReview = creatives
    .filter((row) => !(row.typeform_submits >= avgCreativeSubmits && row.cpl !== null && totals.cpl !== null && row.cpl <= totals.cpl))
    .filter((row) => (row.spend >= 500 && row.typeform_submits < avgCreativeSubmits && row.cpl !== null && totals.cpl !== null && row.cpl > totals.cpl) || row.ctr < totals.ctr * 0.65)
    .sort((a, b) => b.spend - a.spend || a.typeform_submits - b.typeform_submits || a.ctr - b.ctr)
    .slice(0, 8);

  const unanswered = Array.isArray(communitySnapshot?.unanswered_comments_json)
    ? communitySnapshot.unanswered_comments_json
    : [];

  return {
    ok: true,
    ready: true,
    generated_at: new Date().toISOString(),
    window: { start_date: startDate, end_date: endDate, timezone: "Asia/Kolkata" },
    previous_window: previous,
    funnel: [
      { key: "reach", label: "Reach", value: totals.reach, conversion_from_previous: 100, owner_hint: "Unique people reached by ads." },
      { key: "link_clicks", label: "Link Clicks", value: totals.link_clicks, conversion_from_previous: totals.click_rate * 100, owner_hint: "People clicking ad links." },
      { key: "website_visits", label: "Website Visits", value: totals.website_visits, conversion_from_previous: totals.website_visit_rate * 100, owner_hint: "Landing page views from ad traffic." },
      { key: "typeform_submits", label: "Typeform Submits", value: totals.typeform_submits, conversion_from_previous: totals.typeform_submit_rate * 100, owner_hint: "Meta pixel TypeformSubmit conversions." },
    ],
    totals,
    previous_totals: previousTotals,
    deltas: {
      spend: delta(totals.spend, previousTotals.spend, true),
      reach: delta(totals.reach, previousTotals.reach),
      link_clicks: delta(totals.link_clicks, previousTotals.link_clicks),
      website_visits: delta(totals.website_visits, previousTotals.website_visits),
      typeform_submits: delta(totals.typeform_submits, previousTotals.typeform_submits),
      ctr: delta(totals.ctr, previousTotals.ctr),
      cpl: delta(totals.cpl, previousTotals.cpl, true),
    },
    daily: {
      typeform_submits: dailySeries(campaignRows, "typeform_submits"),
      daily_cpl: dailySeries(campaignRows, "daily_cpl"),
      reach: dailySeries(campaignRows, "reach"),
      spend: dailySeries(campaignRows, "spend"),
      link_clicks: dailySeries(campaignRows, "link_clicks"),
    },
    campaigns,
    creatives,
    top_creatives: topCreatives,
    creatives_to_review: creativesToReview,
    community: {
      comments_checked: num(communitySnapshot?.comments_checked),
      answered_comments: num(communitySnapshot?.answered_comments),
      unanswered_count: num(communitySnapshot?.unanswered_count),
      response_rate: num(communitySnapshot?.response_rate),
      lead_intent_comments: num(communitySnapshot?.lead_intent_comments),
      risk_comments: num(communitySnapshot?.risk_comments),
      top_creative_needing_replies: communitySnapshot?.top_creative_name
        ? {
            creative_name: communitySnapshot.top_creative_name,
            unanswered_count: num(communitySnapshot.top_creative_unanswered_count),
          }
        : null,
      unanswered,
    },
    insights: buildInsights(totals, previousTotals),
  };
}
