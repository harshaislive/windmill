import * as wmill from "windmill-client";
import { createHmac, timingSafeEqual } from "node:crypto";

type HttpEventLike = {
  query?: Record<string, unknown>;
  queries?: Record<string, unknown>;
  http?: { query?: Record<string, unknown> };
  body?: unknown;
};

type TokenPayload = {
  v?: number;
  lead_id?: string;
  iat?: string;
};

type Lead = {
  lead_id: string;
  shopify_customer_id: string | null;
  email_opt_in: boolean;
};

const TOKEN_SECRET_PATH = "f/bewild_lead_magnet/rice_nurture_unsubscribe_secret";
const SHOPIFY_ADMIN_TOKEN_PATH = "f/bewild_lead_magnet/shopify_admin_access_token";
const SHOPIFY_SHOP_DOMAIN_PATH = "f/bewild_lead_magnet/shopify_shop_domain";
const SHOPIFY_API_VERSION = "2026-01";
const UNSUBSCRIBED_TAG = "rice_nurture_email_unsubscribed";
const CONFIRM_URL = "https://windmill.devsharsha.live/api/r/bewild/rice/unsubscribe";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function escapeHtml(value: unknown) {
  return clean(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character] || character));
}

function rowsOf<T>(value: any): T[] {
  return Array.isArray(value) ? value : value?.rows || [];
}

function tokenFromInput(t: unknown, event: HttpEventLike | null) {
  if (typeof t === "string" && t.trim()) return t.trim();
  const direct = t as HttpEventLike | null;
  const query = event?.query || event?.queries || event?.http?.query || direct?.query || direct?.queries || direct?.http?.query || {};
  const body = (event?.body || direct?.body || {}) as Record<string, unknown>;
  return clean(query.t || query.token || body.t || body.token);
}

export async function preprocessor(event: HttpEventLike) {
  const query = event?.query || event?.queries || event?.http?.query || {};
  const body = (event?.body || {}) as Record<string, unknown>;
  const confirmValue = clean(query.confirm || body.confirm).toLowerCase();
  return { t: tokenFromInput("", event), confirm: ["1", "true", "yes"].includes(confirmValue) };
}

async function verifyToken(token: string): Promise<TokenPayload> {
  const [body, signature] = token.split(".");
  if (!body || !signature) throw new Error("invalid_token");
  const secret = await wmill.getVariable(TOKEN_SECRET_PATH);
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
    throw new Error("invalid_token");
  }
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenPayload;
  if (payload.v !== 1 || !clean(payload.lead_id)) throw new Error("invalid_token");
  return payload;
}

async function shopifyGraphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const [token, shop] = await Promise.all([
    wmill.getVariable(SHOPIFY_ADMIN_TOKEN_PATH),
    wmill.getVariable(SHOPIFY_SHOP_DOMAIN_PATH),
  ]);
  const response = await fetch(
    `https://${clean(shop).replace(/^https?:\/\//, "").replace(/\/+$/, "")}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: { "X-Shopify-Access-Token": token, "content-type": "application/json" },
      body: JSON.stringify({ query, variables }),
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.errors?.length) {
    throw new Error(`Shopify GraphQL failed: ${response.status} ${JSON.stringify(payload?.errors || payload)}`);
  }
  return payload.data as T;
}

async function unsubscribeShopify(customerId: string) {
  const consent = await shopifyGraphql<{
    customerEmailMarketingConsentUpdate: { userErrors: Array<{ message?: string }> };
  }>(
    `mutation RiceNurtureUnsubscribe($input: CustomerEmailMarketingConsentUpdateInput!) {
      customerEmailMarketingConsentUpdate(input: $input) { userErrors { message } }
    }`,
    {
      input: {
        customerId,
        emailMarketingConsent: {
          marketingState: "UNSUBSCRIBED",
          consentUpdatedAt: new Date().toISOString(),
        },
      },
    },
  );
  const consentError = (consent.customerEmailMarketingConsentUpdate.userErrors || [])
    .map((error) => error.message)
    .filter(Boolean)
    .join("; ");
  if (consentError) throw new Error(consentError);

  const tags = await shopifyGraphql<{ tagsAdd: { userErrors: Array<{ message?: string }> } }>(
    `mutation TagRiceNurtureUnsubscribe($id: ID!, $tags: [String!]!) {
      tagsAdd(id: $id, tags: $tags) { userErrors { message } }
    }`,
    { id: customerId, tags: [UNSUBSCRIBED_TAG] },
  );
  const tagError = (tags.tagsAdd.userErrors || []).map((error) => error.message).filter(Boolean).join("; ");
  if (tagError) throw new Error(tagError);
}

function page(title: string, message: string, ok: boolean) {
  const accent = ok ? "#2f523a" : "#9b4b3f";
  return {
    windmill_status_code: ok ? 200 : 400,
    windmill_content_type: "text/html; charset=utf-8",
    windmill_headers: { "Cache-Control": "no-store" },
    result: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="margin:0;background:#f3efe6;color:#20251f;font-family:Georgia,'Times New Roman',serif;"><main style="max-width:560px;margin:12vh auto;padding:40px;background:#fffdf8;border:1px solid #ded7c8;"><div style="color:${accent};font-family:Arial,sans-serif;font-size:12px;letter-spacing:1.6px;text-transform:uppercase;">Bewild Rice Finder</div><h1 style="margin:18px 0;color:#263e2d;font-size:34px;font-weight:normal;">${title}</h1><p style="font-size:17px;line-height:1.65;">${message}</p><p style="margin-top:28px;font-family:Arial,sans-serif;font-size:13px;color:#565b53;">You can still use your saved rice guide at any time.</p></main></body></html>`,
  };
}

