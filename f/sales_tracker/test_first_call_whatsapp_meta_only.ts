import * as wmill from "windmill-client";

// One user-authorized test after Harsha reports removing the sender from Zoho CRM. No schedules, prospect lists, CRM writes or Sheet writes.

const PHONE_ID = "1446727738515570";
const WABA_ID = "1655245455970812";
const FLOW_ID = "29171201925810813";
const RECIPIENT = "918374283166";
const BATCH = "first-call-meta-only-test-20261012-01";
const TEMPLATE_IDS = ["2162634267940311"];
const BASE = "https://graph.facebook.com/v21.0";

function payload(step: number) {
  const name = `beforest_first_call_0${step}`;
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: RECIPIENT,
    type: "template",
    template: {
      name,
      language: { code: "en_US" },
      components: [
        { type: "body", parameters: [
          { type: "text", text: "Harsha" },
          { type: "text", text: "The Mumbai Collective" },
        ] },
        { type: "button", sub_type: "flow", index: "0", parameters: [
          { type: "action", action: { flow_token: `${BATCH}:${name}` } },
        ] },
      ],
    },
  };
}

export async function main(execute: boolean = false, approval_batch: string = "") {
  if (execute && approval_batch !== BATCH) throw new Error("Exact test batch approval required");
  const key = await wmill.getVariable("f/sales_tracker/whatsapp_desktop_access_token");
  const headers = { Authorization: `Bearer ${key}` };
  const requests = [1].map(payload);
  const inventoryResponse = await fetch(`${BASE}/${WABA_ID}/message_templates?fields=id,name,status,language,components&limit=100`, { headers, signal: AbortSignal.timeout(30000) });
  if (!inventoryResponse.ok) throw new Error(`Template preflight HTTP ${inventoryResponse.status}`);
  const inventory = await inventoryResponse.json();
  for (const [index, request] of requests.entries()) {
    const matches = inventory.data.filter((t: any) => t.name === request.template.name && t.language === "en_US");
    const found = matches[0];
    if (matches.length !== 1 || found.id !== TEMPLATE_IDS[index] || found.status !== "APPROVED") {
      throw new Error(`Exact approved template required: ${request.template.name}`);
    }
    const buttons = found.components.find((c: any) => c.type === "BUTTONS")?.buttons;
    if (buttons?.length !== 1 || buttons[0].type !== "FLOW" || buttons[0].flow_id !== FLOW_ID || buttons[0].navigate_screen !== "CALL_PREFERENCE") {
      throw new Error(`Unexpected Flow button: ${request.template.name}`);
    }
  }
  const flowResponse = await fetch(`${BASE}/${FLOW_ID}?fields=id,status,validation_errors`, { headers, signal: AbortSignal.timeout(30000) });
  if (!flowResponse.ok) throw new Error(`Flow preflight HTTP ${flowResponse.status}`);
  const flow = await flowResponse.json();
  if (flow.id !== FLOW_ID || flow.status !== "PUBLISHED" || flow.validation_errors?.length) throw new Error("Published validated Flow required");
  if (!execute) return { dry_run: true, batch: BATCH, transport: "direct_graph", endpoint: `${BASE}/${PHONE_ID}/messages`, requests, approved_templates: true, published_flow: true, messages_sent: 0, prospect_outreach: false, reply_capture_ready: false };

  const sql = wmill.datatable("main");
  await sql`CREATE TABLE IF NOT EXISTS sales_tracker_whatsapp_test_attempts (
    batch_id text NOT NULL, template_name text NOT NULL, recipient text NOT NULL,
    status text NOT NULL, job_id text, request_body jsonb NOT NULL,
    response_body jsonb, message_id text, created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (batch_id, template_name)
  )`.execute();
  const existing = await sql`SELECT template_name,status,message_id FROM sales_tracker_whatsapp_test_attempts WHERE batch_id=${BATCH}`.fetch();
  if (existing.length) return { dry_run: false, batch: BATCH, blocked: "This batch was already attempted. No automatic retry.", attempts: existing, messages_sent: 0 };
  const results: any[] = [];
  for (const request of requests) {
    const name = request.template.name;
    const claimed = await sql`INSERT INTO sales_tracker_whatsapp_test_attempts(batch_id,template_name,recipient,status,job_id,request_body)
      VALUES (${BATCH},${name},${RECIPIENT},'ATTEMPTING',${process.env.WM_JOB_ID ?? null},${JSON.stringify(request)}::jsonb)
      ON CONFLICT DO NOTHING RETURNING template_name`.fetchOne();
    if (!claimed) return { batch: BATCH, halted: true, reason: "Another job already claimed this test", results };
    let response: Response;
    try {
      response = await fetch(`${BASE}/${PHONE_ID}/messages`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(request), signal: AbortSignal.timeout(45000),
      });
    } catch {
      await sql`UPDATE sales_tracker_whatsapp_test_attempts SET status='UNCERTAIN',updated_at=now() WHERE batch_id=${BATCH} AND template_name=${name}`.execute();
      return { batch: BATCH, halted: true, reason: "Network outcome uncertain; no retry", results, uncertain_template: name };
    }
    const raw = await response.text();
    let body: any;
    try { body = JSON.parse(raw); } catch { body = { invalid_json: true }; }
    const messageId = body.messages?.[0]?.id;
    const accepted = response.ok && typeof messageId === "string" && messageId.startsWith("wamid.");
    const status = accepted ? "PROVIDER_ACCEPTED" : response.ok || response.status >= 500 ? "UNCERTAIN" : "REJECTED";
    await sql`UPDATE sales_tracker_whatsapp_test_attempts SET status=${status},response_body=${JSON.stringify(body)}::jsonb,message_id=${messageId ?? null},updated_at=now() WHERE batch_id=${BATCH} AND template_name=${name}`.execute();
    results.push({ template: name, status, http_status: response.status, message_id: messageId ?? null, error: body.error ?? null });
    if (!accepted) return { batch: BATCH, recipient: RECIPIENT, halted: true, results, reason: "Unaccepted or uncertain send; no retry" };
  }
  return { batch: BATCH, recipient: RECIPIENT, results, accepted_count: results.length, delivery_verified: false, reply_capture_ready: false, prospect_outreach: false };
}


