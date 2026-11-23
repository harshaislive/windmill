// Hammiyala guided page (collectives.ops.beforest.co/hammiyala-guide/) -> Sprint master sheet.
// The page asks its own questions instead of a Typeform (Harsha, 2026-11-17). This route:
//   1. checks the request comes from the guided page and looks like a person (fields, consent, honeypot, time on page, rate),
//   2. saves the application in the datatable FIRST (guide_applications), so nothing is lost if a later step fails,
//   3. hands it to master_sheet_upsert exactly like a Typeform lead (same tab, same dedupe, same WhatsApp #1 / Email #1 and Zoho sync),
//   4. sends an alert email if step 3 fails (the saved row can be replayed with replay_id).
// Source is recorded as "Typeform" with form_id "web-hammiyala-guide" so every downstream job treats it like a form lead;
// form_name says it came from the website. Jobs that re-read Typeform's API (About-them fields, fit label, ad source,
// funnel fill counts) will not find these leads there: known gap, see the vault note "Hammiyala Guided Flow".
// Alert recipient: Windmill variable f/sales_tracker/guide_alert_to (falls back to the community inbox).
import * as wmill from "windmill-client";
import nodemailer from "nodemailer";
import { main as upsert } from "./master_sheet_upsert";

const ALLOWED_ORIGINS = new Set(["https://collectives.ops.beforest.co", "https://www.collectives.ops.beforest.co"]);
const FORM_ID = "web-hammiyala-guide";
const FORM_NAME = "Hammiyala guided page (website, no Typeform)";
const SENDER = "community@beforest.co";

type Body = {
  collective?: string; first_name?: string; last_name?: string; phone?: string; email?: string; city?: string;
  why?: string; consent?: boolean; website?: string; seconds_on_page?: number;
  answers?: { key: string; field_id?: string; question: string; answer: string; choice_id?: string }[];
  hidden?: Record<string, string>;
};

const s = (v: unknown, max = 300) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
const digits = (v: string) => v.replace(/\D/g, "");

export function validate(b: Body): string[] {
  const errs: string[] = [];
  if (s(b.collective).toLowerCase() !== "hammiyala") errs.push("collective");
  if (s(b.first_name).length < 1) errs.push("first_name");
  const d = digits(s(b.phone, 40));
  if (d.length < 10 || d.length > 15) errs.push("phone");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s(b.email, 200))) errs.push("email");
  if (b.consent !== true) errs.push("consent");
  if (s(b.website)) errs.push("honeypot");
  if (!(Number(b.seconds_on_page) >= 20)) errs.push("too_fast");
  if (!Array.isArray(b.answers) || b.answers.length < 5) errs.push("answers");
  return errs;
}

async function ensureTable() {
  const sql = wmill.datatable("main");
  await sql`CREATE TABLE IF NOT EXISTS guide_applications (
    id bigserial PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(), collective text, response_id text UNIQUE,
    phone10 text, email text, ip text, user_agent text, body jsonb, status text, result jsonb)`.execute();
  return sql;
}

async function alert(subject: string, text: string) {
  try {
    const to = String(await wmill.getVariable("f/sales_tracker/guide_alert_to").catch(() => "") || SENDER);
    const pass = await wmill.getVariable("f/old_leads_churn/community_gmail_app_password");
    const smtp = nodemailer.createTransport({ host: "smtp.gmail.com", port: 587, secure: false, requireTLS: true, auth: { user: SENDER, pass } });
    await smtp.sendMail({ from: `Beforest Sprint <${SENDER}>`, to, subject, text });
  } catch { /* alert is best-effort */ }
}

export async function preprocessor(event: any) {
  const h: Record<string, string> = {};
  for (const [k, v] of Object.entries(event?.headers ?? {})) h[k.toLowerCase()] = String(v);
  let body: any = event?.raw_string ?? event?.body ?? {};
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const ip = (h["x-forwarded-for"] || h["x-real-ip"] || "").split(",")[0].trim();
  return { body, request_origin: h.origin || "", client_ip: ip.slice(0, 64), client_ua: s(h["user-agent"], 512), dry_run: false };
}

