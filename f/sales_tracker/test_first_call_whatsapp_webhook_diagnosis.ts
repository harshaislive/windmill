import * as wmill from "windmill-client";

// Preview-only, explicitly authorized single-recipient retry. No prospect schedules.
const BATCH = "first-call-webhook-diagnosis-20261013-8374283166-01";
const RECIPIENTS = ["918374283166"];
const TEMPLATE = "beforest_first_call_01";
const TEMPLATE_ID = "2162634267940311";
const PHONE_ID = "1446727738515570";
const WABA_ID = "1655245455970812";
const FLOW_ID = "29171201925810813";
const BASE = "https://graph.facebook.com/v21.0";
const ENDPOINT = `${BASE}/${PHONE_ID}/messages`;

function payload(recipient: string) {
  return {
    messaging_product: "whatsapp", recipient_type: "individual", to: recipient, type: "template",
    template: { name: TEMPLATE, language: { code: "en_US" }, components: [
      { type: "body", parameters: [{ type: "text", text: "there" }, { type: "text", text: "The Mumbai Collective" }] },
      { type: "button", sub_type: "flow", index: "0", parameters: [
        { type: "action", action: { flow_token: `${BATCH}:${recipient}:${TEMPLATE}` } },
      ] },
    ] },
  };
}

export async function main(execute: boolean = false, approval_batch: string = "", readback_only: boolean = false) {
  const sql = wmill.datatable("main");
  const prefix = `${BATCH}:%`;
  if (readback_only) return { batch: BATCH, readback_only: true, attempts: await sql`
    SELECT * FROM sales_tracker_whatsapp_test_attempts WHERE batch_id LIKE ${prefix} ORDER BY created_at,recipient`.fetch() };
  if (execute && approval_batch !== BATCH) throw new Error("Exact single-recipient batch approval required");
  const token = await wmill.getVariable("f/sales_tracker/whatsapp_desktop_access_token");
  const headers = { Authorization: `Bearer ${token}` };
  const inventoryResponse = await fetch(`${BASE}/${WABA_ID}/message_templates?fields=id,name,status,language,components&limit=100`, { headers, signal: AbortSignal.timeout(30000) });
  if (!inventoryResponse.ok) throw new Error(`Template preflight HTTP ${inventoryResponse.status}`);
  const inventory = await inventoryResponse.json();
  const matches = inventory.data.filter((t: any) => t.name === TEMPLATE && t.language === "en_US");
  const found = matches[0];
  if (matches.length !== 1 || found.id !== TEMPLATE_ID || found.status !== "APPROVED") throw new Error("Exact approved template required");
  const buttons = found.components.find((c: any) => c.type === "BUTTONS")?.buttons;
  if (buttons?.length !== 1 || buttons[0].type !== "FLOW" || buttons[0].flow_id !== FLOW_ID || buttons[0].navigate_screen !== "CALL_PREFERENCE") throw new Error("Unexpected Flow button");
  const flowResponse = await fetch(`${BASE}/${FLOW_ID}?fields=id,status,validation_errors`, { headers, signal: AbortSignal.timeout(30000) });
  if (!flowResponse.ok) throw new Error(`Flow preflight HTTP ${flowResponse.status}`);
  const flow = await flowResponse.json();
  if (flow.id !== FLOW_ID || flow.status !== "PUBLISHED" || flow.validation_errors?.length) throw new Error("Published validated Flow required");
  const requests = RECIPIENTS.map(payload);
  if (!execute) return { dry_run: true, batch: BATCH, endpoint: ENDPOINT, requests, approved_template: true, published_flow: true, messages_sent: 0 };
  const existing = await sql`SELECT batch_id,status,message_id FROM sales_tracker_whatsapp_test_attempts WHERE batch_id LIKE ${prefix}`.fetch();
  if (existing.length) return { batch: BATCH, blocked: "Already attempted; no automatic retry", attempts: existing };

  const results: any[] = [];
  for (const request of requests) {
    const attemptId = `${BATCH}:${request.to}`;
    const jobId = process.env.WM_JOB_ID ?? null;
    const claimed = await sql`INSERT INTO sales_tracker_whatsapp_test_attempts(batch_id,template_name,recipient,status,job_id,request_body)
      VALUES (${attemptId},${TEMPLATE},${request.to},'ATTEMPTING',${jobId},${JSON.stringify(request)}::jsonb)
      ON CONFLICT DO NOTHING RETURNING batch_id`.fetchOne();
    if (!claimed) return { batch: BATCH, halted: true, reason: "Test already claimed; no retry", results };
    const startedAt = new Date().toISOString();
    const start = Date.now();
    const audit: any = { parent_batch: BATCH, attempt_id: attemptId, job_id: jobId, recipient: request.to,
      sender: "918977945351", phone_id: PHONE_ID, waba_id: WABA_ID, template_id: TEMPLATE_ID,
      template_name: TEMPLATE, language: "en_US", variables: ["there", "The Mumbai Collective"],
      flow_id: FLOW_ID, flow_token: `${BATCH}:${request.to}:${TEMPLATE}`, endpoint: ENDPOINT,
      method: "POST", request_started_at_utc: startedAt };
    let response: Response;
    let raw: string;
    try {
      response = await fetch(ENDPOINT, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(request), signal: AbortSignal.timeout(45000) });
      raw = await response.text();
    } catch {
      audit.response_received_at_utc = new Date().toISOString();
      audit.elapsed_ms = Date.now() - start;
      audit.network_outcome_uncertain = true;
      await sql`UPDATE sales_tracker_whatsapp_test_attempts SET status='UNCERTAIN',response_body=${JSON.stringify({ _audit: audit })}::jsonb,updated_at=now() WHERE batch_id=${attemptId} AND template_name=${TEMPLATE}`.execute();
      return { batch: BATCH, halted: true, reason: "Network outcome uncertain; no retry", results, uncertain_recipient: request.to };
    }
    audit.response_received_at_utc = new Date().toISOString();
    audit.elapsed_ms = Date.now() - start;
    audit.http_status = response.status;
    audit.response_headers = Object.fromEntries(["x-fb-request-id", "x-fb-trace-id", "facebook-api-version", "x-app-usage", "x-business-use-case-usage"].map(h => [h, response.headers.get(h)]).filter(([,v]) => v !== null));
    let body: any;
    try { body = JSON.parse(raw); } catch { body = { invalid_json: true, raw_response: raw }; }
    const messageId = body.messages?.[0]?.id ?? null;
    const accepted = response.ok && typeof messageId === "string" && messageId.startsWith("wamid.");
    const status = accepted ? "PROVIDER_ACCEPTED" : response.ok || response.status >= 500 ? "UNCERTAIN" : "REJECTED";
    body._audit = audit;
    // Durable provider response saved before advancing to the next recipient.
    await sql`UPDATE sales_tracker_whatsapp_test_attempts SET status=${status},response_body=${JSON.stringify(body)}::jsonb,message_id=${messageId},updated_at=now() WHERE batch_id=${attemptId} AND template_name=${TEMPLATE}`.execute();
    results.push({ recipient: request.to, status, message_id: messageId, http_status: response.status, error: body.error ?? null, ...audit });
    if (status === "UNCERTAIN" || [401,403].includes(response.status)) return { batch: BATCH, halted: true, reason: "Uncertain or global permission failure; no retry", results };
  }
  return { batch: BATCH, results, accepted_count: results.filter(r => r.status === "PROVIDER_ACCEPTED").length, delivery_verified: false, reply_capture_ready: false, prospect_outreach: false };
}




