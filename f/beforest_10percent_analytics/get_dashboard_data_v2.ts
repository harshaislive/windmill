const BASE = "f/beforest_10percent_analytics";
const PAGE_TITLE = "Beforest 10% Life | Guided Access to Rewilded Landscapes";
const PAGE_HOST = "live.10percent.beforest.co";

type Row = Record<string, any>;

function apiBaseUrl(): string {
  const base = (process.env.BASE_INTERNAL_URL || process.env.BASE_URL || "").replace(/\/+$/, "");
  if (!base) throw new Error("BASE_INTERNAL_URL or BASE_URL is required.");
  return base.endsWith("/api") ? base : `${base}/api`;
}

function workspaceId(): string {
  return process.env.WM_WORKSPACE || process.env.WORKSPACE || process.env.WM_WORKSPACE_ID || "beforest-automations";
}

async function getVariable(path: string): Promise<string> {
  const token = process.env.WM_TOKEN;
  if (!token) throw new Error("WM_TOKEN is required.");
  const encoded = encodeURIComponent(path);
  const urls = [
    `${apiBaseUrl()}/w/${workspaceId()}/variables/get_value/${encoded}`,
    `${apiBaseUrl()}/w/${workspaceId()}/variables/get/${encoded}?decrypt_secret=true`,
  ];
  let last = "";
  for (const url of urls) {
    const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    const text = await response.text();
    if (response.ok) {
      try {
        const parsed = JSON.parse(text);
        return typeof parsed === "string" ? parsed : String(parsed?.value ?? "");
      } catch {
        return text;
      }
    }
    last = `${response.status} ${text}`;
  }
  throw new Error(`Failed to read Windmill variable ${path}: ${last}`);
}

async function optionalVariable(path: string, fallback = ""): Promise<string> {
  return getVariable(path).catch(() => fallback);
}

async function requireDashboardPasscode(input: string): Promise<void> {
  const configured = (await getVariable(`${BASE}/dashboard_passcode`)).trim();
  if (!configured) throw new Error("Dashboard passcode is not configured.");
  if (input.trim() !== configured) throw new Error("Invalid dashboard passcode.");
}

function base64Url(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem.replace("-----BEGIN PRIVATE KEY-----", "").replace("-----END PRIVATE KEY-----", "").replace(/\s/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function googleToken(serviceAccount: Row): Promise<string> {
  const tokenUri = serviceAccount.token_uri || "https://oauth2.googleapis.com/token";
  const now = Math.floor(Date.now() / 1000);
  const body = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    aud: tokenUri,
    exp: now + 3600,
    iat: now,
  };
  const signingInput = `${base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64Url(JSON.stringify(body))}`;
  const key = await crypto.subtle.importKey("pkcs8", pemToArrayBuffer(serviceAccount.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput));
  const assertion = `${signingInput}.${base64Url(new Uint8Array(signature))}`;
  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) throw new Error(`Google OAuth failed: ${payload.error_description || payload.error || response.status}`);
  return payload.access_token;
}

function pageFilter() {
  return {
    andGroup: {
      expressions: [
        { filter: { fieldName: "pageTitle", stringFilter: { matchType: "EXACT", value: PAGE_TITLE } } },
        { filter: { fieldName: "hostName", stringFilter: { matchType: "EXACT", value: PAGE_HOST } } },
      ],
    },
  };
}

async function ga4Report(accessToken: string, propertyId: string, body: Row): Promise<Row[]> {
  const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`GA4 report failed: ${payload.error?.message || response.status}`);
  const dimensions = payload.dimensionHeaders || [];
  const metrics = payload.metricHeaders || [];
  return (payload.rows || []).map((row: Row) => {
    const out: Row = {};
    dimensions.forEach((header: Row, i: number) => out[header.name] = row.dimensionValues?.[i]?.value || "");
    metrics.forEach((header: Row, i: number) => {
      const raw = row.metricValues?.[i]?.value;
      const value = Number(raw);
      out[header.name] = Number.isFinite(value) ? value : raw;
    });
    return out;
  });
}

