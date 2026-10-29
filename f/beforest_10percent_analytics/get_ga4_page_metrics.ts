const BASE = "f/beforest_10percent_analytics";

function apiBaseUrl(): string {
  const base = (process.env.BASE_INTERNAL_URL || process.env.BASE_URL || "").replace(/\/+$/, "");
  if (!base) throw new Error("BASE_INTERNAL_URL or BASE_URL is required to read Windmill variables.");
  return base.endsWith("/api") ? base : `${base}/api`;
}

async function getVariable(path: string): Promise<string> {
  const token = process.env.WM_TOKEN;
  if (!token) throw new Error("WM_TOKEN is required to read Windmill variables.");
  const workspace = process.env.WM_WORKSPACE || process.env.WORKSPACE || process.env.WM_WORKSPACE_ID || "beforest-automations";
  const response = await fetch(`${apiBaseUrl()}/w/${workspace}/variables/get_value/${encodeURIComponent(path)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Failed to read Windmill variable ${path}: ${response.status} ${text}`);
  try {
    const parsed = JSON.parse(text);
    return typeof parsed === "string" ? parsed : String(parsed?.value ?? "");
  } catch {
    return text;
  }
}

export async function main(start_date = "90daysAgo", end_date = "today") {
  const propertyId = await getVariable(`${BASE}/ga4_property_id`).catch(() => "");
  const serviceAccount = await getVariable(`${BASE}/google_service_account_json`).catch(() => "");
  return {
    ok: Boolean(propertyId && serviceAccount),
    start_date,
    end_date,
    configured: {
      ga4_property_id: Boolean(propertyId),
      google_service_account_json: Boolean(serviceAccount),
    },
    note: "The raw app uses f/beforest_10percent_analytics/get_dashboard_data for the combined GA4 and Supabase payload.",
  };
}
