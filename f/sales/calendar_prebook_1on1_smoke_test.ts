import * as wmill from "windmill-client";

const SERVICE_ACCOUNT_JSON_PATH = "f/sales/calendar_prebook_1on1/google_service_account_json";
const OWNER_CALENDAR_MAP_PATH = "f/sales/calendar_prebook_1on1/owner_calendar_map";
const TIMEZONE_PATH = "f/sales/calendar_prebook_1on1/timezone";

type ServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri: string;
};

function base64Url(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function signJwt(serviceAccount: ServiceAccount, subject: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/calendar",
    aud: serviceAccount.token_uri || "https://oauth2.googleapis.com/token",
    sub: subject,
    iat: now,
    exp: now + 3600,
  };
  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claim))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64Url(new Uint8Array(signature))}`;
}

async function getAccessToken(serviceAccount: ServiceAccount, subject: string): Promise<string> {
  const assertion = await signJwt(serviceAccount, subject);
  const response = await fetch(serviceAccount.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Google token request failed for ${subject}: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload.access_token;
}

async function freeBusy(calendarEmail: string, accessToken: string, timezone: string) {
  const timeMin = new Date();
  const timeMax = new Date(timeMin.getTime() + 36 * 60 * 60 * 1000);
  const response = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      timeZone: timezone,
      items: [{ id: calendarEmail }],
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Google freeBusy failed for ${calendarEmail}: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload.calendars?.[calendarEmail]?.busy || [];
}

export async function main() {
  const rawServiceAccount = await wmill.getVariable(SERVICE_ACCOUNT_JSON_PATH);
  const rawOwnerMap = await wmill.getVariable(OWNER_CALENDAR_MAP_PATH);
  const timezone = (await wmill.getVariable(TIMEZONE_PATH).catch(() => "Asia/Kolkata")) || "Asia/Kolkata";
  const serviceAccount = JSON.parse(rawServiceAccount) as ServiceAccount;
  const ownerMap = JSON.parse(rawOwnerMap) as Record<string, string>;
  const calendars = Array.from(new Set(Object.values(ownerMap).filter(Boolean)));

  const results = [];
  for (const calendarEmail of calendars) {
    const accessToken = await getAccessToken(serviceAccount, calendarEmail);
    const busy = await freeBusy(calendarEmail, accessToken, timezone);
    results.push({
      calendar: calendarEmail,
      freebusy_ok: true,
      busy_count_next_36h: busy.length,
      first_busy: busy[0] || null,
    });
  }

  return {
    ok: true,
    timezone,
    calendars_checked: results.length,
    results,
  };
}
