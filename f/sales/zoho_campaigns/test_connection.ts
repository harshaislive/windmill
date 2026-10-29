import * as wmill from "windmill-client";

const ROOT = "f/sales/zoho_campaigns";

type ZohoResponse = Record<string, any>;

function cleanBaseUrl(value: string, fallback: string) {
  return (value || fallback).trim().replace(/\/+$/, "");
}

async function requiredVariable(path: string) {
  const value = (await wmill.getVariable(path).catch(() => "")).trim();
  if (!value || value.startsWith("TODO_REPLACE")) throw new Error(`Missing or placeholder variable: ${path}`);
  return value;
}

async function optionalVariable(path: string, fallback: string) {
  const value = (await wmill.getVariable(path).catch(() => "")).trim();
  return value || fallback;
}

async function refreshAccessToken() {
  const accountsBaseUrl = cleanBaseUrl(
    await optionalVariable(`${ROOT}/accounts_base_url`, "https://accounts.zoho.in"),
    "https://accounts.zoho.in",
  );
  const clientId = await requiredVariable(`${ROOT}/client_id`);
  const clientSecret = await requiredVariable(`${ROOT}/client_secret`);
  const refreshToken = await requiredVariable(`${ROOT}/refresh_token`);

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  const response = await fetch(`${accountsBaseUrl}/oauth/v2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new Error(`Zoho token refresh failed: ${response.status} ${JSON.stringify(payload)}`);
  }

  return {
    accessToken: String(payload.access_token),
    expiresIn: Number(payload.expires_in || 0),
    accountsBaseUrl,
  };
}

function normalizeLists(payload: ZohoResponse) {
  const rows = Array.isArray(payload.list_of_details) ? payload.list_of_details : [];
  return rows.map((row) => ({
    list_name: String(row.listname || ""),
    list_key: String(row.listkey || ""),
    contacts: Number(row.noofcontacts || 0),
    lock_status: String(row.lockstatus || ""),
    is_public: String(row.is_public || ""),
    owner: String(row.owner || ""),
  }));
}

async function campaignsGet(path: string, accessToken: string, params: Record<string, string | number> = {}) {
  const campaignsBaseUrl = cleanBaseUrl(
    await optionalVariable(`${ROOT}/campaigns_base_url`, "https://campaigns.zoho.in"),
    "https://campaigns.zoho.in",
  );
  const url = new URL(`${campaignsBaseUrl}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));

  const response = await fetch(url, {
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
  });
  const payload = await response.json().catch(() => ({}));
  return {
    ok: response.ok && String(payload.status || "").toLowerCase() !== "error",
    status: response.status,
    payload,
  };
}

export async function main(include_raw = false) {
  const token = await refreshAccessToken();

  const mailingLists = await campaignsGet("/api/v1.1/getmailinglists", token.accessToken, {
    resfmt: "JSON",
    sort: "asc",
    fromindex: 1,
    range: 50,
  });

  const campaignProbePaths = [
    "/api/v1.1/getcampaigns",
    "/api/v1.1/recentcampaigns",
    "/api/v1.1/getcampaignreports",
  ];
  const campaign_probes = [];
  for (const path of campaignProbePaths) {
    const result = await campaignsGet(path, token.accessToken, { resfmt: "JSON", fromindex: 1, range: 10 }).catch((error) => ({
      ok: false,
      status: 0,
      payload: { message: error instanceof Error ? error.message : String(error) },
    }));
    campaign_probes.push({
      path,
      ok: result.ok,
      status: result.status,
      code: result.payload?.code,
      api_status: result.payload?.status,
      message: result.payload?.message,
      keys: Object.keys(result.payload || {}),
      raw: include_raw ? result.payload : undefined,
    });
  }

  return {
    ok: mailingLists.ok,
    token_refresh_ok: true,
    access_token_received: true,
    access_token_expires_in_seconds: token.expiresIn,
    mailing_lists_status: mailingLists.status,
    mailing_lists_api_status: mailingLists.payload?.status,
    mailing_lists_code: mailingLists.payload?.code,
    mailing_lists_message: mailingLists.payload?.message,
    mailing_lists_count: normalizeLists(mailingLists.payload).length,
    mailing_lists: normalizeLists(mailingLists.payload),
    campaign_probes,
    note: "Test-only Zoho Campaigns connection script. It does not touch production sales workflows or send emails.",
    raw: include_raw ? { mailing_lists: mailingLists.payload } : undefined,
  };
}
