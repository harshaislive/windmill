const BASE = "f/beforest_10percent_analytics";
const PAGE_TITLE = "Beforest 10% Life | Guided Access to Rewilded Landscapes";
const PAGE_HOST = "live.10percent.beforest.co";

type ServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

type Row = Record<string, any>;

function apiBaseUrl(): string {
  const base = (process.env.BASE_INTERNAL_URL || process.env.BASE_URL || "").replace(/\/+$/, "");
  if (!base) throw new Error("BASE_INTERNAL_URL or BASE_URL is required to read Windmill variables.");
  return base.endsWith("/api") ? base : `${base}/api`;
}

function workspaceId(): string {
  return process.env.WM_WORKSPACE || process.env.WORKSPACE || process.env.WM_WORKSPACE_ID || "beforest-automations";
}

async function getVariable(path: string): Promise<string> {
  const token = process.env.WM_TOKEN;
  if (!token) throw new Error("WM_TOKEN is required to read Windmill variables.");
  const base = apiBaseUrl();
  const workspace = workspaceId();
  const encodedPath = encodeURIComponent(path);
  const candidates = [
    `${base}/w/${workspace}/variables/get_value/${encodedPath}`,
    `${base}/w/${workspace}/variables/get/${encodedPath}?decrypt_secret=true`,
  ];

  let lastError = "";
  for (const url of candidates) {
    const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    const text = await response.text();
    if (response.ok) {
      try {
        const parsed = JSON.parse(text);
        if (typeof parsed === "string") return parsed;
        if (parsed && typeof parsed.value === "string") return parsed.value;
        return String(parsed?.value ?? "");
      } catch {
        return text;
      }
    }
    lastError = `${response.status} ${text}`;
  }
  throw new Error(`Failed to read Windmill variable ${path}: ${lastError}`);
}

async function requireDashboardPasscode(input: string): Promise<void> {
  const configured = (await getVariable(`${BASE}/dashboard_passcode`)).trim();
  if (!configured) {
    throw new Error("Dashboard passcode is not configured. Set f/beforest_10percent_analytics/dashboard_passcode in Windmill.");
  }
  if (input.trim() !== configured) {
    throw new Error("Invalid dashboard passcode.");
  }
}

