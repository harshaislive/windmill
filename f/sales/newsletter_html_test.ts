import * as wmill from "windmill-client";

type Newsletter = { name: string; html: string };

async function request(config: any, method: string, path: string, body?: unknown) {
  const response = await fetch(`https://${config.server}.api.mailchimp.com/3.0/${path}`, {
    method,
    headers: { Authorization: `Basic ${btoa(`any:${config.api_key}`)}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Mailchimp ${method} ${path} failed: ${response.status} ${JSON.stringify(payload).slice(0, 1000)}`);
  return payload;
}

export async function main(recipient: string, newsletters: Newsletter[]) {
  if (!/^\S+@\S+\.\S+$/.test(recipient)) throw new Error("Invalid recipient email");
  const config = await wmill.getResource("f/sales/mailchimp_fallback");
  const listId = await wmill.getVariable("f/sales/mailchimp_fallback/audience_id");
  const results = [];
  for (const newsletter of newsletters) {
    const campaign = await request(config, "POST", "campaigns", { type: "regular", recipients: { list_id: listId }, settings: { subject_line: `HTML test - ${newsletter.name}`, title: `HTML test - ${newsletter.name}`, from_name: "Team Beforest", reply_to: recipient } });
    await request(config, "PUT", `campaigns/${campaign.id}/content`, { html: newsletter.html });
    await request(config, "POST", `campaigns/${campaign.id}/actions/test`, { test_emails: [recipient], send_type: "html" });
    results.push({ name: newsletter.name, campaign_id: campaign.id, test_recipient: recipient, status: "accepted" });
  }
  return { results, audience_send_triggered: false };
}
