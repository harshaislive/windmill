import * as wmill from "windmill-client";
import nodemailer from "nodemailer";

// Shared helpers for the Vexa bot console. Running main() creates the datatable
// tables (idempotent) and seeds the calendar allowlist.

export const VEXA_BASE = "https://api.cloud.vexa.ai";
export const VEXA_KEY_PATH = "f/vexa/vexa_api_key";
export const MATON_CALENDAR_BASE = "https://api.maton.ai/google-calendar/calendar/v3/";

// Each calendar is read through one Maton account ("source").
// connection_id: null = Maton's default Google Calendar connection for that key.
// identity: exact email, or "@domain" to accept any account in that domain.
export const SOURCES = [
  { name: "beforest", maton_key_path: "f/old_leads_churn/harsha_maton_api_key", connection_id: "37d24c33-fed0-482c-a4ab-b6153f2ba985", identity: "harsha@beforest.co" },
  { name: "bewild", maton_key_path: "f/vexa/maton_api_key_bewild", connection_id: null, identity: "@bewild.life" },
];
export const INTERNAL_DOMAINS = ["beforest.co", "bewild.life"];

// Access snapshot from data/tracking/calendar_access/2026-10-09 (56 readable).
const BLOCKED: Record<string, string> = {
  "siri@beforest.co": "free_busy_only",
  "bhargav@beforest.co": "not_accessible",
  "rosnasaji@gmail.com": "not_accessible",
  "design@bewild.life": "not_accessible",
  "geetu@bewild.life": "not_accessible",
  "jahnavi@bewild.life": "not_accessible",
  "neelima@bewild.life": "not_accessible",
  "operations@bewild.life": "not_accessible",
  "orders@bewild.life": "not_accessible",
  "shruti@bewild.life": "not_accessible",
  "sindhuja@bewild.life": "not_accessible",
  "sriyani@bewild.life": "not_accessible",
};

const CALENDARS: [string, string][] = [
  ["akshay@beforest.co", "Akshay Kargwal"], ["akthar@beforest.co", "Akthar Ali"],
  ["altamash@beforest.co", "Altamash Mohammad"], ["ankit@beforest.co", "Ankit Poojari"],
  ["aranya@beforest.co", "Aranya Bagchi"], ["bharath@beforest.co", "Bharath Kumar"],
  ["bhargav@beforest.co", "Bhargav Sai"], ["bhargavi@beforest.co", "Bhargavi Gadhiraju"],
  ["bijoy@beforest.co", "Bijoy Khutia"], ["chandra.shaurya@beforest.co", "Shaurya Chandra"],
  ["chandramohan@beforest.co", "Chandramohan Singh"], ["design@bewild.life", "Design (Bewild)"],
  ["dr.purandhar@beforest.co", "Dr. Purandhar E"], ["finance@beforest.co", "Beforest Finance"],
  ["geet@beforest.co", "Geet Rathi"], ["geetu@bewild.life", "Geetu Mohnani"],
  ["human.resources@beforest.co", "Human Resources"], ["hydglamp@beforest.co", "Anderson Bunglow"],
  ["jagadesh@beforest.co", "Jagadesh Dhanavath"], ["jahnavi@bewild.life", "Jahnavi"],
  ["jay@beforest.co", "Jay Soni"], ["jpsrivastava@beforest.co", "JP Srivastava"],
  ["keerthivasan.s@beforest.co", "Keerthivasan S"], ["kuldeep@beforest.co", "Kuldeep Singh"],
  ["likin@beforest.co", "Likin Bopanna"], ["minnabansal@beforest.co", "Minna Bansal"],
  ["narendra@beforest.co", "Narendra Babu"], ["navya.gowda@beforest.co", "Navya Gowda"],
  ["neelima@bewild.life", "Neelima Tiruvidula"], ["nishan.changappa@beforest.co", "Nishan Changappa"],
  ["operations@bewild.life", "Pavan Reddy"], ["orders@bewild.life", "Orders (Bewild)"],
  ["pallab.k@beforest.co", "Pallab Karmakar"], ["pooja@beforest.co", "Pooja Dhulam"],
  ["prabirdas@beforest.co", "Prabir Das"], ["prajith@beforest.co", "Prajith R"],
  ["prathamesh@beforest.co", "Prathamesh P. Shinde"], ["pratheeksha@beforest.co", "Pratheeksha Ravi"],
  ["raja@beforest.co", "Raja K"], ["rajashekhar@beforest.co", "Rajashekhar Reddy"],
  ["rajeshgaikwad@beforest.co", "Rajesh Gaikwad"], ["ravi.umraniya@beforest.co", "Ravi Umraniya"],
  ["rosnasaji@gmail.com", "Rosna Saji"], ["sai@beforest.co", "Sai Rakesh V"],
  ["sairam@beforest.co", "Ram"], ["sanjeevani@beforest.co", "Sanjeevani Reddy Avula"],
  ["santosh@beforest.co", "Santosh A"], ["seshu@beforest.co", "Sesha Sai"],
  ["sharan@beforest.co", "Sharan V"], ["shivathmika.r@beforest.co", "Shivathmika Racharla"],
  ["shruti@bewild.life", "Shruti Ajmera Reddy"], ["sindhuja@bewild.life", "Sindhuja Durishetti"],
  ["siri@beforest.co", "Siri Nallaparaju"], ["sirisha@beforest.co", "Sirisha Indukuri"],
  ["sonu@beforest.co", "Sonu Bhagat"], ["soundharya@beforest.co", "Soundharya Somaraju"],
  ["sreedhar.jasti@beforest.co", "Sreedhar Jasti"], ["sriram@beforest.co", "Sri Ram Naik Korra"],
  ["sriyani@bewild.life", "Sriyani Gone"], ["sunithreddy@beforest.co", "Sunith Reddy"],
  ["tejaswi@beforest.co", "Gunuru Tejaswi Mounika"], ["tushita.varma@beforest.co", "Tushita Varma"],
  ["umesh.nagar@beforest.co", "Umesh Nagar"], ["urja@beforest.co", "Urja Joshi"],
  ["vaishali@beforest.co", "Vaishali Sharma"], ["venkatesh@beforest.co", "U Venkatesh"],
  ["vivekanand@beforest.co", "Vivekanand Sharma"], ["yogesh@beforest.co", "Yogesh Suresh"],
];