function base64Url(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function signJwt(serviceAccount: ServiceAccount): Promise<string> {
  const tokenUri = serviceAccount.token_uri || "https://oauth2.googleapis.com/token";
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    aud: tokenUri,
    exp: now + 3600,
    iat: now,
  };
  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claims))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64Url(new Uint8Array(signature))}`;
}

async function getGoogleAccessToken(serviceAccount: ServiceAccount): Promise<string> {
  const tokenUri = serviceAccount.token_uri || "https://oauth2.googleapis.com/token";
  const assertion = await signJwt(serviceAccount);
  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new Error(`Google OAuth failed: ${payload.error_description || payload.error || response.status}`);
  }
  return payload.access_token;
}

function pageFilter() {
  return {
    andGroup: {
      expressions: [
        {
          filter: {
            fieldName: "pageTitle",
            stringFilter: { matchType: "EXACT", value: PAGE_TITLE },
          },
        },
        {
          filter: {
            fieldName: "hostName",
            stringFilter: { matchType: "EXACT", value: PAGE_HOST },
          },
        },
      ],
    },
  };
}

async function runGa4Report(accessToken: string, propertyId: string, body: Record<string, any>) {
  const response = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`GA4 report failed: ${payload.error?.message || response.status}`);
  }
  return payload;
}

function reportRows(report: any): Row[] {
  const dimensions = report.dimensionHeaders || [];
  const metrics = report.metricHeaders || [];
  return (report.rows || []).map((row: any) => {
    const item: Row = {};
    dimensions.forEach((header: any, index: number) => {
      item[header.name] = row.dimensionValues?.[index]?.value || "";
    });
    metrics.forEach((header: any, index: number) => {
      const raw = row.metricValues?.[index]?.value;
      const value = Number(raw);
      item[header.name] = Number.isFinite(value) ? value : raw;
    });
    return item;
  });
}

async function getGa4(startDate: string, endDate: string) {
  const propertyId = (await getVariable(`${BASE}/ga4_property_id`)).replace(/^properties\//, "");
  const rawServiceAccount = await getVariable(`${BASE}/google_service_account_json`);
  if (!propertyId || !rawServiceAccount) throw new Error("GA4 variables are not configured.");
  const accessToken = await getGoogleAccessToken(JSON.parse(rawServiceAccount));
  const dateRanges = [{ startDate, endDate }];

  const summaryA = reportRows(
    await runGa4Report(accessToken, propertyId, {
      dateRanges,
      metrics: [
        "activeUsers",
        "newUsers",
        "totalUsers",
        "sessions",
        "engagedSessions",
        "engagementRate",
        "bounceRate",
        "averageSessionDuration",
        "screenPageViews",
        "screenPageViewsPerSession",
      ].map((name) => ({ name })),
      dimensionFilter: pageFilter(),
    }),
  )[0] || {};

  const summaryB = reportRows(
    await runGa4Report(accessToken, propertyId, {
      dateRanges,
      metrics: ["userEngagementDuration", "eventCount", "eventsPerSession", "keyEvents", "sessionKeyEventRate"].map((name) => ({ name })),
      dimensionFilter: pageFilter(),
    }),
  )[0] || {};

  const commonMetrics = [
    { name: "activeUsers" },
    { name: "sessions" },
    { name: "engagedSessions" },
    { name: "screenPageViews" },
    { name: "eventCount" },
    { name: "keyEvents" },
  ];

  const [daily, acquisition, device, geography, events] = await Promise.all([
    runGa4Report(accessToken, propertyId, {
      dateRanges,
      dimensions: [{ name: "date" }],
      metrics: commonMetrics,
      dimensionFilter: pageFilter(),
      orderBys: [{ dimension: { dimensionName: "date" } }],
      limit: 100,
    }),
    runGa4Report(accessToken, propertyId, {
      dateRanges,
      dimensions: [{ name: "sessionDefaultChannelGroup" }, { name: "sessionSourceMedium" }, { name: "sessionCampaignName" }],
      metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "engagedSessions" }, { name: "engagementRate" }, { name: "screenPageViews" }, { name: "keyEvents" }],
      dimensionFilter: pageFilter(),
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 25,
    }),
    runGa4Report(accessToken, propertyId, {
      dateRanges,
      dimensions: [{ name: "deviceCategory" }, { name: "browser" }, { name: "operatingSystem" }],
      metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "engagedSessions" }, { name: "engagementRate" }, { name: "screenPageViews" }],
      dimensionFilter: pageFilter(),
      orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
      limit: 25,
    }),
    runGa4Report(accessToken, propertyId, {
      dateRanges,
      dimensions: [{ name: "country" }, { name: "city" }],
      metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "engagedSessions" }, { name: "screenPageViews" }],
      dimensionFilter: pageFilter(),
      orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
      limit: 25,
    }),
    runGa4Report(accessToken, propertyId, {
      dateRanges,
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }, { name: "totalUsers" }, { name: "keyEvents" }],
      dimensionFilter: pageFilter(),
      orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
      limit: 100,
    }),
  ]);

  return {
    property_id: propertyId,
    page_title: PAGE_TITLE,
    host: PAGE_HOST,
    date_range: { start_date: startDate, end_date: endDate },
    summary: { ...summaryA, ...summaryB },
    daily: reportRows(daily),
    acquisition: reportRows(acquisition),
    device: reportRows(device),
    geography: reportRows(geography),
    events: reportRows(events),
  };
}

async function fetchSupabaseRows(baseUrl: string, headers: Record<string, string>, table: string, select: string, limit = 5000): Promise<Row[]> {
  const url = `${baseUrl}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=${limit}`;
  const response = await fetch(url, { headers });
  const payload = await response.json().catch(() => []);
  if (!response.ok) {
    throw new Error(`${table} fetch failed: ${payload.message || payload.msg || response.status}`);
  }
  return payload;
}

function unique(rows: Row[], key: string): Set<string> {
  return new Set(rows.map((row) => row[key]).filter(Boolean));
}

function sessionsWith(rows: Row[], eventName: string): Set<string> {
  return unique(rows.filter((row) => row.event_name === eventName), "session_id");
}

function isTestRow(row: Row): boolean {
  return String(row.session_id || "").startsWith("codex-") ||
    String(row.event_name || "").startsWith("codex_") ||
    String(row.campaign || "") === "local-smoke-test" ||
    String(row.invite_source || "") === "codex";
}

function countBy(rows: Row[], key: string) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const label = String(row[key] || "(blank)");
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label, count]) => ({ label, count }));
}

function avg(values: any[]): number {
  const usable = values.map(Number).filter(Number.isFinite);
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : 0;
}

function percentile(values: any[], p: number): number {
  const usable = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!usable.length) return 0;
  return usable[Math.min(usable.length - 1, Math.floor((usable.length - 1) * p))];
}

function pct(numerator: number, denominator: number): number {
  return denominator ? (numerator / denominator) * 100 : 0;
}

function dateStart(value: string): Date {
  const relative = value.match(/^(\d+)daysAgo$/);
  const date = new Date();
  if (relative) {
    date.setUTCDate(date.getUTCDate() - Number(relative[1]));
    date.setUTCHours(0, 0, 0, 0);
    return date;
  }
  if (value === "today") {
    date.setUTCHours(0, 0, 0, 0);
    return date;
  }
  if (value === "yesterday") {
    date.setUTCDate(date.getUTCDate() - 1);
    date.setUTCHours(0, 0, 0, 0);
    return date;
  }
  return new Date(`${value}T00:00:00Z`);
}

function dateEnd(value: string): Date {
  if (value === "today") return new Date();
  if (value === "yesterday") {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    return date;
  }
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function inRange(row: Row, start: Date, end: Date, keys: string[]): boolean {
  const raw = keys.map((key) => row[key]).find(Boolean);
  if (!raw) return true;
  const date = new Date(String(raw));
  return Number.isFinite(date.getTime()) && date >= start && date <= end;
}

function anyInRange(row: Row, start: Date, end: Date, keys: string[]): boolean {
  const values = keys.map((key) => row[key]).filter(Boolean);
  if (!values.length) return true;
  return values.some((raw) => {
    const date = new Date(String(raw));
    return Number.isFinite(date.getTime()) && date >= start && date <= end;
  });
}

async function getSupabase(startDate: string, endDate: string) {
  const [supabaseUrlRaw, serviceRoleKey, schemaRaw] = await Promise.all([
    getVariable(`${BASE}/supabase_url`),
    getVariable(`${BASE}/supabase_service_role_key`),
    getVariable(`${BASE}/supabase_schema`).catch(() => "analytics"),
  ]);
  if (!supabaseUrlRaw || !serviceRoleKey) throw new Error("Supabase variables are not configured.");
  const baseUrl = supabaseUrlRaw.replace(/\/+$/, "");
  const schema = schemaRaw || "analytics";
  const headers = {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    "accept-profile": schema,
  };

  const [signals, slides, faqs, questions, hotLeads, invites, subscribeLeads] = await Promise.all([
    fetchSupabaseRows(baseUrl, headers, "beforest_session_signals", "session_id,event_type,event_name,slide_id,slide_label,visual_id,invite_id,campaign,invite_source,lead_score_delta,lead_temperature,occurred_at,payload"),
    fetchSupabaseRows(baseUrl, headers, "beforest_slide_metrics", "session_id,slide_id,slide_label,visual_id,invite_id,campaign,invite_source,duration_ms,max_elapsed_seconds,completed,exit_reason,occurred_at"),
    fetchSupabaseRows(baseUrl, headers, "beforest_faq_metrics", "session_id,faq_id,question,action,duration_ms,completed,occurred_at"),
    fetchSupabaseRows(baseUrl, headers, "beforest_questions", "session_id,listener_name,invite_id,invitee_name,invitee_email,invitee_phone,campaign,invite_source,source,question,answer,occurred_at"),
    fetchSupabaseRows(baseUrl, headers, "beforest_hot_leads_v", "session_id,invite_id,listener_name,invitee_name,invitee_email,invitee_phone,campaign,invite_source,first_seen_at,last_seen_at,lead_score,questions_asked,faqs_opened,faqs_completed,clicked_trial_stay,subscribed_for_updates,next_30_days,reasons,lead_temperature"),
    fetchSupabaseRows(baseUrl, headers, "beforest_invites", "id,invitee_name,invitee_email,invitee_phone,campaign,source,max_uses,used_count,expires_at,last_used_at,disabled_at,created_at"),
    fetchSupabaseRows(baseUrl, headers, "beforest_subscribe_leads", "name,email,phone,interest,timing,first_update,source,invite_id,invitee_name,invitee_email,invitee_phone,campaign,captured_at"),
  ]);
  const rangeStart = dateStart(startDate);
  const rangeEnd = dateEnd(endDate);
  const rangeSignals = signals.filter((row) => inRange(row, rangeStart, rangeEnd, ["occurred_at"]));
  const rangeSlides = slides.filter((row) => inRange(row, rangeStart, rangeEnd, ["occurred_at"]));
  const rangeFaqs = faqs.filter((row) => inRange(row, rangeStart, rangeEnd, ["occurred_at"]));
  const rangeQuestions = questions.filter((row) => inRange(row, rangeStart, rangeEnd, ["occurred_at"]));
  const rangeHotLeads = hotLeads.filter((row) => inRange(row, rangeStart, rangeEnd, ["last_seen_at", "first_seen_at"]));
  const rangeInvites = invites.filter((row) => anyInRange(row, rangeStart, rangeEnd, ["last_used_at", "created_at"]));
  const rangeSubscribeLeads = subscribeLeads.filter((row) => inRange(row, rangeStart, rangeEnd, ["captured_at"]));

  const testSessions = new Set([
    ...rangeSignals.filter(isTestRow).map((row) => row.session_id),
    ...rangeHotLeads.filter(isTestRow).map((row) => row.session_id),
    ...rangeQuestions.filter(isTestRow).map((row) => row.session_id),
  ].filter(Boolean));
  const productionOnly = (row: Row) => !testSessions.has(row.session_id) && !isTestRow(row);
  const cleanSignals = rangeSignals.filter(productionOnly);
  const cleanSlides = rangeSlides.filter(productionOnly);
  const cleanFaqs = rangeFaqs.filter(productionOnly);
  const cleanQuestions = rangeQuestions.filter(productionOnly);
  const cleanHotLeads = rangeHotLeads.filter(productionOnly);
  const cleanSubscribeLeads = rangeSubscribeLeads.filter((row) => !String(row.campaign || "").includes("local-smoke-test"));

  const sessions = unique(cleanSignals, "session_id");
  const started = sessionsWith(cleanSignals, "presentation_started");
  const completed = sessionsWith(cleanSignals, "presentation_completed");
  const allSlidesCompleted = new Set(
    [...sessions].filter((sessionId) => cleanSlides.filter((row) => row.session_id === sessionId && row.completed).length >= 8),
  );
  const intent = new Set([...sessionsWith(cleanSignals, "ask_question_clicked"), ...sessionsWith(cleanSignals, "faq_opened")]);
  const trialOrSubscribe = new Set([...sessionsWith(cleanSignals, "trial_stay_clicked"), ...sessionsWith(cleanSignals, "subscribe_lead_completed")]);
  const hot = new Set(cleanHotLeads.filter((row) => row.lead_temperature === "hot").map((row) => row.session_id).filter(Boolean));
  const nestedStarted = new Set([...sessions].filter((sessionId) => started.has(sessionId)));
  const nestedCompleted = new Set([...nestedStarted].filter((sessionId) => completed.has(sessionId)));
  const nestedAllSections = new Set([...nestedCompleted].filter((sessionId) => allSlidesCompleted.has(sessionId)));
  const nestedTrialOrSubscribe = new Set([...nestedAllSections].filter((sessionId) => trialOrSubscribe.has(sessionId)));

  const funnel = [
    { stage: "Tracked sessions", count: sessions.size, rate: 100 },
    { stage: "Invite attributed", count: unique(cleanSignals.filter((row) => row.invite_id), "session_id").size, rate: pct(unique(cleanSignals.filter((row) => row.invite_id), "session_id").size, sessions.size) },
    { stage: "Unlocked", count: sessionsWith(cleanSignals, "presentation_unlocked").size, rate: pct(sessionsWith(cleanSignals, "presentation_unlocked").size, sessions.size) },
    { stage: "Started", count: started.size, rate: pct(started.size, sessions.size) },
    { stage: "Completed", count: completed.size, rate: pct(completed.size, started.size) },
    { stage: "All 8 sections", count: allSlidesCompleted.size, rate: pct(allSlidesCompleted.size, started.size) },
    { stage: "Question / FAQ intent", count: intent.size, rate: pct(intent.size, sessions.size) },
    { stage: "Trial / subscribe", count: trialOrSubscribe.size, rate: pct(trialOrSubscribe.size, sessions.size) },
    { stage: "Hot leads", count: hot.size, rate: pct(hot.size, sessions.size) },
  ];

  const strictFunnel = [
    { stage: "Tracked sessions", count: sessions.size, rate: 100 },
    { stage: "Started", count: nestedStarted.size, rate: pct(nestedStarted.size, sessions.size) },
    { stage: "Completed", count: nestedCompleted.size, rate: pct(nestedCompleted.size, Math.max(1, nestedStarted.size)) },
    { stage: "All 8 sections", count: nestedAllSections.size, rate: pct(nestedAllSections.size, Math.max(1, nestedCompleted.size)) },
    { stage: "Trial / subscribe", count: nestedTrialOrSubscribe.size, rate: pct(nestedTrialOrSubscribe.size, Math.max(1, nestedAllSections.size)) },
  ];

  const leadSignals = [
    { stage: "Invite attributed", count: unique(cleanSignals.filter((row) => row.invite_id), "session_id").size, rate: pct(unique(cleanSignals.filter((row) => row.invite_id), "session_id").size, sessions.size) },
    { stage: "Unlocked", count: sessionsWith(cleanSignals, "presentation_unlocked").size, rate: pct(sessionsWith(cleanSignals, "presentation_unlocked").size, sessions.size) },
    { stage: "Question / FAQ intent", count: intent.size, rate: pct(intent.size, sessions.size) },
    { stage: "Hot leads", count: hot.size, rate: pct(hot.size, sessions.size) },
  ];

  const slideRows = countBy(cleanSlides, "slide_label").map((item) => {
    const rows = cleanSlides.filter((row) => (row.slide_label || "(blank)") === item.label);
    return {
      slide_label: item.label,
      rows: item.count,
      completed: rows.filter((row) => row.completed).length,
      avg_duration_ms: Math.round(avg(rows.map((row) => row.duration_ms))),
      p90_duration_ms: Math.round(percentile(rows.map((row) => row.duration_ms), 0.9)),
    };
  });

  return {
    schema,
    date_range: { start_date: startDate, end_date: endDate },
    summary: {
      tracked_sessions: sessions.size,
      presentation_started_sessions: started.size,
      presentation_completed_sessions: completed.size,
      completion_rate_started: pct(completed.size, started.size),
      question_sessions: unique(cleanQuestions, "session_id").size,
      faq_open_sessions: sessionsWith(cleanSignals, "faq_opened").size,
      trial_stay_click_sessions: sessionsWith(cleanSignals, "trial_stay_clicked").size,
      subscribe_completed_sessions: sessionsWith(cleanSignals, "subscribe_lead_completed").size,
      hot_leads: cleanHotLeads.filter((row) => row.lead_temperature === "hot").length,
      warm_leads: cleanHotLeads.filter((row) => row.lead_temperature === "warm").length,
      nurture_leads: cleanHotLeads.filter((row) => row.lead_temperature === "nurture").length,
      avg_lead_score: Number(avg(cleanHotLeads.map((row) => row.lead_score)).toFixed(1)),
      live_failure_sessions: sessionsWith(cleanSignals, "live_failure").size,
      excluded_test_sessions: testSessions.size,
    },
    funnel,
    strict_funnel: strictFunnel,
    lead_signals: leadSignals,
    events: countBy(cleanSignals, "event_name"),
    campaigns: countBy(cleanSignals, "campaign"),
    invite_sources: countBy(cleanSignals, "invite_source"),
    lead_temperatures: countBy(cleanHotLeads, "lead_temperature"),
    slides: slideRows,
    faq: {
      rows: cleanFaqs.length,
      actions: countBy(cleanFaqs, "action"),
      by_faq: countBy(cleanFaqs, "faq_id"),
    },
    questions: cleanQuestions.slice(-50).reverse(),
    hot_leads: cleanHotLeads.sort((a, b) => Number(b.lead_score || 0) - Number(a.lead_score || 0)),
    invites: rangeInvites.sort((a, b) => Number(b.used_count || 0) - Number(a.used_count || 0)),
    subscribe_leads: cleanSubscribeLeads,
  };
}

export async function main(start_date = "90daysAgo", end_date = "today", dashboard_passcode = "") {
  const startedAt = new Date().toISOString();
  await requireDashboardPasscode(dashboard_passcode);
  const [ga4, supabase] = await Promise.all([getGa4(start_date, end_date), getSupabase(start_date, end_date)]);
  return {
    ok: true,
    generated_at: new Date().toISOString(),
    started_at: startedAt,
    page: {
      title: PAGE_TITLE,
      host: PAGE_HOST,
    },
    ga4,
    supabase,
  };
}
