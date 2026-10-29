import * as wmill from "windmill-client";

type ClickRow = {
  event_key: string;
  automation_name: string | null;
  flow_name: string | null;
  message_name: string | null;
  button_text: string | null;
  next_step: string | null;
  subscriber_id: string | null;
  contact_id: string | null;
  first_name: string | null;
  last_name: string | null;
  instagram_username: string | null;
  phone: string | null;
  email: string | null;
  follows_your_account: string | null;
  opted_in: string | null;
  click_count: number | null;
  first_received_at_ist: string | null;
  last_received_at_ist: string | null;
  clicked_at: string | null;
  event_type: string | null;
  button_type: string | null;
  destination: string | null;
};

function cleanText(value: unknown, fallback = "-") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function isPlaceholder(value: unknown) {
  const text = String(value ?? "").trim().toLowerCase();
  return (
    !text ||
    text === "first name" ||
    text === "last name" ||
    text === "contact id" ||
    text === "username" ||
    text === "email" ||
    text === "phone" ||
    text.startsWith("{{")
  );
}

function contactName(row: ClickRow) {
  const name = [row.first_name, row.last_name].filter((part) => !isPlaceholder(part)).map((part) => cleanText(part, "")).join(" ").trim();
  if (name) return name;
  return cleanText(row.instagram_username || row.subscriber_id || row.contact_id, "Unknown contact");
}

export async function main() {
  const sql = wmill.datatable();

  await sql`
    ALTER TABLE manychat_button_click_events
      ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'button_click',
      ADD COLUMN IF NOT EXISTS button_type TEXT,
      ADD COLUMN IF NOT EXISTS destination TEXT,
      ADD COLUMN IF NOT EXISTS follows_your_account TEXT,
      ADD COLUMN IF NOT EXISTS opted_in TEXT
  `.execute();

  await sql`
    DELETE FROM manychat_button_click_events
    WHERE subscriber_id IN ('test_manychat_subscriber', 'test_manychat_route')
  `.execute();

  const rows = await sql<ClickRow>`
    SELECT
      event_key,
      automation_name,
      flow_name,
      message_name,
      button_text,
      next_step,
      subscriber_id,
      contact_id,
      first_name,
      last_name,
      instagram_username,
      phone,
      email,
      follows_your_account,
      opted_in,
      click_count,
      first_received_at_ist,
      last_received_at_ist,
      clicked_at,
      event_type,
      button_type,
      destination
    FROM manychat_button_click_events
    ORDER BY COALESCE(last_received_at_ist, first_received_at_ist) DESC
    LIMIT 2000
  `.fetch();

  const normalized = rows.map((row) => ({
    ...row,
    click_count: Number(row.click_count || 0),
    contact_name: contactName(row),
    contact_key: cleanText(row.subscriber_id || row.contact_id || row.instagram_username || row.email, row.event_key),
    message_name: cleanText(row.message_name),
    button_text: cleanText(row.button_text),
    next_step: cleanText(row.next_step),
    automation_name: cleanText(row.automation_name, "#0_New_Followers DM"),
    last_seen_at: row.last_received_at_ist || row.first_received_at_ist || row.clicked_at || "",
  }));

  return {
    generated_at_ist: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
    rows: normalized,
  };
}