function confirmationPage(token: string) {
  return {
    windmill_status_code: 200,
    windmill_content_type: "text/html; charset=utf-8",
    windmill_headers: { "Cache-Control": "no-store" },
    result: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Confirm email preference</title></head><body style="margin:0;background:#f3efe6;color:#20251f;font-family:Georgia,'Times New Roman',serif;"><main style="max-width:560px;margin:12vh auto;padding:40px;background:#fffdf8;border:1px solid #ded7c8;"><div style="color:#9b4b3f;font-family:Arial,sans-serif;font-size:12px;letter-spacing:1.6px;text-transform:uppercase;">Bewild Rice Finder</div><h1 style="margin:18px 0;color:#263e2d;font-size:34px;font-weight:normal;">Stop Rice Finder emails?</h1><p style="font-size:17px;line-height:1.65;">Confirm below and we will stop the remaining recipe and rice messages.</p><form method="post" action="${CONFIRM_URL}"><input type="hidden" name="t" value="${escapeHtml(token)}"><input type="hidden" name="confirm" value="1"><button type="submit" style="border:0;background:#2f523a;color:#fffdf8;padding:14px 20px;font-family:Arial,sans-serif;font-size:14px;cursor:pointer;">Yes, unsubscribe me</button></form><p style="margin-top:28px;font-family:Arial,sans-serif;font-size:13px;color:#565b53;">Close this page if you want to keep receiving the series.</p></main></body></html>`,
  };
}

export async function main(t: unknown = "", confirm = false, event: HttpEventLike | null = null) {
  try {
    const token = tokenFromInput(t, event);
    const payload = await verifyToken(token);
    if (!confirm) return confirmationPage(token);
    const leadId = clean(payload.lead_id);
    const sql = wmill.datatable();
    const leads = rowsOf<Lead>(await sql`
      SELECT lead_id, shopify_customer_id, email_opt_in
      FROM bewild_lead_magnet_leads
      WHERE lead_id = ${leadId} AND lead_magnet_name = 'rice_comfort_recipe_finder'
      LIMIT 1
    `.execute());
    const lead = leads[0];
    if (!lead) return page("Email preferences updated", "This address is no longer scheduled for Rice Finder emails.", true);

    if (lead.email_opt_in) {
      await sql`
        UPDATE bewild_lead_magnet_leads
        SET email_opt_in = FALSE,
            channels = COALESCE(channels, '[]'::jsonb) - 'email',
            raw_payload = COALESCE(raw_payload, '{}'::jsonb) || ${{
              rice_nurture_unsubscribe: { at: new Date().toISOString(), source: "email_link" },
            }}::jsonb,
            updated_at = NOW()
        WHERE lead_id = ${leadId}
      `.execute();
    }

    await sql`
      UPDATE bewild_rice_nurture_dispatches
      SET status = 'suppressed',
          error = 'recipient_unsubscribed',
          detail = COALESCE(detail, '{}'::jsonb) || ${{ suppression_source: "email_link" }}::jsonb,
          updated_at = NOW()
      WHERE lead_id = ${leadId}
        AND channel = 'email'
        AND status NOT IN ('sent', 'verified', 'handed_off', 'skipped_buyer', 'skipped_backfill')
    `.execute();

    if (lead.shopify_customer_id) await unsubscribeShopify(lead.shopify_customer_id);
    return page("You are unsubscribed", "We will not send you further Rice Finder emails.", true);
  } catch {
    return page("We could not update this link", "Please reply to the email and ask us to remove you from the Rice Finder series.", false);
  }
}
