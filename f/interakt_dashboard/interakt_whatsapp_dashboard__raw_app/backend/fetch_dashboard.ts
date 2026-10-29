type CampaignRow = Record<string, any> & {
  campaign_id: string;
  campaign_name: string;
  set_live_date: string | null;
};

declare const process: { env: Record<string, string | undefined> };

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeRate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
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
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
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
    const run = () => apiPost(`/w/${workspace}/jobs/run_inline/preview`, {
      language: "postgresql",
      content,
      args: { ...args, database: "datatable://main" },
    });
    return { fetch: run, async fetchOne() { const rows = await run(); return Array.isArray(rows) ? rows[0] : rows; } };
  };
}

async function tableExists(sql: ReturnType<typeof datatable>, tableName: string) {
  const row = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${tableName}
    ) AS exists
  `.fetchOne();
  return Boolean(row?.exists);
}

function inferGeography(name: string) {
  const text = name.toLowerCase();
  if (text.includes("mumbai") || text.includes("mum_")) return "Mumbai";
  if (text.includes("bhopal") || text.includes("bhp")) return "Bhopal";
  if (text.includes("hamm") || text.includes("ham_")) return "Hammiyala";
  if (text.includes("poo") || text.includes("poomaale")) return "Poomaale";
  return "Mixed";
}

function inferCampaignType(name: string) {
  const text = name.toLowerCase();
  if (text.includes("reminder")) return "Reminder";
  if (text.includes("churn")) return "Churn";
  if (text.includes("percent") || text.includes("10cent")) return "Offer";
  if (text.includes("pd_") || text.includes("product")) return "Product";
  if (text.includes("webinar")) return "Webinar";
  return "Template";
}

function inferAudienceType(campaignType: string) {
  if (campaignType === "Churn") return "Retargeting";
  if (campaignType === "Reminder") return "Warm audience";
  if (campaignType === "Product") return "Existing customers";
  return "Cold audience";
}

function inferObjective(campaignType: string) {
  if (campaignType === "Churn") return "Reactivate";
  if (campaignType === "Reminder" || campaignType === "Offer") return "Convert";
  if (campaignType === "Product") return "Educate";
  return "Acquire";
}

function summarize(rows: CampaignRow[]) {
  const attempted = rows.reduce((sum, row) => sum + num(row.attempted), 0);
  const sent = rows.reduce((sum, row) => sum + num(row.sent), 0);
  const delivered = rows.reduce((sum, row) => sum + num(row.delivered), 0);
  const read = rows.reduce((sum, row) => sum + num(row.read), 0);
  const replies = rows.reduce((sum, row) => sum + num(row.replies), 0);
  return {
    campaigns: rows.length,
    attempted,
    sent,
    delivered,
    read,
    replies,
    delivery_rate: safeRate(delivered, sent),
    read_rate: safeRate(read, sent),
    reply_rate: safeRate(replies, sent),
    delivered_to_read_rate: safeRate(read, delivered),
    read_to_reply_rate: safeRate(replies, read),
    qualified_conversations: null,
    meetings: null,
    deals: null,
    revenue: null,
    average_response_time_minutes: null,
    unanswered_conversations: null,
    pending_followups: null,
  };
}

function dateKey(value: unknown) {
  const date = value ? new Date(String(value)) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return dateInTimezone(date, "Asia/Kolkata");
}

function inDateRange(value: unknown, startDate: string, endDate: string) {
  const key = dateKey(value);
  return Boolean(key) && key >= startDate && key <= endDate;
}

function matchesSegment(row: CampaignRow, segment: string) {
  return !segment || row.geography === segment || row.campaign_type === segment || row.audience_type === segment || row.campaign_objective === segment;
}

function campaignRowsFromWebhookAgg(rows: any[]): CampaignRow[] {
  return rows.map((row, index) => {
    const name = String(row.campaign_name || row.template_name || `webhook_group_${index + 1}`);
    const campaignType = inferCampaignType(name);
    const sent = num(row.sent);
    const delivered = num(row.delivered);
    const read = num(row.read);
    const replies = num(row.replies);
    return {
      campaign_id: String(row.campaign_id || row.template_name || name),
      campaign_name: name,
      category: row.category || "Webhook",
      status: "Webhook-derived",
      set_live_date: row.set_live_date,
      attempted: sent,
      sent,
      delivered,
      read,
      replies,
      delivered_rate: safeRate(delivered, sent),
      read_rate: safeRate(read, sent),
      reply_rate: safeRate(replies, sent),
      geography: inferGeography(name),
      campaign_type: campaignType,
      audience_type: inferAudienceType(campaignType),
      campaign_objective: inferObjective(campaignType),
      source: "Interakt webhook history",
    };
  });
}

function webhookCampaignRows(events: any[], startDate: string, endDate: string, segment: string) {
  const groups = new Map<string, any[]>();
  for (const event of events) {
    if (!inDateRange(event.event_timestamp, startDate, endDate)) continue;
    const name = String(event.campaign_name || event.template_name || "Unknown template");
    const id = String(event.campaign_id || event.template_name || "unknown");
    const key = `${id}::${name}`;
    groups.set(key, [...(groups.get(key) || []), event]);
  }

  const rows = [...groups.entries()].map(([key, group]) => {
    const [campaignId, campaignName] = key.split("::");
    const countDistinct = (types: string[]) => new Set(group
      .filter((event) => types.includes(String(event.event_type || "")))
      .map((event) => String(event.message_id || `${event.event_type}:${event.event_timestamp}`))).size;
    return {
      campaign_id: campaignId,
      campaign_name: campaignName,
      template_name: campaignName === "Unknown template" ? "" : campaignName,
      category: group.find((event) => event.category)?.category || "Webhook",
      set_live_date: group.reduce((min: string | null, event) => !min || String(event.event_timestamp) < min ? String(event.event_timestamp) : min, null),
      sent: countDistinct(["sent", "delivered", "read", "failed"]),
      delivered: countDistinct(["delivered"]),
      read: countDistinct(["read"]),
      replies: countDistinct(["reply"]),
    };
  });

  return campaignRowsFromWebhookAgg(rows).filter((row) => matchesSegment(row, segment));
}

function delta(current: number | null, previous: number | null, lowerIsBetter = false) {
  if (current === null || previous === null || previous === 0) return { value: null, good: null };
  const value = (current - previous) / previous;
  return { value, good: lowerIsBetter ? value <= 0 : value >= 0 };
}

function groupBy<T>(rows: T[], getKey: (row: T) => string | undefined) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = getKey(row) || "Unknown";
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  return groups;
}

function dailySeries(rows: CampaignRow[], metric: string) {
  return [...groupBy(rows, (row) => String(row.set_live_date || "").slice(0, 10)).entries()]
    .filter(([date]) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayRows]) => ({ date, value: dayRows.reduce((sum: number, row: any) => sum + num(row[metric]), 0) }));
}

function dailySeriesFromWebhook(events: any[], metric: string, startDate: string, endDate: string) {
  const eventTypes: Record<string, string[]> = {
    sent: ["sent", "delivered", "read", "failed"],
    delivered: ["delivered"],
    read: ["read"],
    replies: ["reply"],
  };
  const types = eventTypes[metric] || [];
  const days = new Map<string, Set<string>>();
  for (const event of events) {
    if (!types.includes(String(event.event_type || "")) || !inDateRange(event.event_timestamp, startDate, endDate)) continue;
    const date = dateKey(event.event_timestamp);
    if (!date) continue;
    const messages = days.get(date) || new Set<string>();
    messages.add(String(event.message_id || `${event.event_type}:${event.event_timestamp}`));
    days.set(date, messages);
  }
  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, messages]) => ({ date, value: messages.size }));
}

function segmentSummary(rows: CampaignRow[], field: string) {
  return [...groupBy(rows, (row: any) => row[field]).entries()]
    .map(([name, segmentRows]) => ({ name, ...summarize(segmentRows) }))
    .sort((a, b) => b.sent - a.sent);
}

function buildFunnel(totals: ReturnType<typeof summarize>) {
  const stages = [
    { key: "attempted", label: "Attempted", value: totals.attempted, previous: null, source: "Interakt webhook/API" },
    { key: "sent", label: "Sent", value: totals.sent, previous: totals.attempted, source: "Interakt webhook/API" },
    { key: "read", label: "Read", value: totals.read, previous: totals.sent, source: "Interakt webhook/API" },
    { key: "replies", label: "Replies", value: totals.replies, previous: totals.read, source: "Interakt webhook/API" },
  ];
  return stages.map((stage) => ({
    ...stage,
    conversion_from_previous: stage.value === null || stage.previous === null ? null : safeRate(stage.value, stage.previous),
    dropoff_from_previous: stage.value === null || stage.previous === null ? null : 1 - Number(safeRate(stage.value, stage.previous) || 0),
  }));
}

function emptyPayload(startDate: string, endDate: string, message: string) {
  const previous = previousWindow(startDate, endDate);
  const totals = summarize([]);
  return {
    ok: true,
    ready: false,
    message,
    generated_at: new Date().toISOString(),
    window: { start_date: startDate, end_date: endDate, timezone: "Asia/Kolkata" },
    previous_window: previous,
    totals,
    previous_totals: totals,
    deltas: {},
    funnel: buildFunnel(totals),
    daily: { sent: [], delivered: [], read: [], replies: [] },
    campaigns: [],
    segments: { geography: [], campaign_type: [], audience_type: [], campaign_objective: [] },
    sync: null,
  };
}

type DashboardArgs = {
  start_date?: string;
  end_date?: string;
  segment?: string;
};

export async function main(start_date: string | DashboardArgs = "", end_date = "", segment = "") {
  const requestedStartDate = typeof start_date === "object" && start_date !== null ? String(start_date.start_date || "") : String(start_date || "");
  const requestedEndDate = typeof start_date === "object" && start_date !== null ? String(start_date.end_date || "") : end_date;
  const requestedSegment = typeof start_date === "object" && start_date !== null ? String(start_date.segment || "") : segment;
  const workspace = process.env.WM_WORKSPACE || "beforest-automations";
  const endDate = requestedEndDate || dateInTimezone(new Date(), "Asia/Kolkata");
  const startDate = requestedStartDate || addDays(endDate, -29);
  const previous = previousWindow(startDate, endDate);
  const sql = datatable(workspace);
  const hasMetricsTable = await tableExists(sql, "interakt_campaign_metrics");
  const hasWebhookTable = await tableExists(sql, "interakt_webhook_events");

  if (!hasMetricsTable && !hasWebhookTable) {
    return emptyPayload(startDate, endDate, "Interakt datatables have not been created or synced yet.");
  }

  const allMetricRows = hasMetricsTable ? await sql`
    SELECT *
    FROM interakt_campaign_metrics
    ORDER BY COALESCE(set_live_date, source_synced_at) DESC, campaign_name ASC
  `.fetch() : [];
  let rows = (Array.isArray(allMetricRows) ? allMetricRows : [])
    .filter((row: any) => inDateRange(row.set_live_date || row.source_synced_at, startDate, endDate))
    .filter((row: any) => matchesSegment(row, requestedSegment));
  let previousRows = (Array.isArray(allMetricRows) ? allMetricRows : [])
    .filter((row: any) => inDateRange(row.set_live_date || row.source_synced_at, previous.start_date, previous.end_date));
  const sync = (await sql`
    SELECT *
    FROM interakt_sync_runs
    ORDER BY started_at DESC
    LIMIT 1
  `.fetchOne().catch(() => null)) || null;
  const webhookSync = (await sql`
    SELECT *
    FROM interakt_webhook_sync_runs
    ORDER BY started_at DESC
    LIMIT 1
  `.fetchOne().catch(() => null)) || null;

  let webhookEvents: any[] = [];
  let useWebhookDaily = false;
  if ((!Array.isArray(rows) || rows.length === 0) && hasWebhookTable) {
    const events = await sql`
      SELECT event_timestamp, event_type, message_id, campaign_id, campaign_name, template_name, category
      FROM interakt_webhook_events
      ORDER BY event_timestamp DESC
    `.fetch();
    webhookEvents = Array.isArray(events) ? events : [];
    rows = webhookCampaignRows(webhookEvents, startDate, endDate, requestedSegment);
    previousRows = webhookCampaignRows(webhookEvents, previous.start_date, previous.end_date, requestedSegment);
    useWebhookDaily = true;
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return { ...emptyPayload(startDate, endDate, "No Interakt campaign or webhook rows found for this date window."), sync, webhook_sync: webhookSync };
  }

  const totals = summarize(rows);
  const previousTotals = summarize(Array.isArray(previousRows) ? previousRows : []);
  return {
    ok: true,
    ready: true,
    generated_at: new Date().toISOString(),
    window: { start_date: startDate, end_date: endDate, timezone: "Asia/Kolkata" },
    previous_window: previous,
    totals,
    previous_totals: previousTotals,
    deltas: {
      sent: delta(totals.sent, previousTotals.sent),
      delivered: delta(totals.delivered, previousTotals.delivered),
      read: delta(totals.read, previousTotals.read),
      replies: delta(totals.replies, previousTotals.replies),
      delivery_rate: delta(totals.delivery_rate, previousTotals.delivery_rate),
      read_rate: delta(totals.read_rate, previousTotals.read_rate),
      reply_rate: delta(totals.reply_rate, previousTotals.reply_rate),
    },
    funnel: buildFunnel(totals),
    daily: {
      sent: useWebhookDaily ? dailySeriesFromWebhook(webhookEvents, "sent", startDate, endDate) : dailySeries(rows, "sent"),
      delivered: useWebhookDaily ? dailySeriesFromWebhook(webhookEvents, "delivered", startDate, endDate) : dailySeries(rows, "delivered"),
      read: useWebhookDaily ? dailySeriesFromWebhook(webhookEvents, "read", startDate, endDate) : dailySeries(rows, "read"),
      replies: useWebhookDaily ? dailySeriesFromWebhook(webhookEvents, "replies", startDate, endDate) : dailySeries(rows, "replies"),
    },
    campaigns: rows.slice(0, 200),
    segments: {
      geography: segmentSummary(rows, "geography"),
      campaign_type: segmentSummary(rows, "campaign_type"),
      audience_type: segmentSummary(rows, "audience_type"),
      campaign_objective: segmentSummary(rows, "campaign_objective"),
    },
    sync,
    webhook_sync: webhookSync,
  };
}