export const DEFAULT_SETTINGS: Record<string, string> = {
  auto_dispatch_enabled: "true",
  bot_name: "Beforest Notetaker",
  bot_name_bewild: "Bewild's Notetaker",
  dispatch_lead_minutes: "2",
  late_join_minutes: "15",
  lookahead_hours: "3",
  skip_keyword: "#nobot",
  // Stale-bot watchdog (dispatcher, every 2 min)
  watchdog_enabled: "true",
  silence_after_end_minutes: "10",
  silence_during_minutes: "10",
  hard_cap_after_end_minutes: "30",
  manual_max_minutes: "120",
  leave_alone_seconds: "120",
  // Ops alerts (sent via f/kms SMTP = beforestai@gmail.com)
  alert_email_to: "sriram@beforest.co",
  alert_repeat_hours: "6",
};

export type Sql = ReturnType<typeof wmill.datatable>;

export function db(): Sql {
  return wmill.datatable("main");
}

export async function rows<T = any>(query: any): Promise<T[]> {
  const result = await query.execute();
  return Array.isArray(result) ? result : result?.rows || [];
}

export async function ensureSchema(sql: Sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS vexa_calendars (
      email TEXT PRIMARY KEY,
      display_name TEXT,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      access_status TEXT NOT NULL DEFAULT 'unknown',
      last_scanned_at TIMESTAMPTZ,
      last_scan_ok BOOLEAN,
      last_error TEXT,
      meetings_found INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`.execute();
  await sql`ALTER TABLE vexa_calendars ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'beforest'`.execute();
  await sql`
    CREATE TABLE IF NOT EXISTS vexa_sources (
      name TEXT PRIMARY KEY,
      maton_key_path TEXT NOT NULL,
      connection_id TEXT,
      expected_identity TEXT NOT NULL,
      verified_identity TEXT,
      last_checked_at TIMESTAMPTZ,
      last_status TEXT
    )`.execute();
  await sql`
    CREATE TABLE IF NOT EXISTS vexa_meetings (
      id BIGSERIAL PRIMARY KEY,
      meeting_key TEXT NOT NULL UNIQUE,
      platform TEXT NOT NULL,
      native_meeting_id TEXT NOT NULL,
      meeting_url TEXT NOT NULL,
      title TEXT,
      organizer TEXT,
      start_at TIMESTAMPTZ,
      end_at TIMESTAMPTZ,
      calendars JSONB NOT NULL DEFAULT '[]'::jsonb,
      attendee_count INT NOT NULL DEFAULT 0,
      has_external BOOLEAN NOT NULL DEFAULT FALSE,
      source TEXT NOT NULL DEFAULT 'calendar',
      status TEXT NOT NULL DEFAULT 'pending',
      skip_reason TEXT,
      attempts INT NOT NULL DEFAULT 0,
      last_error TEXT,
      vexa_meeting_id TEXT,
      vexa_platform TEXT,
      vexa_native_id TEXT,
      vexa_status TEXT,
      vexa_response JSONB,
      requested_by TEXT,
      bot_name TEXT,
      dispatched_at TIMESTAMPTZ,
      last_seen_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`.execute();
  await sql`ALTER TABLE vexa_meetings ADD COLUMN IF NOT EXISTS bot_name TEXT`.execute();
  await sql`ALTER TABLE vexa_meetings ADD COLUMN IF NOT EXISTS outcome TEXT`.execute();
  await sql`ALTER TABLE vexa_meetings ADD COLUMN IF NOT EXISTS outcome_detail TEXT`.execute();
  await sql`
    CREATE TABLE IF NOT EXISTS vexa_alerts (
      kind TEXT PRIMARY KEY,
      active_since TIMESTAMPTZ,
      last_sent_at TIMESTAMPTZ,
      last_detail TEXT
    )`.execute();
  await sql`CREATE INDEX IF NOT EXISTS vexa_meetings_status_start_idx ON vexa_meetings (status, start_at)`.execute();
  await sql`CREATE INDEX IF NOT EXISTS vexa_meetings_start_idx ON vexa_meetings (start_at)`.execute();
  await sql`
    CREATE TABLE IF NOT EXISTS vexa_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`.execute();
  await sql`
    CREATE TABLE IF NOT EXISTS vexa_events (
      id BIGSERIAL PRIMARY KEY,
      at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      kind TEXT NOT NULL,
      meeting_key TEXT,
      detail TEXT
    )`.execute();
  await sql`CREATE INDEX IF NOT EXISTS vexa_events_at_idx ON vexa_events (at DESC)`.execute();
}

export async function seedDefaults(sql: Sql) {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await sql`INSERT INTO vexa_settings (key, value) VALUES (${key}, ${value}) ON CONFLICT (key) DO NOTHING`.execute();
  }
  for (const [email, name] of CALENDARS) {
    const access = BLOCKED[email] || "readable";
    const enabled = access === "readable";
    await sql`
      INSERT INTO vexa_calendars (email, display_name, enabled, access_status)
      VALUES (${email}, ${name}, ${enabled}::boolean, ${access})
      ON CONFLICT (email) DO NOTHING`.execute();
  }
  for (const source of SOURCES) {
    await sql`
      INSERT INTO vexa_sources (name, maton_key_path, connection_id, expected_identity)
      VALUES (${source.name}, ${source.maton_key_path}, ${source.connection_id}, ${source.identity})
      ON CONFLICT (name) DO NOTHING`.execute();
  }
  // bewild.life calendars are read through the bewild Maton account. One-way move; never moved back automatically.
  await sql`UPDATE vexa_calendars SET source = 'bewild' WHERE email LIKE '%@bewild.life' AND source = 'beforest'`.execute();
}

export type MatonSource = { name: string; key: string; connection_id: string | null; identity: string };

/**
 * Load a source's Maton key and confirm which Google account it reads as.
 * Returns null (with a reason) when the key isn't configured yet.
 */
export async function resolveSource(sql: Sql, name: string): Promise<{ source: MatonSource | null; reason: string }> {
  const config = SOURCES.find((s) => s.name === name);
  if (!config) return { source: null, reason: `unknown source ${name}` };
  const key = await wmill.getVariable(config.maton_key_path).catch(() => "");
  let status = "";
  let identity = "";
  if (!key) {
    status = `key missing: add secret variable ${config.maton_key_path}`;
  } else {
    const res = await matonCalendarGet({ key, connection_id: config.connection_id }, "calendars/primary", { fields: "id" });
    identity = String(res.data?.id || "").toLowerCase();
    const expected = config.identity.toLowerCase();
    const matches = expected.startsWith("@") ? identity.endsWith(expected) : identity === expected;
    if (res.status !== 200) status = `Maton HTTP ${res.status}: ${JSON.stringify(res.data?.error?.message || res.data?.error || "").slice(0, 160)}`;
    else if (!matches) status = `identity ${identity || "unknown"} does not match ${config.identity}`;
  }
  await sql`
    INSERT INTO vexa_sources (name, maton_key_path, connection_id, expected_identity, verified_identity, last_checked_at, last_status)
    VALUES (${config.name}, ${config.maton_key_path}, ${config.connection_id}, ${config.identity}, ${identity || null}, NOW(), ${status || "ok"})
    ON CONFLICT (name) DO UPDATE SET maton_key_path = EXCLUDED.maton_key_path, connection_id = EXCLUDED.connection_id,
      expected_identity = EXCLUDED.expected_identity, verified_identity = EXCLUDED.verified_identity,
      last_checked_at = NOW(), last_status = EXCLUDED.last_status`.execute();
  if (status) return { source: null, reason: status };
  return { source: { name, key, connection_id: config.connection_id, identity }, reason: "ok" };
}

export async function getSettings(sql: Sql): Promise<Record<string, string>> {
  const list = await rows<{ key: string; value: string }>(sql`SELECT key, value FROM vexa_settings`);
  const settings = { ...DEFAULT_SETTINGS };
  for (const row of list) settings[row.key] = row.value;
  return settings;
}

/** Bewild meetings (bewild.life organizer, or seen only on bewild.life calendars) get the Bewild bot name. */
export function botNameFor(settings: Record<string, string>, organizer: string | null, calendars: string[] | string | null) {
  const org = String(organizer || "").toLowerCase();
  let list: unknown = calendars;
  if (typeof list === "string") { try { list = JSON.parse(list); } catch { list = []; } }
  const cals = (Array.isArray(list) ? list : []).map((c) => String(c).toLowerCase());
  const bewild = org.endsWith("@bewild.life")
    || (!org.endsWith("@beforest.co") && cals.length > 0 && cals.every((c) => c.endsWith("@bewild.life")));
  return bewild ? settings.bot_name_bewild || DEFAULT_SETTINGS.bot_name_bewild : settings.bot_name || DEFAULT_SETTINGS.bot_name;
}

/** Send an ops email from beforestai@gmail.com using the KMS SMTP credentials. */
export async function sendAlertEmail(to: string, subject: string, text: string) {
  const v = (name: string) => wmill.getVariable(`f/kms/${name}`).catch(() => "");
  const [host, portRaw, user, pass, from] = await Promise.all([v("SMTP_HOST"), v("SMTP_PORT"), v("SMTP_USER"), v("SMTP_PASSWORD"), v("SMTP_FROM")]);
  if (!host || !user || !pass) throw new Error("SMTP credentials missing in f/kms");
  const port = Number(portRaw) || 587;
  const transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
  const info = await transporter.sendMail({ from: from || user, to, subject, text });
  return info.messageId as string;
}

/**
 * Raise or clear a named alert. Emails on first detection, repeats every alert_repeat_hours while active,
 * and sends one "resolved" email when cleared. State lives in vexa_alerts so runs don't spam.
 */
export type AlertCopy = {
  subject: string;
  first: (since: string) => string;
  reminder: (since: string) => string;
  resolvedSubject: string;
  resolved: (since: string) => string;
};

/** "Hi Sriram," for one recipient, plain "Hi," for several. */
function greeting(to: string) {
  const list = to.split(",").map((s) => s.trim()).filter(Boolean);
  if (list.length !== 1) return "Hi,";
  const name = list[0].split("@")[0].split(/[._-]/)[0];
  return name ? `Hi ${name[0].toUpperCase()}${name.slice(1)},` : "Hi,";
}

/** "2:15 PM today" / "2:15 PM on 14 Oct" in IST. */
export function friendlyTime(ms: number) {
  const opts = { timeZone: "Asia/Kolkata" } as const;
  const time = new Date(ms).toLocaleTimeString("en-IN", { ...opts, hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase();
  const day = new Date(ms).toLocaleDateString("en-IN", { ...opts, day: "numeric", month: "short" });
  const today = new Date().toLocaleDateString("en-IN", { ...opts, day: "numeric", month: "short" });
  return day === today ? `${time} today` : `${time} on ${day}`;
}

const SIGN_OFF = "\n\nThanks,\nBeforest AI";

export async function setAlert(sql: Sql, settings: Record<string, string>, kind: string, active: boolean, copy: AlertCopy, detail: string) {
  const to = (settings.alert_email_to || "").trim();
  const repeatHours = Number(settings.alert_repeat_hours) || 6;
  const state = (await rows<any>(sql`SELECT * FROM vexa_alerts WHERE kind = ${kind}`))[0];
  const now = Date.now();
  if (active) {
    const since = state?.active_since ? Date.parse(state.active_since) : now;
    const due = !state?.active_since || !state?.last_sent_at || now - Date.parse(state.last_sent_at) >= repeatHours * 3.6e6;
    let sent = false;
    if (due && to) {
      const firstTime = !state?.active_since;
      const message = firstTime ? copy.first(friendlyTime(since)) : copy.reminder(friendlyTime(since));
      const body = `${greeting(to)}\n\n${message}${SIGN_OFF}`;
      try {
        await sendAlertEmail(to, firstTime ? copy.subject : `Reminder: ${copy.subject}`, body);
        sent = true;
      } catch (error) {
        await logEvent(sql, "alert_email_failed", null, `${kind}: ${String((error as Error).message || error)}`);
      }
    }
    await sql`
      INSERT INTO vexa_alerts (kind, active_since, last_sent_at, last_detail)
      VALUES (${kind}, ${new Date(since).toISOString()}::timestamptz, ${sent ? new Date().toISOString() : null}::timestamptz, ${detail})
      ON CONFLICT (kind) DO UPDATE SET
        active_since = COALESCE(vexa_alerts.active_since, EXCLUDED.active_since),
        last_sent_at = COALESCE(EXCLUDED.last_sent_at, vexa_alerts.last_sent_at),
        last_detail = EXCLUDED.last_detail`.execute();
    if (sent) await logEvent(sql, "alert_sent", null, `${kind} -> ${to}`);
    return;
  }
  if (state?.active_since) {
    if (to) {
      await sendAlertEmail(to, copy.resolvedSubject,
        `${greeting(to)}\n\n${copy.resolved(friendlyTime(Date.parse(state.active_since)))}${SIGN_OFF}`)
        .then(() => logEvent(sql, "alert_resolved_sent", null, `${kind} -> ${to}`))
        .catch((error) => logEvent(sql, "alert_email_failed", null, `${kind} resolved: ${String(error?.message || error)}`));
    }
    await sql`UPDATE vexa_alerts SET active_since = NULL, last_sent_at = NULL, last_detail = ${detail} WHERE kind = ${kind}`.execute();
  }
}

export async function logEvent(sql: Sql, kind: string, meetingKey: string | null, detail: string) {
  await sql`INSERT INTO vexa_events (kind, meeting_key, detail) VALUES (${kind}, ${meetingKey}, ${detail.slice(0, 2000)})`.execute();
}

// ---------- Meeting links ----------

export type ParsedLink = { platform: "google_meet" | "zoom" | "teams"; native_meeting_id: string; meeting_url: string };

const LINK_PATTERNS = [
  /https?:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}[^\s"'<>)]*/i,
  /https?:\/\/[\w.-]*zoom\.us\/(?:j|my|w)\/[^\s"'<>)]+/i,
  /https?:\/\/teams\.(?:microsoft|live)\.com\/(?:l\/meetup-join|meet)\/[^\s"'<>)]+/i,
];

export function parseMeetingLink(input: string): ParsedLink | null {
  const raw = (input || "").trim().replace(/&amp;/g, "&");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (host === "meet.google.com") {
    const code = url.pathname.match(/^\/([a-z]{3}-[a-z]{4}-[a-z]{3})/i)?.[1];
    return code ? { platform: "google_meet", native_meeting_id: code.toLowerCase(), meeting_url: `https://meet.google.com/${code.toLowerCase()}` } : null;
  }
  if (host.endsWith("zoom.us")) {
    const id = url.pathname.match(/\/(?:j|w)\/(\d{9,12})/)?.[1];
    return id ? { platform: "zoom", native_meeting_id: id, meeting_url: raw } : null;
  }
  if (host === "teams.microsoft.com" || host === "teams.live.com") {
    const numeric = url.pathname.match(/\/meet\/(\d{10,15})/)?.[1];
    if (numeric) return { platform: "teams", native_meeting_id: numeric, meeting_url: raw };
    const thread = decodeURIComponent(url.pathname).match(/meetup-join\/(19:meeting_[^/@]+@thread\.v2)/)?.[1];
    if (thread) return { platform: "teams", native_meeting_id: thread, meeting_url: raw };
  }
  return null;
}

export function findMeetingLink(event: any): ParsedLink | null {
  const candidates: string[] = [];
  if (event.hangoutLink) candidates.push(event.hangoutLink);
  for (const entry of event.conferenceData?.entryPoints || []) {
    if (entry.entryPointType === "video" && entry.uri) candidates.push(entry.uri);
  }
  for (const text of [event.location, event.description]) {
    if (!text) continue;
    for (const pattern of LINK_PATTERNS) {
      const match = String(text).replace(/&amp;/g, "&").match(pattern);
      if (match) candidates.push(match[0]);
    }
  }
  for (const candidate of candidates) {
    const parsed = parseMeetingLink(candidate);
    if (parsed) return parsed;
  }
  return null;
}

export function meetingKey(link: ParsedLink, startIso: string | null) {
  // Recurring meetings reuse the same link, so the start time is part of the key.
  return `${link.platform}:${link.native_meeting_id}:${startIso ? new Date(startIso).toISOString() : "adhoc"}`;
}

// ---------- External APIs ----------

export async function vexaRequest(method: string, path: string, body?: unknown) {
  const key = await wmill.getVariable(VEXA_KEY_PATH).catch(() => "");
  if (!key) throw new Error(`Vexa API key missing: create secret variable ${VEXA_KEY_PATH}`);
  const response = await fetch(VEXA_BASE + path, {
    method,
    headers: { "X-API-Key": key, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data: any = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // keep text
  }
  return { status: response.status, ok: response.ok, data };
}

/** Raw (binary) GET against Vexa, e.g. audio media. Caller handles the body. */
export async function vexaFetchRaw(path: string, headers: Record<string, string> = {}) {
  const key = await wmill.getVariable(VEXA_KEY_PATH).catch(() => "");
  if (!key) throw new Error(`Vexa API key missing: create secret variable ${VEXA_KEY_PATH}`);
  const url = path.startsWith("http") ? path : VEXA_BASE + path;
  if (!url.startsWith(VEXA_BASE + "/")) throw new Error("refusing to send the Vexa key to another host");
  return await fetch(url, { headers: { "X-API-Key": key, ...headers } });
}

export async function matonCalendarGet(auth: { key: string; connection_id: string | null }, path: string, params: Record<string, string>) {
  const url = MATON_CALENDAR_BASE + path + "?" + new URLSearchParams(params).toString();
  const headers: Record<string, string> = { Authorization: `Bearer ${auth.key}` };
  if (auth.connection_id) headers["Maton-Connection"] = auth.connection_id;
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url, {
      headers,
    });
    if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
      continue;
    }
    const data = await response.json().catch(() => ({}));
    return { status: response.status, data };
  }
  return { status: 0, data: {} };
}

export function vexaErrorText(data: any) {
  if (!data) return "";
  if (typeof data === "string") return data.slice(0, 500);
  return JSON.stringify(data.detail ?? data.error ?? data).slice(0, 500);
}

export async function main() {
  const sql = db();
  await ensureSchema(sql);
  await seedDefaults(sql);
  const calendars = await rows(sql`SELECT access_status, enabled, COUNT(*)::int AS n FROM vexa_calendars GROUP BY 1, 2 ORDER BY 1`);
  const settings = await getSettings(sql);
  return { ok: true, calendars, settings };
}
