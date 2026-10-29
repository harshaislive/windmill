import * as wmill from "windmill-client";

type ManyChatClickPayload = {
  event_id?: string;
  automation_name?: string;
  flow_name?: string;
  message_name?: string;
  button_text?: string;
  next_step?: string;
  event_type?: string;
  button_type?: string;
  destination?: string;
  subscriber_id?: string;
  contact_id?: string;
  first_name?: string;
  last_name?: string;
  instagram_username?: string;
  phone?: string;
  email?: string;
  follows_your_account?: string;
  opted_in?: string;
  clicked_at?: string;
  [key: string]: unknown;
};

type CaptureResult = {
  ok: boolean;
  event_key: string;
  inserted_or_updated: boolean;
  automation_name: string;
  message_name: string;
  button_text: string;
  next_step: string;
  event_type: string;
};

function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

async function sha256(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function clickedAtIso(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

async function ensureTable() {
  const sql = wmill.datatable("main");

  await sql`
    CREATE TABLE IF NOT EXISTS manychat_button_click_events (
      event_key TEXT PRIMARY KEY,
      first_received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      first_received_at_ist TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'Asia/Kolkata'),
      last_received_at_ist TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'Asia/Kolkata'),
      click_count INTEGER NOT NULL DEFAULT 1,
      automation_name TEXT,
      flow_name TEXT,
      message_name TEXT,
      button_text TEXT,
      next_step TEXT,
      event_type TEXT NOT NULL DEFAULT 'button_click',
      button_type TEXT,
      destination TEXT,
      subscriber_id TEXT,
      contact_id TEXT,
      first_name TEXT,
      last_name TEXT,
      instagram_username TEXT,
      phone TEXT,
      email TEXT,
      follows_your_account TEXT,
      opted_in TEXT,
      clicked_at TIMESTAMPTZ,
      source TEXT NOT NULL DEFAULT 'manychat_external_request',
      raw_payload TEXT NOT NULL DEFAULT '{}'
    )
  `.execute();

  await sql`
    CREATE INDEX IF NOT EXISTS manychat_button_click_events_received_idx
      ON manychat_button_click_events (last_received_at DESC)
  `.execute();

  await sql`
    ALTER TABLE manychat_button_click_events
      ALTER COLUMN raw_payload TYPE TEXT
      USING raw_payload::TEXT
  `.execute();

  await sql`
    ALTER TABLE manychat_button_click_events
      ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'button_click',
      ADD COLUMN IF NOT EXISTS button_type TEXT,
      ADD COLUMN IF NOT EXISTS destination TEXT,
      ADD COLUMN IF NOT EXISTS follows_your_account TEXT,
      ADD COLUMN IF NOT EXISTS opted_in TEXT
  `.execute();

  await sql`
    CREATE INDEX IF NOT EXISTS manychat_button_click_events_button_idx
      ON manychat_button_click_events (automation_name, message_name, button_text)
  `.execute();
}

export async function main(body: ManyChatClickPayload): Promise<CaptureResult> {
  const payload = body ?? {};
  const automationName = text(payload.automation_name);
  const flowName = text(payload.flow_name);
  const messageName = text(payload.message_name);
  const eventType = text(payload.event_type) || "button_click";
  const isStartEvent = ["welcome_message_sent", "new_follower_entered", "message_sent"].includes(eventType);
  const buttonText = text(payload.button_text) || (isStartEvent ? "Welcome Message Sent" : "");
  const nextStep = text(payload.next_step);
  const buttonType = text(payload.button_type);
  const destination = text(payload.destination);
  const subscriberId = text(payload.subscriber_id);
  const contactId = text(payload.contact_id);
  const followsYourAccount = text(payload.follows_your_account);
  const optedIn = text(payload.opted_in);
  const clickedAt = clickedAtIso(payload.clicked_at);

  if (!automationName && !flowName) {
    throw new Error("Missing automation_name or flow_name");
  }
  if (!messageName) {
    throw new Error("Missing message_name");
  }
  if (!buttonText && !isStartEvent) {
    throw new Error("Missing button_text");
  }
  if (!subscriberId && !contactId) {
    throw new Error("Missing subscriber_id or contact_id");
  }

  await ensureTable();

  const keySource =
    text(payload.event_id) ||
    [
      automationName || flowName,
      messageName,
      buttonText,
      nextStep,
      eventType,
      subscriberId || contactId,
    ].join("|");
  const eventKey = (await sha256(keySource)).slice(0, 32);
  const sql = wmill.datatable("main");

  await sql`
    INSERT INTO manychat_button_click_events (
      event_key,
      automation_name,
      flow_name,
      message_name,
      button_text,
      next_step,
      event_type,
      button_type,
      destination,
      subscriber_id,
      contact_id,
      first_name,
      last_name,
      instagram_username,
      phone,
      email,
      follows_your_account,
      opted_in,
      clicked_at,
      raw_payload
    )
    VALUES (
      ${eventKey},
      ${automationName},
      ${flowName},
      ${messageName},
      ${buttonText},
      ${nextStep},
      ${eventType},
      ${buttonType},
      ${destination},
      ${subscriberId},
      ${contactId},
      ${text(payload.first_name)},
      ${text(payload.last_name)},
      ${text(payload.instagram_username)},
      ${text(payload.phone)},
      ${text(payload.email)},
      ${followsYourAccount},
      ${optedIn},
      ${clickedAt}::TIMESTAMPTZ,
      ${JSON.stringify(payload)}
    )
    ON CONFLICT (event_key) DO UPDATE SET
      last_received_at = NOW(),
      last_received_at_ist = NOW() AT TIME ZONE 'Asia/Kolkata',
      click_count = manychat_button_click_events.click_count + 1,
      next_step = EXCLUDED.next_step,
      event_type = EXCLUDED.event_type,
      button_type = COALESCE(NULLIF(EXCLUDED.button_type, ''), manychat_button_click_events.button_type),
      destination = COALESCE(NULLIF(EXCLUDED.destination, ''), manychat_button_click_events.destination),
      first_name = COALESCE(NULLIF(EXCLUDED.first_name, ''), manychat_button_click_events.first_name),
      last_name = COALESCE(NULLIF(EXCLUDED.last_name, ''), manychat_button_click_events.last_name),
      instagram_username = COALESCE(NULLIF(EXCLUDED.instagram_username, ''), manychat_button_click_events.instagram_username),
      phone = COALESCE(NULLIF(EXCLUDED.phone, ''), manychat_button_click_events.phone),
      email = COALESCE(NULLIF(EXCLUDED.email, ''), manychat_button_click_events.email),
      follows_your_account = COALESCE(NULLIF(EXCLUDED.follows_your_account, ''), manychat_button_click_events.follows_your_account),
      opted_in = COALESCE(NULLIF(EXCLUDED.opted_in, ''), manychat_button_click_events.opted_in),
      clicked_at = COALESCE(EXCLUDED.clicked_at, manychat_button_click_events.clicked_at),
      raw_payload = EXCLUDED.raw_payload
  `.execute();

  return {
    ok: true,
    event_key: eventKey,
    inserted_or_updated: true,
    automation_name: automationName || flowName,
    message_name: messageName,
    button_text: buttonText,
    next_step: nextStep,
    event_type: eventType,
  };
}
