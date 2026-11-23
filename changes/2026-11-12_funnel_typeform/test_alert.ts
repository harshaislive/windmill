import * as wmill from "windmill-client";
const GMAIL = "e207a7ce-bbc2-4ace-ac6a-b27e45c326dd"; // harsha@beforest.co (Maton)
const HARSHA = "harsha@beforest.co";
const LABEL: Record<string, string> = { meta: "Meta ads", linkedin: "LinkedIn ads", ga: "Google Analytics", leads: "Leads (Zoho + sheets)", typeform: "Typeform" };
async function alertEmail(subject: string, lines: string[]) {
  const key = String(await wmill.getVariable("f/old_leads_churn/harsha_maton_api_key"));
  const mime = [`From: ${HARSHA}`, `To: ${HARSHA}`, `Subject: ${subject}`, "Content-Type: text/plain; charset=UTF-8", "", ...lines].join("\r\n");
  const r = await fetch("https://api.maton.ai/google-mail/gmail/v1/users/me/messages/send", { method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Maton-Connection": GMAIL, "Content-Type": "application/json" }, body: JSON.stringify({ raw: Buffer.from(mime).toString("base64url") }) });
  if (!r.ok) throw new Error("alert email " + r.status);
}

export async function main() {
  await alertEmail("TEST - Collective funnel alert (no action needed)", ["This is a one-off test of the new refresh-failure alert for the collective funnel.",
    "Real alerts: a source failing 2 runs in a row (30 min), repeated at most every 6 h, plus one 'refreshing again' email.", "Script: f/sales_tracker/collective_funnel_refresh"]);
  return "sent";
}
