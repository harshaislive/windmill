import * as wmill from "windmill-client";
import { GoogleAuth } from "google-auth-library";
// Collective funnel (live) - data refresh. Built 2026-11-12 for Sunith's funnel page (Harsha: "make it live, date picker, default last 45 days").
// Every source is read raw, per day, from FROM to today, and stored as one JSON row in datatable collective_funnel_data (name "live").
// The page (f/sales_tracker/serve_collective_funnel) sums any date range in the browser. If a source fails, its last good copy is kept and flagged.
// Change folder: ~/Work/collective_funnel_live
async function zoho() {
  const cacheVar = "f/sales_tracker/zoho_sync_token_cache";
  const c = JSON.parse(String(await wmill.getVariable(cacheVar).catch(() => "") || "{}"));
  if (c.access && c.exp > Date.now() + 120_000) return c as { access: string; base: string };
  const [client_id, client_secret, refresh_token] = await Promise.all(["client_id", "client_secret", "refresh_token"].map((k) => wmill.getVariable(`f/sales_tracker/zoho_sync_${k}`)));
  const r = await fetch("https://accounts.zoho.in/oauth/v2/token", { method: "POST", body: new URLSearchParams({ client_id, client_secret, refresh_token, grant_type: "refresh_token" }) });
  const j: any = await r.json();
  if (!j.access_token) throw new Error(`Zoho token refresh failed: ${j.error ?? r.status}`);
  const n = { access: j.access_token, base: `${j.api_domain ?? "https://www.zohoapis.in"}/crm/v8`, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
  await wmill.setVariable(cacheVar, JSON.stringify(n), true, "Short-lived Zoho CRM token for zoho_sheet_sync. Never print.").catch(() => undefined);
  return n;
}
async function z(t: any, method: string, path: string, body?: unknown) {
  const r = await fetch(t.base + path, { method, headers: { Authorization: `Zoho-oauthtoken ${t.access}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 204) return {};
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok && !j.data) return { __err: r.status, j };
  return j;
}

async function gaToken(wmill: any) {
  const creds = JSON.parse(await wmill.getVariable("f/beforest_10percent_analytics/google_service_account_json"));
  const auth = new GoogleAuth({ credentials: creds, scopes: ["https://www.googleapis.com/auth/analytics.readonly"] });
  return (await (await auth.getClient()).getAccessToken()).token as string;
}
async function ga(tok: string, body: any) {
  const rows: any[] = [];
  for (let off = 0; ; off += 100000) {
    const r = await fetch("https://analyticsdata.googleapis.com/v1beta/properties/365028193:runReport", { method: "POST",
      headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: JSON.stringify({ ...body, limit: 100000, offset: off }) });
    const j: any = await r.json(); if (!r.ok) throw new Error("GA4 " + r.status + " " + JSON.stringify(j).slice(0, 300));
    for (const x of j.rows ?? []) rows.push([...x.dimensionValues.map((d: any) => d.value), ...x.metricValues.map((m: any) => Number(m.value))]);
    if (rows.length >= (j.rowCount ?? 0)) break;
  }
  return rows;
}

async function liDaily(wmill: any, start: string, end: string) {
  const key = await wmill.getVariable("f/marketing/linkedin/maton_api_key");
  const [y1, m1, d1] = start.split("-").map(Number), [y2, m2, d2] = end.split("-").map(Number);
  const q = `q=analytics&pivot=CAMPAIGN&timeGranularity=DAILY&dateRange=(start:(year:${y1},month:${m1},day:${d1}),end:(year:${y2},month:${m2},day:${d2}))` +
    `&accounts=List(urn%3Ali%3AsponsoredAccount%3A559416353)&fields=impressions,clicks,landingPageClicks,costInLocalCurrency,oneClickLeads,dateRange,pivotValues`;
  const r = await fetch("https://gateway.maton.ai/linkedin/rest/adAnalytics", { method: "POST",
    headers: { Authorization: `Bearer ${key}`, "LinkedIn-Version": "202610", "X-Restli-Protocol-Version": "2.0.0", "X-HTTP-Method-Override": "GET", "Content-Type": "application/x-www-form-urlencoded" }, body: q });
  const j: any = await r.json(); if (!r.ok) throw new Error("LinkedIn " + r.status + " " + JSON.stringify(j).slice(0, 300));
  return (j.elements ?? []).map((e: any) => ({ date: `${e.dateRange.start.year}-${String(e.dateRange.start.month).padStart(2, "0")}-${String(e.dateRange.start.day).padStart(2, "0")}`,
    campaign: e.pivotValues?.[0], spend: Number(e.costInLocalCurrency ?? 0), impressions: e.impressions ?? 0, clicks: e.clicks ?? 0, lp: e.landingPageClicks ?? 0, leads: e.oneClickLeads ?? 0 }));
}
async function liCampaignNames(wmill: any) {
  const key = await wmill.getVariable("f/marketing/linkedin/maton_api_key");
  const r = await fetch("https://gateway.maton.ai/linkedin/rest/adAccounts/559416353/adCampaigns?q=search&pageSize=100", { headers: { Authorization: `Bearer ${key}`, "LinkedIn-Version": "202610", "X-Restli-Protocol-Version": "2.0.0" } });
  const j: any = await r.json(); if (!r.ok) throw new Error("LinkedIn campaigns " + r.status + " " + JSON.stringify(j).slice(0, 300));
  return Object.fromEntries((j.elements ?? []).map((c: any) => [`urn:li:sponsoredCampaign:${c.id}`, c.name]));
}

async function metaDaily(wmill: any, since: string, until: string) {
  const [tok, acct, ver] = await Promise.all(["META_FB_USER_TOKEN", "META_AD_ACCOUNT_ID", "META_GRAPH_VERSION"].map((k) => wmill.getVariable(`f/facebook_ads_dashboard/${k}`)));
  const a = String(acct).startsWith("act_") ? acct : `act_${acct}`;
  let url = `https://graph.facebook.com/${ver || "v21.0"}/${a}/insights?` + new URLSearchParams({ level: "campaign", time_increment: "1", limit: "500",
    fields: "campaign_name,spend,impressions,inline_link_clicks", time_range: JSON.stringify({ since, until }), access_token: tok });
  const out: any[] = [];
  while (url) {
    const r = await fetch(url); const j: any = await r.json();
    if (!r.ok) throw new Error("Meta " + r.status + " " + JSON.stringify(j.error ?? j).slice(0, 300));
    for (const x of j.data ?? []) out.push({ date: x.date_start, campaign: x.campaign_name, spend: Number(x.spend ?? 0), impressions: Number(x.impressions ?? 0), clicks: Number(x.inline_link_clicks ?? 0) });
    url = j.paging?.next ?? "";
  }
  return out;
}

// Per-lead rows for the funnel: Zoho Sprint Lead layout (truth for stage, calls, meetings since 2026-11-11 cut-over)
// joined to the Sprint master sheet mirror (source, Typeform submission count, Meeting Notes written before the cut-over).
// Output has no names, phones or emails.
const LAYOUT = "863791000010200070";
const COLL: Record<string, string> = { "The Mumbai Collective": "Mumbai", "The Hammiyala Collective": "Hammiyala", "The Poomaale Collective 2.0": "Poomaale 2.0",
  "The Poomaale Collective 1.0": "Poomaale 1.0", "The Hyderabad Collective": "Hyderabad", "The Bhopal Collective": "Bhopal" };
const MON: Record<string, number> = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
function sheetDay(s: string): string | null { // "12 Aug 2026 05:46" -> 2026-08-12
  const m = String(s ?? "").trim().match(/^(\d{1,2}) (\w{3}) (\d{4})/); if (!m || !MON[m[2]]) return null;
  return `${m[3]}-${String(MON[m[2]]).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}
const p10 = (x: any) => String(x ?? "").replace(/\D/g, "").slice(-10);
const isTest = (name: any, email: any) => /\btest\b/i.test(`${name ?? ""} ${email ?? ""}`);
const TABCOLL: Record<string, string> = { Mumbai: "Mumbai", Hammiyala: "Hammiyala", "Poomaale 2.0": "Poomaale 2.0", "Poomaale 1.0": "Poomaale 1.0", poomaale: "Poomaale 2.0",
  "Vivek Hyderabad": "Hyderabad", "Vivek Poomaale 1.0": "Poomaale 1.0", "Vivek Bhopal": "Bhopal", hyderabad: "Hyderabad", bhopal: "Bhopal", mumbai: "Mumbai", hammiyala: "Hammiyala" };
const istDay = (iso: string | null) => iso ? new Date(new Date(iso).getTime() + 5.5 * 3600e3).toISOString().slice(0, 10) : null;
async function buildLeads(wmill: any, zoho: any, z: any) {
  const t = await zoho(); const zl: any[] = [];
  const F = "id, Sprint_Lead_Key, Mobile, Enquiry_Date, Created_Time, Collective_Name, Sprint_Stage, Funnel_Colour, Call_1_Date, Call_2_Date, Call_3_Date, Call_Attempts, Meeting_1_Date, Converted__s, Converted_Date_Time, Last_Sequence_Send, Handled_by_Tara";
  for (let off = 0; ; off += 2000) {
    const j = await z(t, "POST", "/coql", { select_query: `select ${F} from Leads where Layout = ${LAYOUT} limit ${off}, 2000` });
    zl.push(...(j.data ?? [])); if (!j.info?.more_records) break;
  }
  const sql = wmill.datatable("main");
  const mirror: any[] = await sql`SELECT tab, rows, read_at FROM sales_tracker_sheet_mirror WHERE tab = ANY(${["Mumbai", "Hammiyala", "Poomaale 2.0", "Poomaale 1.0", "Red", "Yellow", "Inbound"]})`.fetch();
  const sheet = new Map<string, any>(); let sheetReadAt = "";
  for (const m of mirror) {
    const rows = typeof m.rows === "string" ? JSON.parse(m.rows) : m.rows; sheetReadAt = String(m.read_at);
    const h: string[] = rows[0]; const ix = (n: string) => h.indexOf(n);
    for (const r of rows.slice(1)) {
      const key = String(r[ix("Lead key")] ?? "").trim(); if (!key) continue;
      if (sheet.has(key)) continue;
      sheet.set(key, { key, phone: p10(r[ix("Phone")]), test: isTest(r[ix("Name")], r[ix("Email")]), coll: String(r[ix("Collective")] ?? "").trim(), stageRaw: String(r[ix("Lead stage")] ?? "").trim(),
        c1d: String(r[ix("Call 1 date")] ?? "").trim(), tab: m.tab, source: String(r[ix("Source")] ?? "").trim(), subs: Number(r[ix("Submission count")]) || 0,
        latest: sheetDay(r[ix("Latest submission (IST)")]), enq: sheetDay(r[ix("Enquiry date (IST)")]),
        notes: String(r[ix("Meeting Notes")] ?? "").trim(), outcome: String(r[ix("Meeting outcome")] ?? "").trim(),
        m1raw: String(r[ix("Meeting #1 date")] ?? "").trim(), wa: String(r[ix("WhatsApp sent")] ?? "").trim(), em: String(r[ix("Email sent")] ?? "").trim() });
    }
  }
  // Vivek's sprint sheet (Hyderabad / Poomaale 1.0 / Bhopal), read the same way as f/vivek_resales/sheet_to_zoho.
  const vk = String(await wmill.getVariable("f/old_leads_churn/harsha_maton_api_key")); const VT = ["Hyderabad", "Poomaale 1.0", "Bhopal"];
  const vr = await fetch(`https://api.maton.ai/google-sheets/v4/spreadsheets/1I7sGJLOleFBBQVMTykspkjPy_swnrNpJ6o6nigyGtS4/values:batchGet?${VT.map((t) => `ranges=${encodeURIComponent(`'${t}'!A1:BZ5000`)}`).join("&")}`,
    { headers: { Authorization: `Bearer ${vk}`, "Maton-Connection": "6463e553-eab2-4cb9-a46f-b1a5665c0031" } });
  if (!vr.ok) throw new Error(`Vivek sheet ${vr.status}`);
  const vj: any = await vr.json();
  VT.forEach((tab, i) => {
    const [h = [], ...rows] = vj.valueRanges?.[i]?.values ?? []; const ix = (n: string) => h.indexOf(n);
    for (const r of rows) {
      const key = String(r[ix("Lead key")] ?? "").trim(); if (!key || sheet.has(key)) continue;
      sheet.set(key, { key, phone: p10(r[ix("Phone")]), test: isTest(r[ix("Name")], r[ix("Email")]), coll: tab, stageRaw: String(r[ix("Lead stage")] ?? "").trim(),
        c1d: String(r[ix("Call 1 date")] ?? "").trim(), tab: "Vivek " + tab, source: String(r[ix("Source")] ?? "").trim(), subs: Number(r[ix("Submission count")]) || 0,
        latest: sheetDay(r[ix("Latest submission (IST)")]), enq: sheetDay(r[ix("Enquiry date (IST)")]),
        notes: String(r[ix("Meeting Notes")] ?? "").trim(), outcome: String(r[ix("Meeting outcome")] ?? "").trim(),
        m1raw: String(r[ix("Meeting #1 date")] ?? "").trim(), wa: String(r[ix("WhatsApp sent")] ?? "").trim(), em: String(r[ix("Email sent")] ?? "").trim() });
    }
  });
  const leads: any[] = []; const skipped: any = {}; const used = new Set<string>();
  const byPhone = new Map<string, any>(); for (const v of sheet.values()) if (v.phone && !byPhone.has(v.phone)) byPhone.set(v.phone, v);
  for (const r of zl) {
    const c = COLL[r.Collective_Name]; if (!c) { skipped[r.Collective_Name ?? "none"] = (skipped[r.Collective_Name ?? "none"] ?? 0) + 1; continue; }
    const key = String(r.Sprint_Lead_Key ?? ""); const s = sheet.get(key) ?? byPhone.get(p10(r.Mobile));
    if (s) used.add(s.key); for (const v of sheet.values()) if (v.phone && v.phone === p10(r.Mobile)) used.add(v.key);
    let src = "Other";
    if (s?.source) src = /linkedin/i.test(s.source) ? "LinkedIn" : /typeform/i.test(s.source) ? "Typeform" : s.source;
    else if (key.startsWith("typeform_")) src = "Typeform";
    else if (key.startsWith("pipedrive")) src = "Typeform";
    else if (!key) src = "Added in Zoho";
    const d = istDay(r.Enquiry_Date) ?? s?.enq ?? null;
    if (!d) { skipped["no enquiry date (imported deal)"] = (skipped["no enquiry date (imported deal)"] ?? 0) + 1; continue; }
    const cancelled = /cancel/i.test(s?.m1raw ?? "");
    const called = !!(r.Call_1_Date || r.Call_2_Date || r.Call_3_Date || Number(r.Call_Attempts) > 0);
    const messaged = !!(r.Last_Sequence_Send || /sent|✓|yes/i.test(s?.wa ?? "") || /sent|✓|yes/i.test(s?.em ?? ""));
    leads.push({ c, d, src, fills: src === "Typeform" ? Math.max(1, s?.subs || 1) : 0, rep: s && s.subs > 1 ? s.latest : null,
      st: r.Sprint_Stage ?? "New", contacted: called || messaged || !["New", null, undefined].includes(r.Sprint_Stage), called,
      c1: !!r.Call_1_Date, mb: !!r.Meeting_1_Date && !cancelled, md: istDay(r.Meeting_1_Date),
      mh: !!r.Converted__s || (!!s?.notes && !!r.Meeting_1_Date), conv: !!r.Converted__s, insheet: !!s });
  }
  // Sheet rows that never reached Zoho (and match no Zoho lead by key or phone): count them from the sheet. Team test entries are left out.
  let sheetOnly = 0;
  for (const v of sheet.values()) {
    if (used.has(v.key)) continue;
    if (v.test) { skipped["team test entry"] = (skipped["team test entry"] ?? 0) + 1; continue; }
    const c = TABCOLL[v.tab] ?? TABCOLL[v.coll] ?? TABCOLL[v.coll.toLowerCase()]; if (!c || !v.enq) { skipped["sheet row without collective/date"] = (skipped["sheet row without collective/date"] ?? 0) + 1; continue; }
    const src = /linkedin/i.test(v.source) ? "LinkedIn" : /typeform/i.test(v.source) ? "Typeform" : (v.source || "Other");
    const st = v.tab === "Red" ? "Not a Fit" : v.tab === "Yellow" ? "Unresponsive" : (v.m1raw && !/cancel/i.test(v.m1raw)) ? "Meeting Booked" : "New";
    const mb = !!v.m1raw && !/cancel/i.test(v.m1raw);
    leads.push({ c, d: v.enq, src, fills: src === "Typeform" ? Math.max(1, v.subs || 1) : 0, rep: v.subs > 1 ? v.latest : null, st,
      contacted: !!(v.c1d || /sent|✓|yes/i.test(v.wa) || /sent|✓|yes/i.test(v.em)) || st !== "New", called: !!v.c1d, c1: !!v.c1d, mb, md: null, mh: mb && !!v.notes, conv: false, insheet: true, sheetOnly: true });
    sheetOnly++;
  }
  skipped["counted from sheet only (not in Zoho)"] = sheetOnly;
  return { leads, skipped, sheetReadAt, zohoCount: zl.length };
}

const FROM = "2026-08-01";
const PREFIX: Record<string, string> = { MUM: "Mumbai", HAM: "Hammiyala", P20: "Poomaale 2.0", P10: "Poomaale 1.0", HYD: "Hyderabad", BPL: "Bhopal" };
const PAGES: Record<string, string> = { Mumbai: "^/the-mumbai-collective/?$", Hammiyala: "^/co-forest/?$", "Poomaale 2.0": "^/poomaale-2-0-collective/?$",
  "Poomaale 1.0": "^/the-poomaale-estate/?$", Hyderabad: "^/hyderabad-collective/?$", Bhopal: "^/(the-bhopal-collective|the-ratapani-collective)/?$" };
const LI_COLLECTIVE = (name: string) => /mumbai/i.test(name) ? "Mumbai" : null;
const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const gaDate = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
function channel(src: string, med: string, camp: string) {
  const s = src.toLowerCase(), m = med.toLowerCase();
  const metaSrc = /^(facebook_ads|facebook|fb|ig|instagram|meta)$/.test(s);
  if (metaSrc && m !== "referral") return "Meta ads";
  if (/(^|\.)(facebook|instagram)\.com$/.test(s)) return "Facebook/Instagram untagged";
  if (m === "organic") return "Search";
  if (s === "(direct)") return "Direct";
  if (/linkedin/.test(s)) return "LinkedIn";
  return "Other";
}
export async function main() {
  const sql = wmill.datatable("main");
  await sql`CREATE TABLE IF NOT EXISTS collective_funnel_data (name text PRIMARY KEY, data jsonb NOT NULL, built_at timestamptz NOT NULL DEFAULT now())`.execute();
  const prev: any = ((await sql`SELECT data FROM collective_funnel_data WHERE name = 'live'`.fetch()) as any[])[0]?.data ?? {};
  const to = today(); const D: any = { from: FROM, to, built_at: new Date().toISOString(), sources: {} };
  const step = async (name: string, fn: () => Promise<any>) => {
    try { D[name] = await fn(); D.sources[name] = { ok: true, at: D.built_at }; }
    catch (e: any) { D[name] = prev[name] ?? null; D.sources[name] = { ok: false, error: String(e?.message ?? e).slice(0, 300), at: prev.sources?.[name]?.at ?? null }; }
  };
  await step("meta", async () => {
    const rows = await metaDaily(wmill, FROM, to); const out: any[] = []; const camps: any = {};
    for (const r of rows) { const c = PREFIX[String(r.campaign).split("_")[0]]; if (!c) continue; camps[c] ??= new Set(); camps[c].add(r.campaign);
      out.push([r.date, c, Math.round(r.spend * 100) / 100, r.impressions, r.clicks]); }
    return { rows: out, campaigns: Object.fromEntries(Object.entries(camps).map(([k, v]: any) => [k, [...v]])) };
  });
  await step("linkedin", async () => {
    const [rows, names] = [await liDaily(wmill, FROM, to), await liCampaignNames(wmill)];
    const out: any[] = []; const camps: any = {};
    for (const r of rows) { const n = names[r.campaign] ?? r.campaign; const c = LI_COLLECTIVE(n); if (!c) continue; camps[c] ??= new Set(); camps[c].add(n);
      out.push([r.date, c, Math.round(r.spend * 100) / 100, r.impressions, r.clicks, r.leads]); }
    return { rows: out, campaigns: Object.fromEntries(Object.entries(camps).map(([k, v]: any) => [k, [...v]])) };
  });
  await step("ga", async () => {
    const tok = await gaToken(wmill); const out: any[] = [];
    for (const [c, re] of Object.entries(PAGES)) {
      const rows = await ga(tok, { dateRanges: [{ startDate: FROM, endDate: to }], dimensions: [{ name: "date" }, { name: "sessionSource" }, { name: "sessionMedium" }, { name: "sessionCampaignName" }],
        metrics: [{ name: "sessions" }], dimensionFilter: { filter: { fieldName: "pagePath", stringFilter: { matchType: "FULL_REGEXP", value: re } } } });
      const agg = new Map<string, number>();
      for (const [d, s, m, k, n] of rows) { const key = gaDate(d) + "|" + channel(s, m, k); agg.set(key, (agg.get(key) ?? 0) + n); }
      for (const [k, n] of agg) { const [d, ch] = k.split("|"); out.push([d, c, ch, n]); }
    }
    return { rows: out };
  });
  await step("leads", async () => {
    const r = await buildLeads(wmill, zoho, z);
    return { rows: r.leads.map((l: any) => [l.c, l.d, l.src, l.fills, l.rep, l.st, l.contacted ? 1 : 0, l.c1 ? 1 : 0, l.mb ? 1 : 0, l.mh ? 1 : 0]), skipped: r.skipped, zoho_count: r.zohoCount, sheet_read_at: r.sheetReadAt };
  });
  await sql`INSERT INTO collective_funnel_data (name, data) VALUES ('live', ${JSON.stringify(D)}::jsonb) ON CONFLICT (name) DO UPDATE SET data = EXCLUDED.data, built_at = now()`.execute();
  const bad = Object.entries(D.sources).filter(([, v]: any) => !v.ok);
  if (bad.length) throw new Error("Stale sources kept from last run: " + bad.map(([k, v]: any) => `${k}: ${v.error}`).join(" | "));
  return { ok: true, to, meta: D.meta?.rows?.length, linkedin: D.linkedin?.rows?.length, ga: D.ga?.rows?.length, leads: D.leads?.rows?.length, skipped: D.leads?.skipped };
}