async function getGa4(startDate: string, endDate: string) {
  const propertyId = (await getVariable(`${BASE}/ga4_property_id`)).replace(/^properties\//, "");
  const account = JSON.parse(await getVariable(`${BASE}/google_service_account_json`));
  const accessToken = await googleToken(account);
  const dateRanges = [{ startDate, endDate }];
  const metrics = (names: string[]) => names.map((name) => ({ name }));
  const [summaryA, summaryB, daily, acquisition, device, geography, events] = await Promise.all([
    ga4Report(accessToken, propertyId, { dateRanges, metrics: metrics(["activeUsers", "newUsers", "totalUsers", "sessions", "engagedSessions", "engagementRate", "bounceRate", "averageSessionDuration", "screenPageViews", "screenPageViewsPerSession"]), dimensionFilter: pageFilter() }),
    ga4Report(accessToken, propertyId, { dateRanges, metrics: metrics(["userEngagementDuration", "eventCount", "eventsPerSession", "keyEvents", "sessionKeyEventRate"]), dimensionFilter: pageFilter() }),
    ga4Report(accessToken, propertyId, { dateRanges, dimensions: [{ name: "date" }], metrics: metrics(["activeUsers", "sessions", "engagedSessions", "screenPageViews", "eventCount", "keyEvents"]), dimensionFilter: pageFilter(), orderBys: [{ dimension: { dimensionName: "date" } }], limit: 100 }),
    ga4Report(accessToken, propertyId, { dateRanges, dimensions: [{ name: "sessionDefaultChannelGroup" }, { name: "sessionSourceMedium" }, { name: "sessionCampaignName" }], metrics: metrics(["activeUsers", "sessions", "engagedSessions", "engagementRate", "screenPageViews", "keyEvents"]), dimensionFilter: pageFilter(), orderBys: [{ metric: { metricName: "sessions" }, desc: true }], limit: 20 }),
    ga4Report(accessToken, propertyId, { dateRanges, dimensions: [{ name: "deviceCategory" }, { name: "browser" }, { name: "operatingSystem" }], metrics: metrics(["activeUsers", "sessions", "engagedSessions", "engagementRate", "screenPageViews"]), dimensionFilter: pageFilter(), orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }], limit: 20 }),
    ga4Report(accessToken, propertyId, { dateRanges, dimensions: [{ name: "country" }, { name: "city" }], metrics: metrics(["activeUsers", "sessions", "engagedSessions", "screenPageViews"]), dimensionFilter: pageFilter(), orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }], limit: 20 }),
    ga4Report(accessToken, propertyId, { dateRanges, dimensions: [{ name: "eventName" }], metrics: metrics(["eventCount", "totalUsers", "keyEvents"]), dimensionFilter: pageFilter(), orderBys: [{ metric: { metricName: "eventCount" }, desc: true }], limit: 40 }),
  ]);
  return {
    property_id: propertyId,
    page_title: PAGE_TITLE,
    host: PAGE_HOST,
    date_range: { start_date: startDate, end_date: endDate },
    summary: { ...(summaryA[0] || {}), ...(summaryB[0] || {}) },
    daily,
    acquisition,
    device,
    geography,
    events,
  };
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
  const date = value === "yesterday" ? new Date() : new Date(`${value}T00:00:00Z`);
  if (value === "yesterday") date.setUTCHours(0, 0, 0, 0);
  else date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function inRange(row: Row, start: Date, end: Date, keys: string[]): boolean {
  const values = keys.map((key) => row[key]).filter(Boolean);
  if (!values.length) return true;
  return values.some((raw) => {
    const date = new Date(String(raw));
    return Number.isFinite(date.getTime()) && date >= start && date <= end;
  });
}

function encodeQuery(params: Row): string {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
}