export async function main(body: Body, request_origin = "", client_ip = "", client_ua = "", dry_run = false, replay_id = 0) {
  const sql = await ensureTable();
  if (replay_id) {   // re-send a saved application to the sheet after a failure
    const row = await sql`SELECT body FROM guide_applications WHERE id = ${replay_id}`.fetchOne();
    if (!row) throw new Error(`No guide application ${replay_id}`);
    body = row.body as Body;
  } else {
    if (!ALLOWED_ORIGINS.has(request_origin) && !dry_run) return { status: "rejected", reason: "origin" };
    const errs = validate(body);
    if (errs.length) return { status: "rejected", reason: errs.join(",") };
    if (client_ip) {
      const r = await sql`SELECT COUNT(*)::int AS n FROM guide_applications WHERE ip = ${client_ip} AND created_at > now() - interval '10 minutes'`.fetchOne();
      if (Number(r?.n) >= 5) return { status: "rejected", reason: "rate" };
    }
  }

  const phone = s(body.phone, 40), email = s(body.email, 200).toLowerCase();
  const responseId = `web-${Date.now().toString(36)}-${digits(phone).slice(-4)}${Math.random().toString(36).slice(2, 6)}`;
  let savedId = replay_id;
  if (!replay_id && !dry_run) {
    try {
      const ins = await sql`INSERT INTO guide_applications (collective, response_id, phone10, email, ip, user_agent, body, status)
        VALUES ('Hammiyala', ${responseId}, ${digits(phone).slice(-10)}, ${email}, ${client_ip}, ${client_ua}, ${JSON.stringify(body)}::jsonb, 'received')
        RETURNING id`.fetchOne();
      savedId = Number(ins?.id);
    } catch (e: any) {   // never let the backup copy stop the lead reaching the sheet
      await alert("Hammiyala guide: backup copy failed", `Could not save the application in guide_applications (${String(e?.message ?? e)}). Sending it to the sheet anyway.\n\nPhone: ${phone}\nEmail: ${email}`);
    }
  }

  const qa = [
    ...(body.answers ?? []).map((a) => ({ question: s(a.question, 300), answer: s(a.answer, 500) })),
    { question: "Which city do you currently live in?", answer: s(body.city, 120) },
    { question: "Why is joining this collective important to you?", answer: s(body.why, 2000) },
    { question: "Consent to be contacted (Privacy Policy, Terms & Conditions)", answer: "I agree" },
  ].filter((x) => x.answer);
  const lead = {
    source: "Typeform" as const, collective: "Hammiyala", response_id: responseId, form_id: FORM_ID, form_name: FORM_NAME,
    submitted_at: new Date().toISOString(), first_name: s(body.first_name, 80), last_name: s(body.last_name, 80),
    phone, email, current_city: s(body.city, 120), consent: "I agree", qa,
    // Typeform field id / ref / choice id kept, so jobs that map Typeform answers can read these too.
    answers_json: (body.answers ?? []).map((a: any) => ({ id: s(a.field_id || a.key, 60), ref: s(a.key, 60), type: a.choice_id ? "choice" : "text", answer: s(a.answer, 2000), choice_id: s(a.choice_id, 40) })),
    hidden_json: Object.fromEntries(Object.entries(body.hidden ?? {}).map(([k, v]) => [s(k, 40), s(v, 600)])),
  };

  try {
    const result = await upsert(lead as any, dry_run);
    if (savedId) await sql`UPDATE guide_applications SET status = 'in_sheet', result = ${JSON.stringify(result)}::jsonb WHERE id = ${savedId}`.execute();
    return { status: dry_run ? "dry_run" : "ok", saved_id: savedId || null, result };
  } catch (e: any) {
    if (savedId) await sql`UPDATE guide_applications SET status = 'sheet_failed', result = ${JSON.stringify({ error: String(e?.message ?? e) })}::jsonb WHERE id = ${savedId}`.execute();
    await alert(`Hammiyala guide: application ${savedId} not in the sheet`,
      `An application from the Hammiyala guided page was saved (guide_applications id ${savedId}) but could not be added to the sheet.\n\n` +
      `Name: ${lead.first_name} ${lead.last_name}\nPhone: ${phone}\nEmail: ${email}\n\nError: ${String(e?.message ?? e)}\n\n` +
      `Replay: run f/sales_tracker/guide_application with replay_id = ${savedId}.`);
    return { status: "saved_sheet_failed", saved_id: savedId };
  }
}
