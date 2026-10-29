import * as wmill from "windmill-client";

function emptyPayload(message: string) {
  return {
    ok: true,
    ready: false,
    message,
    generated_at: new Date().toISOString(),
    snapshot_date: "",
    timezone: "Asia/Kolkata",
    source: { deal_count: 0, stale_days: 14 },
    totals: {
      key: "all",
      label: "All deals",
      open: { count: 0, value: 0, weighted_value: 0 },
      won: { count: 0, value: 0, weighted_value: 0 },
      lost: { count: 0, value: 0, weighted_value: 0 },
      total: { count: 0, value: 0, weighted_value: 0 },
      no_activity: 0,
      overdue_activity: 0,
      stale_open: 0,
      expected_close_overdue: 0,
      avg_open_age_days: 0,
      win_rate_closed: 0,
    },
    owners: [],
    collectives: [],
    owner_collectives: [],
    stages: [],
    lost_reasons: [],
    recent_deals: [],
  };
}

function payloadFrom(row: any) {
  const payload = row?.payload;
  if (typeof payload === "string") {
    try {
      return JSON.parse(payload);
    } catch {
      return null;
    }
  }
  return payload || null;
}

export async function main() {
  try {
    const sql = wmill.datatable("main");
    const row = await sql`
      SELECT payload
      FROM pipedrive_deal_snapshot_cache_v2
      WHERE snapshot_key = 'latest'
      LIMIT 1
    `.fetchOne();
    const payload = payloadFrom(row);
    if (payload?.totals && Array.isArray(payload.owners)) return payload;
    return emptyPayload("No Pipedrive deal snapshot found yet. Run the daily snapshot sync once.");
  } catch (error: any) {
    return emptyPayload(error?.message || "Could not read Pipedrive deal snapshot cache.");
  }
}