async function supabaseRows(baseUrl: string, key: string, schema: string, table: string, params: Row): Promise<Row[]> {
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/rest/v1/${table}?${encodeQuery(params)}`, {
    headers: { apikey: key, authorization: `Bearer ${key}`, "accept-profile": schema },
  });
  const payload = await response.json().catch(() => []);
  if (!response.ok) throw new Error(`${schema}.${table} fetch failed: ${payload.message || payload.msg || response.status}`);
  return Array.isArray(payload) ? payload : [];
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

function unique(rows: Row[], key: string): Set<string> {
  return new Set(rows.map((row) => String(row[key] || "")).filter(Boolean));
}

function sessionsWith(rows: Row[], eventName: string): Set<string> {
  return unique(rows.filter((row) => row.event_name === eventName), "session_id");
}

function intersectSets(base: Set<string>, next: Set<string>): Set<string> {
  return new Set([...base].filter((value) => next.has(value)));
}

function pct(numerator: number, denominator: number): number {
  return denominator ? (numerator / denominator) * 100 : 0;
}

function latest(rows: Row[], keys: string[]): string | null {
  let best = 0;
  for (const row of rows) {
    for (const key of keys) {
      if (!row[key]) continue;
      const time = new Date(String(row[key])).getTime();
      if (Number.isFinite(time) && time > best) best = time;
    }
  }
  return best ? new Date(best).toISOString() : null;
}

function avg(values: any[]): number {
  const usable = values.map(Number).filter(Number.isFinite);
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : 0;
}

function percentile(values: any[], p: number): number {
  const usable = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  return usable.length ? usable[Math.min(usable.length - 1, Math.floor((usable.length - 1) * p))] : 0;
}

function normalizeEmail(row: Row): string {
  return String(row.email || row.invitee_email || row.guest_email || "").trim().toLowerCase();
}

function normalizePhone(row: Row): string {
  const phone = String(row.phone || row.invitee_phone || row.guest_phone || row.whatsapp_number || "").replace(/\D/g, "");
  return phone.length >= 10 ? phone.slice(-10) : phone;
}

function normalizeName(row: Row): string {
  return String(row.name || row.guest_name || row.invitee_name || row.listener_name || "").trim().toLowerCase();
}

function isInternalOrQa(row: Row): boolean {
  const email = normalizeEmail(row);
  const phone = normalizePhone(row);
  const name = normalizeName(row);
  return email.endsWith("@beforest.co")
    || email.endsWith("@beforest.com")
    || email.endsWith("@example.com")
    || email === "abc@abc.com"
    || email.endsWith("@rrtt.bbn")
    || email.includes("test")
    || ["8374283166", "9573020839"].includes(phone)
    || phone.endsWith("0000")
    || phone.endsWith("9999")
    || /\b(codex|test|testing|dummy|qa|harsha|seshu|shivathmika|soundharya|sunith|shruti|ajmera|sai\s?rakesh)\b/.test(name)
    || String(row.session_id || "").startsWith("codex-")
    || String(row.campaign || "").includes("local-smoke-test")
    || String(row.invite_source || "") === "codex"
    || String(row.source || "") === "codex_test";
}

function maskEmail(email: string): string {
  if (!email || !email.includes("@")) return email || "";
  const [user, domain] = email.split("@");
  return `${user.slice(0, 2)}***@${domain}`;
}

function maskPhone(phone: string): string {
  const normalized = String(phone || "").replace(/\D/g, "");
  return normalized ? `***${normalized.slice(-4)}` : "";
}

function maskedRow(row: Row): Row {
  return {
    ...row,
    email: maskEmail(row.email),
    phone: maskPhone(row.phone),
    invitee_email: maskEmail(row.invitee_email),
    invitee_phone: maskPhone(row.invitee_phone),
    recipient: row.recipient ? maskPhone(row.recipient) || maskEmail(row.recipient) : undefined,
  };
}

async function getLiveSupabase(startDate: string, endDate: string) {
  const [url, key, schema] = await Promise.all([
    getVariable(`${BASE}/supabase_url`),
    getVariable(`${BASE}/supabase_service_role_key`),
    optionalVariable(`${BASE}/supabase_schema`, "analytics"),
  ]);
  const [signals, slides, faqs, questions, hotLeads, invites, subscribeLeads] = await Promise.all([
    supabaseRows(url, key, schema, "beforest_session_signals", { select: "session_id,event_type,event_name,slide_id,slide_label,invite_id,invitee_name,invitee_email,invitee_phone,campaign,invite_source,lead_temperature,occurred_at", limit: 5000 }),
    supabaseRows(url, key, schema, "beforest_slide_metrics", { select: "session_id,slide_label,invite_id,invitee_name,invitee_email,invitee_phone,campaign,invite_source,duration_ms,completed,occurred_at", limit: 5000 }),
    supabaseRows(url, key, schema, "beforest_faq_metrics", { select: "session_id,faq_id,question,action,duration_ms,completed,occurred_at", limit: 2000 }),
    supabaseRows(url, key, schema, "beforest_questions", { select: "session_id,listener_name,invite_id,invitee_name,invitee_email,invitee_phone,campaign,invite_source,source,question,answer,occurred_at", limit: 1000 }),
    supabaseRows(url, key, schema, "beforest_hot_leads_v", { select: "session_id,invite_id,listener_name,invitee_name,invitee_email,invitee_phone,campaign,invite_source,first_seen_at,last_seen_at,lead_score,questions_asked,faqs_opened,faqs_completed,clicked_trial_stay,subscribed_for_updates,next_30_days,reasons,lead_temperature", limit: 1000 }),
    supabaseRows(url, key, schema, "beforest_invites", { select: "id,invitee_name,invitee_email,invitee_phone,campaign,source,max_uses,used_count,expires_at,last_used_at,disabled_at,created_at", limit: 5000 }),
    supabaseRows(url, key, schema, "beforest_subscribe_leads", { select: "name,email,phone,interest,timing,source,invite_id,invitee_name,invitee_email,invitee_phone,campaign,captured_at", limit: 1000 }),
  ]);
  const start = dateStart(startDate);
  const end = dateEnd(endDate);
  const rangeSignals = signals.filter((row) => inRange(row, start, end, ["occurred_at"]));
  const rangeSlides = slides.filter((row) => inRange(row, start, end, ["occurred_at"]));
  const rangeFaqs = faqs.filter((row) => inRange(row, start, end, ["occurred_at"]));
  const rangeQuestions = questions.filter((row) => inRange(row, start, end, ["occurred_at"]));
  const rangeHotLeads = hotLeads.filter((row) => inRange(row, start, end, ["last_seen_at", "first_seen_at"]));
  const rangeInvites = invites.filter((row) => inRange(row, start, end, ["last_used_at", "created_at"]));
  const rangeSubscribeLeads = subscribeLeads.filter((row) => inRange(row, start, end, ["captured_at"]));
  const testSessions = new Set([...rangeSignals, ...rangeHotLeads, ...rangeQuestions].filter(isInternalOrQa).map((row) => row.session_id).filter(Boolean));
  const keep = (row: Row) => !testSessions.has(row.session_id) && !isInternalOrQa(row);
  const cleanSignals = rangeSignals.filter(keep);
  const cleanSlides = rangeSlides.filter(keep);
  const cleanFaqs = rangeFaqs.filter(keep);
  const cleanQuestions = rangeQuestions.filter(keep);
  const cleanHotLeads = rangeHotLeads.filter(keep);
  const cleanSubscribeLeads = rangeSubscribeLeads.filter((row) => !isInternalOrQa(row));
  const sessions = unique(cleanSignals, "session_id");
  const started = sessionsWith(cleanSignals, "presentation_started");
  const completed = sessionsWith(cleanSignals, "presentation_completed");
  const allSlidesCompleted = new Set([...sessions].filter((sessionId) => cleanSlides.filter((row) => row.session_id === sessionId && row.completed).length >= 8));
  const intent = new Set([...sessionsWith(cleanSignals, "ask_question_clicked"), ...sessionsWith(cleanSignals, "faq_opened")]);
  const trialOrSubscribe = new Set([...sessionsWith(cleanSignals, "trial_stay_clicked"), ...sessionsWith(cleanSignals, "subscribe_lead_completed")]);
  const hot = new Set(cleanHotLeads.filter((row) => row.lead_temperature === "hot").map((row) => row.session_id).filter(Boolean));
  const funnelTracked = sessions;
  const funnelStarted = intersectSets(funnelTracked, started);
  const funnelCompleted = intersectSets(funnelStarted, completed);
  const funnelAllSections = intersectSets(funnelCompleted, allSlidesCompleted);
  const funnelTrialCta = intersectSets(funnelAllSections, trialOrSubscribe);
  const slideRows = countBy(cleanSlides, "slide_label").slice(0, 12).map((item) => {
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
      lead_queue_leads: cleanHotLeads.length,
      hot_leads: cleanHotLeads.filter((row) => row.lead_temperature === "hot").length,
      warm_leads: cleanHotLeads.filter((row) => row.lead_temperature === "warm").length,
      nurture_leads: cleanHotLeads.filter((row) => row.lead_temperature === "nurture").length,
      excluded_test_sessions: testSessions.size,
      excluded_rows: rangeSignals.length - cleanSignals.length,
    },
    funnel: [
      { stage: "Live walkthrough tracked sessions", count: funnelTracked.size, rate: 100 },
      { stage: "Live walkthrough started", count: funnelStarted.size, rate: pct(funnelStarted.size, funnelTracked.size) },
      { stage: "Live walkthrough completed", count: funnelCompleted.size, rate: pct(funnelCompleted.size, funnelStarted.size) },
      { stage: "Live walkthrough all 8 sections", count: funnelAllSections.size, rate: pct(funnelAllSections.size, funnelCompleted.size) },
      { stage: "Live walkthrough completed + CTA / subscribe", count: funnelTrialCta.size, rate: pct(funnelTrialCta.size, funnelAllSections.size) },
    ],
    intent_signals: [
      { label: "Live walkthrough invite attributed", count: unique(cleanSignals.filter((row) => row.invite_id), "session_id").size },
      { label: "Live walkthrough unlocked", count: sessionsWith(cleanSignals, "presentation_unlocked").size },
      { label: "Live walkthrough question / FAQ intent", count: intent.size },
      { label: "Live trial CTA / subscribe", count: trialOrSubscribe.size },
      { label: "Live hot leads", count: hot.size },
    ],
    events: countBy(cleanSignals, "event_name").slice(0, 30),
    campaigns: countBy(cleanSignals, "campaign").slice(0, 20),
    invite_sources: countBy(cleanSignals, "invite_source").slice(0, 20),
    lead_temperatures: countBy(cleanHotLeads, "lead_temperature"),
    slides: slideRows,
    faq: { rows: cleanFaqs.length, actions: countBy(cleanFaqs, "action").slice(0, 20), by_faq: countBy(cleanFaqs, "faq_id").slice(0, 20) },
    questions: cleanQuestions.slice(-20).reverse(),
    hot_leads: cleanHotLeads.sort((a, b) => Number(b.lead_score || 0) - Number(a.lead_score || 0)).slice(0, 100),
    invites: rangeInvites.filter((row) => !isInternalOrQa(row)).sort((a, b) => Number(b.used_count || 0) - Number(a.used_count || 0)).slice(0, 30),
    subscribe_leads: cleanSubscribeLeads.slice(-20).reverse(),
    bridge_rows: cleanHotLeads.map((row) => ({ session_id: row.session_id, email: normalizeEmail(row), phone: normalizePhone(row), lead_temperature: row.lead_temperature })),
    freshness: { signals_latest: latest(cleanSignals, ["occurred_at"]), hot_leads_latest: latest(cleanHotLeads, ["last_seen_at", "first_seen_at"]), invites_latest: latest(rangeInvites, ["last_used_at", "created_at"]) },
  };
}

async function getBooking(startDate: string, endDate: string) {
  const [url, key, schema] = await Promise.all([
    getVariable(`${BASE}/tencent_supabase_url`),
    getVariable(`${BASE}/tencent_supabase_service_role_key`),
    optionalVariable(`${BASE}/tencent_supabase_schema`, "tencent"),
  ]);
  const [requests, events, followups] = await Promise.all([
    supabaseRows(url, key, schema, "trial_requests", { select: "request_id,session_id,name,email,phone,location_slug,check_in_date,check_out_date,duration_nights,guest_count,selected_room_name,payment_status,ezee_booking_status,ezee_reservation_no,checkout_expires_at,payment_amount,payment_currency,payment_link_sent_at,payment_started_at,paid_at,payment_failed_at,ezee_booking_created_at,created_at,updated_at,utm_source,utm_medium,utm_campaign", limit: 10000 }),
    supabaseRows(url, key, schema, "trial_funnel_events", { select: "request_id,session_id,event_name,event_stage,name,email,phone,location_slug,check_in_date,check_out_date,duration_nights,guest_count,amount,currency,utm_source,utm_medium,utm_campaign,created_at", limit: 10000 }),
    supabaseRows(url, key, schema, "trial_followup_messages", { select: "request_id,session_id,channel,trigger_event,template_key,recipient,status,provider,created_at,sent_at,error_message", limit: 5000 }),
  ]);
  const start = dateStart(startDate);
  const end = dateEnd(endDate);
  const rangeRequests = requests.filter((row) => inRange(row, start, end, ["created_at", "updated_at", "paid_at", "payment_started_at", "payment_link_sent_at"]));
  const rangeEvents = events.filter((row) => inRange(row, start, end, ["created_at"]));
  const rangeFollowups = followups.filter((row) => inRange(row, start, end, ["created_at", "sent_at"]));
  const cleanRequests = rangeRequests.filter((row) => !isInternalOrQa(row));
  const cleanEvents = rangeEvents.filter((row) => !isInternalOrQa(row));
  const cleanFollowups = rangeFollowups.filter((row) => !isInternalOrQa(row));
  const sessionByEvent = (name: string) => new Set(cleanEvents.filter((row) => row.event_name === name).map((row) => row.session_id || row.request_id).filter(Boolean));
  const requestIds = (predicate: (row: Row) => boolean) => {
    const ids = new Set<string>();
    for (const row of cleanRequests.filter(predicate)) {
      if (row.session_id) ids.add(String(row.session_id));
      if (row.request_id) ids.add(String(row.request_id));
    }
    return ids;
  };
  const modal = sessionByEvent("trial_modal_opened");
  const dates = sessionByEvent("trial_dates_selected");
  const rooms = sessionByEvent("trial_room_selected");
  const checkoutStarted = new Set([...sessionByEvent("trial_checkout_started"), ...sessionByEvent("trial_checkout_created"), ...sessionByEvent("trial_payment_redirected")]);
  const linkSent = requestIds((row) => ["PAYMENT_LINK_SENT", "PAYMENT_STARTED", "PENDING_PAYMENT", "PAID"].includes(String(row.payment_status)));
  const paid = requestIds((row) => row.paid_at || row.payment_status === "PAID");
  const confirmed = requestIds((row) => row.ezee_booking_status === "CREATED" && row.ezee_reservation_no);
  const funnelModal = modal;
  const funnelDates = intersectSets(funnelModal, dates);
  const funnelRooms = intersectSets(funnelDates, rooms);
  const funnelCheckout = intersectSets(funnelRooms, checkoutStarted);
  const funnelPaymentStarted = intersectSets(funnelCheckout, linkSent);
  const funnelPaid = intersectSets(funnelPaymentStarted, paid);
  const funnelConfirmed = intersectSets(funnelPaid, confirmed);
  const now = new Date();
  const checkoutUnpaid = cleanRequests.filter((row) => ["PENDING_PAYMENT", "PAYMENT_LINK_SENT", "PAYMENT_STARTED"].includes(String(row.payment_status)) && !row.paid_at);
  const expiredUnpaid = checkoutUnpaid.filter((row) => row.checkout_expires_at && new Date(String(row.checkout_expires_at)) < now);
  const paymentFailed = cleanRequests.filter((row) => row.payment_status === "FAILED");
  const ezeePending = cleanRequests.filter((row) => row.payment_status === "PAID" && ["NOT_STARTED", "PENDING"].includes(String(row.ezee_booking_status)));
  const ezeeFailed = cleanRequests.filter((row) => row.ezee_booking_status === "FAILED");
  const hasFollowup = new Set(cleanFollowups.filter((row) => ["QUEUED", "SENT"].includes(String(row.status))).map((row) => row.request_id || row.session_id).filter(Boolean));
  const requestRows = cleanRequests.map((row) => ({ ...row, has_followup: hasFollowup.has(row.request_id) || hasFollowup.has(row.session_id) })).sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  return {
    schema,
    date_range: { start_date: startDate, end_date: endDate },
    summary: {
      trial_requests: cleanRequests.length,
      trial_modal_open_sessions: modal.size,
      dates_selected_sessions: dates.size,
      room_selected_sessions: rooms.size,
      checkout_started_sessions: checkoutStarted.size,
      payment_link_sent_requests: linkSent.size,
      paid_requests: paid.size,
      confirmed_bookings: confirmed.size,
      expired_unpaid_requests: expiredUnpaid.length,
      payment_failed_requests: paymentFailed.length,
      ezee_pending_requests: ezeePending.length,
      ezee_failed_requests: ezeeFailed.length,
      followup_rows: cleanFollowups.length,
      excluded_request_rows: rangeRequests.length - cleanRequests.length,
      excluded_event_rows: rangeEvents.length - cleanEvents.length,
    },
    funnel: [
      { stage: "Booking-site trial modal opened", count: funnelModal.size, rate: 100 },
      { stage: "Booking-site dates selected after modal", count: funnelDates.size, rate: pct(funnelDates.size, funnelModal.size) },
      { stage: "Booking-site room selected after dates", count: funnelRooms.size, rate: pct(funnelRooms.size, funnelDates.size) },
      { stage: "Booking-site checkout started after room", count: funnelCheckout.size, rate: pct(funnelCheckout.size, funnelRooms.size) },
      { stage: "Booking-site payment link/payment started", count: funnelPaymentStarted.size, rate: pct(funnelPaymentStarted.size, funnelCheckout.size) },
      { stage: "Booking-site paid", count: funnelPaid.size, rate: pct(funnelPaid.size, funnelPaymentStarted.size) },
      { stage: "Booking-site eZee confirmed", count: funnelConfirmed.size, rate: pct(funnelConfirmed.size, funnelPaid.size) },
    ],
    dropoffs: [
      { stage: "Booking modal opened, no dates", count: Math.max(0, funnelModal.size - funnelDates.size), action: "Clarify dates and one-day trial possibility" },
      { stage: "Booking dates selected, no room", count: Math.max(0, funnelDates.size - funnelRooms.size), action: "Help choose room/date fit" },
      { stage: "Booking room selected, no checkout", count: Math.max(0, funnelRooms.size - funnelCheckout.size), action: "Nudge checkout start" },
      { stage: "Booking checkout unpaid", count: checkoutUnpaid.length, action: "Payment/restart support" },
      { stage: "Booking checkout expired unpaid", count: expiredUnpaid.length, action: "Restart trial booking" },
      { stage: "Booking payment failed", count: paymentFailed.length, action: "Payment assistance" },
      { stage: "Booking paid, eZee pending", count: ezeePending.length, action: "Internal confirmation watch" },
      { stage: "Booking eZee failed", count: ezeeFailed.length, action: "Internal manual recovery" },
    ],
    payment_statuses: countBy(cleanRequests, "payment_status"),
    ezee_statuses: countBy(cleanRequests, "ezee_booking_status"),
    event_names: countBy(cleanEvents, "event_name").slice(0, 30),
    event_stages: countBy(cleanEvents, "event_stage").slice(0, 30),
    followups: countBy(cleanFollowups, "status"),
    requests: requestRows.slice(0, 40),
    dropoff_requests: requestRows.filter((row) => ["PENDING_PAYMENT", "PAYMENT_LINK_SENT", "PAYMENT_STARTED", "FAILED"].includes(String(row.payment_status)) || String(row.ezee_booking_status) === "FAILED").slice(0, 30),
    bridge_rows: cleanRequests.map((row) => ({ session_id: row.session_id, email: normalizeEmail(row), phone: normalizePhone(row), request_id: row.request_id })),
    freshness: { requests_latest: latest(cleanRequests, ["updated_at", "created_at"]), events_latest: latest(cleanEvents, ["created_at"]), followups_latest: latest(cleanFollowups, ["sent_at", "created_at"]) },
  };
}

function bridge(live: Row, booking: Row) {
  const bookingKeys = new Set<string>();
  for (const row of booking.bridge_rows || []) [row.session_id, row.email, row.phone].filter(Boolean).forEach((key) => bookingKeys.add(String(key)));
  const liveKeys = new Set<string>();
  for (const row of live.bridge_rows || []) [row.session_id, row.email, row.phone].filter(Boolean).forEach((key) => liveKeys.add(String(key)));
  const liveHotRows = (live.bridge_rows || []).filter((row: Row) => row.lead_temperature === "hot");
  const liveLinked = liveHotRows.filter((row: Row) => [row.session_id, row.email, row.phone].filter(Boolean).some((key) => bookingKeys.has(String(key)))).length;
  const bookingLinked = (booking.bridge_rows || []).filter((row: Row) => [row.session_id, row.email, row.phone].filter(Boolean).some((key) => liveKeys.has(String(key)))).length;
  return {
    linked_live_hot_leads_to_booking: liveLinked,
    linked_booking_requests_to_live: bookingLinked,
    unlinked_live_hot_leads: Math.max(0, liveHotRows.length - liveLinked),
    unlinked_booking_requests: Math.max(0, (booking.summary?.trial_requests || 0) - bookingLinked),
  };
}

function publicPayload(source: Row): Row {
  const copy = { ...source };
  delete copy.bridge_rows;
  return copy;
}

export async function main(start_date = "90daysAgo", end_date = "today", dashboard_passcode = "") {
  const startedAt = new Date().toISOString();
  await requireDashboardPasscode(dashboard_passcode);
  const errors: Row[] = [];
  const [ga4, liveResult, bookingResult] = await Promise.allSettled([
    getGa4(start_date, end_date),
    getLiveSupabase(start_date, end_date),
    getBooking(start_date, end_date),
  ]);
  const ga4Data = ga4.status === "fulfilled" ? ga4.value : (errors.push({ source: "ga4", message: ga4.reason?.message || String(ga4.reason) }), { summary: {}, daily: [], acquisition: [], device: [], geography: [], events: [] });
  const live = liveResult.status === "fulfilled" ? liveResult.value : (errors.push({ source: "live_supabase", message: liveResult.reason?.message || String(liveResult.reason) }), { summary: {}, funnel: [], hot_leads: [], events: [], slides: [], freshness: {}, bridge_rows: [] });
  const booking = bookingResult.status === "fulfilled" ? bookingResult.value : (errors.push({ source: "tencent_supabase", message: bookingResult.reason?.message || String(bookingResult.reason) }), { summary: {}, funnel: [], dropoffs: [], requests: [], dropoff_requests: [], freshness: {}, bridge_rows: [] });
  const bridgeStats = bridge(live, booking);
  return {
    ok: errors.length === 0,
    generated_at: new Date().toISOString(),
    started_at: startedAt,
    page: { title: PAGE_TITLE, host: PAGE_HOST },
    errors,
    ga4: ga4Data,
    supabase: publicPayload(live),
    booking: publicPayload(booking),
    full_funnel: {
      live_lane: live.funnel || [],
      booking_lane: booking.funnel || [],
      bridge: bridgeStats,
      combined_kpis: {
        ga4_users: Number(ga4Data.summary?.activeUsers || 0),
        ga4_sessions: Number(ga4Data.summary?.sessions || 0),
        tracked_sessions: Number(live.summary?.tracked_sessions || 0),
        live_trial_clicks: Number(live.summary?.trial_stay_click_sessions || 0),
        hot_leads: Number(live.summary?.hot_leads || 0),
        trial_modal_opens: Number(booking.summary?.trial_modal_open_sessions || 0),
        checkout_started: Number(booking.summary?.checkout_started_sessions || 0),
        paid: Number(booking.summary?.paid_requests || 0),
        confirmed: Number(booking.summary?.confirmed_bookings || 0),
      },
    },
    data_quality: {
      errors,
      freshness: { live: live.freshness || {}, booking: booking.freshness || {} },
      exclusions: {
        live_rows: live.summary?.excluded_rows || 0,
        live_test_sessions: live.summary?.excluded_test_sessions || 0,
        booking_request_rows: booking.summary?.excluded_request_rows || 0,
        booking_event_rows: booking.summary?.excluded_event_rows || 0,
      },
      bridge: bridgeStats,
    },
  };
}
