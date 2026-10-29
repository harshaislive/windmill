import * as wmill from "windmill-client";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const PHONE = "1446727738515570";
const WABAS = ["1655245455970812", "1440894261469053"];
const reply = (status: number, result: string) => ({ wm_status_code: status,
  wm_content_type: "text/plain", wm_headers: { "Cache-Control": "no-store" }, result });

export async function preprocessor(event: any) {
  const headers: Record<string,string> = {};
  for (const [k,v] of Object.entries(event.headers ?? {})) headers[k.toLowerCase()] = String(v);
  return { input: { query: event.query ?? {}, signature: headers["x-hub-signature-256"] ?? "",
    raw: typeof event.raw_string === "string" ? event.raw_string : typeof event.body === "string" ? event.body : "" } };
}

export async function main(input: {query?: Record<string,string>; signature?: string; raw?: string}) {
  const q = input?.query ?? {};
  if (Object.hasOwn(q, "hub.mode")) {
    const expected = await wmill.getVariable("f/sales_tracker/meta_webhook_verify_token");
    const actual = String(q["hub.verify_token"] ?? "");
    const valid = expected && Buffer.byteLength(actual) === Buffer.byteLength(expected) && timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
    if (q["hub.mode"] !== "subscribe" || !valid || !q["hub.challenge"]) return reply(403, "Forbidden");
    return reply(200, String(q["hub.challenge"]));
  }
  const raw = input?.raw ?? "";
  if (Buffer.byteLength(raw) > 1048576) return reply(413, "Payload too large");
  const signature = input?.signature ?? "";
  if (!/^sha256=[a-f0-9]{64}$/i.test(signature)) return reply(401, "Invalid signature");
  const secret = await wmill.getVariable("f/sales_tracker/meta_webhook_app_secret");
  if (!secret) return reply(503, "Receiver not configured");
  const expected = createHmac("sha256", secret).update(raw).digest();
  if (!timingSafeEqual(Buffer.from(signature.slice(7), "hex"), expected)) return reply(401, "Invalid signature");
  let body: any;
  try { body = JSON.parse(raw); } catch { return reply(400, "Invalid JSON"); }
  if (body.object !== "whatsapp_business_account" || !Array.isArray(body.entry)) return reply(400, "Invalid event");
  const sql = wmill.datatable("main");
  // One durable row per provider event; retries cannot duplicate the event.
  await sql`CREATE TABLE IF NOT EXISTS sales_tracker_meta_whatsapp_events (
    event_key text PRIMARY KEY, waba_id text NOT NULL, phone_id text NOT NULL,
    event_kind text NOT NULL, message_id text, recipient text, provider_status text,
    provider_timestamp text, errors jsonb, flow_token text, payload jsonb NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now(), job_id text
  )`.execute();
  for (const entry of body.entry) {
    if (!WABAS.includes(String(entry.id))) continue;
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (change.field !== "messages" || String(value?.metadata?.phone_number_id) !== PHONE) continue;
      for (const status of value.statuses ?? []) {
        if (typeof status.id !== "string" || typeof status.status !== "string") continue;
        const eventKey = createHash("sha256").update(JSON.stringify([entry.id, PHONE, "status", status.id, status.status, status.timestamp, status.errors ?? null])).digest("hex");
        await sql`INSERT INTO sales_tracker_meta_whatsapp_events
          (event_key,waba_id,phone_id,event_kind,message_id,recipient,provider_status,provider_timestamp,errors,payload,job_id)
          VALUES (${eventKey},${String(entry.id)},${PHONE},'status',${status.id},${status.recipient_id ?? null},${status.status},${status.timestamp ?? null},${JSON.stringify(status.errors ?? null)}::jsonb,${JSON.stringify(status)}::jsonb,${process.env.WM_JOB_ID ?? null})
          ON CONFLICT DO NOTHING`.execute();
      }
      for (const message of value.messages ?? []) {
        if (typeof message.id !== "string") continue;
        let flow: any = null;
        const response = message.interactive?.nfm_reply?.response_json;
        if (typeof response === "string") { try { flow = JSON.parse(response); } catch {} }
        const eventKey = createHash("sha256").update(JSON.stringify([entry.id, PHONE, "inbound", message.id])).digest("hex");
        await sql`INSERT INTO sales_tracker_meta_whatsapp_events
          (event_key,waba_id,phone_id,event_kind,message_id,recipient,provider_timestamp,flow_token,payload,job_id)
          VALUES (${eventKey},${String(entry.id)},${PHONE},'inbound',${message.id},${message.from ?? null},${message.timestamp ?? null},${typeof flow?.flow_token === "string" ? flow.flow_token : null},${JSON.stringify({message,contacts:value.contacts ?? []})}::jsonb,${process.env.WM_JOB_ID ?? null})
          ON CONFLICT DO NOTHING`.execute();
      }
      for (const error of value.errors ?? []) {
        const eventKey = createHash("sha256").update(JSON.stringify([entry.id, PHONE, "error",error])).digest("hex");
        await sql`INSERT INTO sales_tracker_meta_whatsapp_events (event_key,waba_id,phone_id,event_kind,errors,payload,job_id)
          VALUES (${eventKey},${String(entry.id)},${PHONE},'error',${JSON.stringify([error])}::jsonb,${JSON.stringify(error)}::jsonb,${process.env.WM_JOB_ID ?? null}) ON CONFLICT DO NOTHING`.execute();
      }
    }
  }
  // Acknowledge only after durable inserts succeed. SQL failures cause Meta to retry.
  return reply(200, "EVENT_RECEIVED");
}
