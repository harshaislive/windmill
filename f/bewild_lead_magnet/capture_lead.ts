import * as wmill from "windmill-client";

type LeadPayload = {
  event_type?: string;
  lead_magnet_name?: string;
  coupon?: string;
  channels?: string[];
  source?: string;
  page?: string;
  visitor_id?: string;
  visitorId?: string;
  session_id?: string;
  engaged_ms?: number;
  elapsed_ms?: number;
  scroll_depth?: number;
  email_opt_in?: boolean;
  whatsapp_opt_in?: boolean;
  consent_text?: string;
  consentText?: string;
  lead_id?: string;
  name?: string;
  email?: string;
  whatsapp?: string;
  phone?: string;
  consent?: boolean;
  answers?: Record<string, unknown>;
  result_key?: string;
  result_title?: string;
  product_interest?: string;
  product_link?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  fbclid?: string;
  timestamp?: string;
  [key: string]: unknown;
};

type ShopifyCustomer = {
  id: string;
  email?: string;
  phone?: string | null;
  tags?: string[];
  emailMarketingConsent?: {
    marketingState?: string;
    marketingOptInLevel?: string;
    consentUpdatedAt?: string;
  } | null;
};

type ShopifySyncResult = {
  status: "synced" | "skipped" | "failed";
  action?: "created" | "updated";
  customer_id?: string;
  tags?: string[];
  error?: string;
};

type ExistingCouponClaim = {
  lead_id: string;
  email?: string;
  delivery_status?: string;
};

const DEFAULT_LEAD_MAGNET = "bewild_coupon_popup";
const SHOPIFY_ADMIN_TOKEN_PATH = "f/bewild_lead_magnet/shopify_admin_access_token";
const SHOPIFY_SHOP_DOMAIN_PATH = "f/bewild_lead_magnet/shopify_shop_domain";
const SHOPIFY_API_VERSION = "2026-01";
const SHOPIFY_POPUP_BASE_TAGS = ["bewild_coupon_popup", "BW10", "coupon_popup"];
const SHOPIFY_RICE_BASE_TAGS = ["bewild_rice_recipe_finder", "rice_recipe_finder", "rice_guide_requested"];
const SHOPIFY_RICE_EMAIL_PENDING_TAG = "rice_guide_email_pending";
const RICE_RESULT_KEYS = [
  "mysore_mallige_idli",
  "mysore_mallige_lemon_rice",
  "mysore_mallige_curd_rice",
  "mysore_mallige_ghee_rice",
  "mysore_mallige_biryani",
  "navara_red_rice_pulao",
  "navara_red_rice_kheer",
  "navara_rice_dosa",
  "navara_paal_kanji",
  "navara_coconut_porridge",
  "navara_red_rice_khichdi",
] as const;
const GUIDE_ANALYTICS_EVENT_NAMES: Record<string, string> = {
  guide_open: "GuideOpened",
  guide_engaged_30s: "GuideEngaged30s",
  guide_engaged_60s: "GuideEngaged60s",
  guide_engaged_120s: "GuideEngaged120s",
  guide_engaged_300s: "GuideEngaged300s",
  guide_scroll_25: "GuideScroll25",
  guide_scroll_50: "GuideScroll50",
  guide_scroll_75: "GuideScroll75",
  guide_scroll_90: "GuideScroll90",
  guide_checkpoint: "GuideCheckpoint",
};

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function cleanEmail(value: unknown) {
  return cleanText(value).toLowerCase();
}

function cleanPhone(value: unknown) {
  const raw = cleanText(value);
  const plus = raw.startsWith("+") ? "+" : "";
  return plus + raw.replace(/[^\d]/g, "");
}

function shopifyPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  if (value.startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return digits.length >= 11 ? `+${digits}` : "";
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

function isValidPhone(value: string) {
  const digits = value.replace(/[^\d]/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

function eventTime(value: unknown) {
  const parsed = new Date(cleanText(value));
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function boundedNumber(value: unknown, maximum: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(Math.round(parsed), maximum);
}

function guideAnalyticsEventName(eventType: string) {
  return GUIDE_ANALYTICS_EVENT_NAMES[eventType] || "";
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function leadIdFor(leadMagnet: string, email: string, phone: string) {
  const basis = `${leadMagnet}:${email || phone}`;
  return `lm_${(await sha256(basis)).slice(0, 24)}`;
}

function utm(payload: LeadPayload) {
  return {
    utm_source: cleanText(payload.utm_source),
    utm_medium: cleanText(payload.utm_medium),
    utm_campaign: cleanText(payload.utm_campaign),
    utm_content: cleanText(payload.utm_content),
    fbclid: cleanText(payload.fbclid),
  };
}

function cleanChannels(payload: LeadPayload) {
  const raw = payload.channels;
  let channels: string[] = [];
  if (Array.isArray(raw)) {
    channels = raw.map((channel) => cleanText(channel).toLowerCase());
  } else if (typeof raw === "string") {
    channels = raw.split(",").map((channel) => cleanText(channel).toLowerCase());
  }

  if (payload.email_opt_in === true && !channels.includes("email")) channels.push("email");
  if (payload.whatsapp_opt_in === true && !channels.includes("whatsapp")) channels.push("whatsapp");

  return [...new Set(channels.filter((channel) => ["email", "whatsapp"].includes(channel)))];
}

function consentFor(channel: "email" | "whatsapp", payload: LeadPayload, channels: string[]) {
  if (channel === "email" && typeof payload.email_opt_in === "boolean") return payload.email_opt_in;
  if (channel === "whatsapp" && typeof payload.whatsapp_opt_in === "boolean") return payload.whatsapp_opt_in;
  return channels.includes(channel);
}

function visitorId(payload: LeadPayload) {
  return cleanText(payload.visitor_id || payload.visitorId);
}

function followupTypeFor(leadMagnet: string) {
  if (leadMagnet === "bewild_coupon_popup") return "coupon_delivery";
  if (leadMagnet === "rice_comfort_recipe_finder") return "recipe_guide_delivery";
  return "lead_magnet_delivery";
}

function shouldSyncShopifyLead(leadMagnet: string, eventType: string, email: string, consent: unknown) {
  return ["bewild_coupon_popup", "rice_comfort_recipe_finder"].includes(leadMagnet) && eventType !== "product_click" && Boolean(email) && consent === true;
}

function popupShopifyTags(channels: string[]) {
  const tags = [...SHOPIFY_POPUP_BASE_TAGS];
  if (channels.includes("email")) tags.push("coupon_popup_email");
  if (channels.includes("whatsapp")) tags.push("coupon_popup_whatsapp");
  return [...new Set(tags)];
}

function riceShopifyTags(payload: LeadPayload, channels: string[]) {
  const tags = [...SHOPIFY_RICE_BASE_TAGS];
  const resultKey = cleanText(payload.result_key || payload.recipe_result);
  const productInterest = cleanText(payload.product_interest).toLowerCase();
  const answers = payload.answers || {};
  const answerDimensions = ["rice_moment", "cook_identity", "household", "rice_relationship", "flavour"];
  if (channels.includes("email")) tags.push("rice_guide_email", SHOPIFY_RICE_EMAIL_PENDING_TAG);
  if (channels.includes("whatsapp")) tags.push("rice_guide_whatsapp");
  if (resultKey && RICE_RESULT_KEYS.includes(resultKey as (typeof RICE_RESULT_KEYS)[number])) {
    tags.push(`rice_result_${resultKey}`);
  }
  if (resultKey.startsWith("mysore_mallige") || productInterest.includes("mysore")) tags.push("rice_mysore_mallige_interest");
  if (resultKey.includes("navara") || productInterest.includes("navara")) tags.push("rice_navara_interest");
  for (const dimension of answerDimensions) {
    const value = cleanText(answers[dimension]).toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
    if (value) tags.push(`rice_${dimension}_${value}`);
  }
  return [...new Set(tags)];
}

function shopifyTagsForLead(leadMagnet: string, payload: LeadPayload, channels: string[]) {
  if (leadMagnet === DEFAULT_LEAD_MAGNET) return popupShopifyTags(channels);
  if (leadMagnet === "rice_comfort_recipe_finder") return riceShopifyTags(payload, channels);
  return [];
}

function mergeTags(current: string[] | undefined, next: string[]) {
  return [...new Set([...(current || []), ...next].filter(Boolean))];
}

function withoutPreviousRiceResults(tags: string[] | undefined) {
  const legacyResultKeys = new Set<string>(RICE_RESULT_KEYS);
  return (tags || []).filter((tag) => !tag.startsWith("rice_result_") && !legacyResultKeys.has(tag));
}

function userErrorMessage(userErrors: unknown) {
  const errors = Array.isArray(userErrors) ? userErrors : [];
  return errors
    .map((error: any) => `${(error?.field || []).join(".") || "field"}: ${error?.message || "Unknown error"}`)
    .join("; ");
}

async function shopifyGraphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const token = await wmill.getVariable(SHOPIFY_ADMIN_TOKEN_PATH);
  const shop = await wmill.getVariable(SHOPIFY_SHOP_DOMAIN_PATH);
  if (!token || !shop) {
    throw new Error("Shopify Admin API variables are missing in Windmill.");
  }

  const response = await fetch(`https://${String(shop).replace(/^https?:\/\//, "").replace(/\/+$/, "")}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": token,
      "content-type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.errors?.length) {
    throw new Error(`Shopify GraphQL failed: ${response.status} ${JSON.stringify(payload?.errors || payload)}`);
  }
  return payload.data as T;
}

async function findShopifyCustomerByEmail(email: string): Promise<ShopifyCustomer | null> {
  const escapedEmail = email.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const data = await shopifyGraphql<{
    customers: { edges: { node: ShopifyCustomer }[] };
  }>(
    `query FindCustomerByEmail($query: String!) {
      customers(first: 1, query: $query) {
        edges {
          node {
            id
            email
            phone
            tags
            emailMarketingConsent {
              marketingState
              marketingOptInLevel
              consentUpdatedAt
            }
          }
        }
      }
    }`,
    { query: `email:"${escapedEmail}"` },
  );
  return data.customers.edges[0]?.node || null;
}

function isExistingShopifyEmailError(error: unknown) {
  return /email.*already.*taken/i.test(error instanceof Error ? error.message : String(error));
}

async function createShopifyCustomer(email: string, phone: string, tags: string[], emailOptIn: boolean): Promise<ShopifyCustomer> {
  const input: Record<string, unknown> = {
    email,
    tags,
    note: "Created from Bewild lead magnet.",
  };
  if (phone) input.phone = phone;
  if (emailOptIn) {
    input.emailMarketingConsent = {
      marketingState: "SUBSCRIBED",
      marketingOptInLevel: "SINGLE_OPT_IN",
      consentUpdatedAt: new Date().toISOString(),
    };
  }

  const data = await shopifyGraphql<{
    customerCreate: { customer: ShopifyCustomer | null; userErrors: unknown[] };
  }>(
    `mutation CreatePopupCustomer($input: CustomerInput!) {
      customerCreate(input: $input) {
        customer { id email phone tags }
        userErrors { field message }
      }
    }`,
    { input },
  );
  const message = userErrorMessage(data.customerCreate.userErrors);
  if (message || !data.customerCreate.customer) throw new Error(message || "Shopify customerCreate returned no customer.");
  return data.customerCreate.customer;
}

async function updateShopifyCustomer(customer: ShopifyCustomer, phone: string, tags: string[]): Promise<ShopifyCustomer> {
  const input: Record<string, unknown> = {
    id: customer.id,
    tags: mergeTags(customer.tags, tags),
  };
  if (!customer.phone && phone) input.phone = phone;

  const data = await shopifyGraphql<{
    customerUpdate: { customer: ShopifyCustomer | null; userErrors: unknown[] };
  }>(
    `mutation UpdatePopupCustomer($input: CustomerInput!) {
      customerUpdate(input: $input) {
        customer { id email phone tags }
        userErrors { field message }
      }
    }`,
    { input },
  );
  const message = userErrorMessage(data.customerUpdate.userErrors);
  if (message || !data.customerUpdate.customer) throw new Error(message || "Shopify customerUpdate returned no customer.");
  return data.customerUpdate.customer;
}

async function findExistingCouponClaim(sql: any, email: string, whatsapp: string): Promise<ExistingCouponClaim | null> {
  const whatsappDigits = whatsapp.replace(/\D/g, "");
  const result = await sql`
    SELECT
      l.lead_id,
      l.email,
      l.delivery_status
    FROM bewild_lead_magnet_leads l
    WHERE l.lead_magnet_name = 'bewild_coupon_popup'
      AND (
        (${email} <> '' AND LOWER(COALESCE(l.email, '')) = LOWER(${email}))
        OR
        (
          ${whatsappDigits} <> ''
          AND REGEXP_REPLACE(COALESCE(l.whatsapp, ''), '\D', '', 'g') = ${whatsappDigits}
        )
      )
    ORDER BY
      CASE WHEN l.delivery_status = 'sent' THEN 0 ELSE 1 END,
      l.last_submitted_at DESC
    LIMIT 1
  `.execute();
  const rows = Array.isArray(result) ? result : result.rows || [];
  return rows[0] || null;
}

async function findLeadIdForVisitor(sql: any, leadMagnet: string, visitor: string): Promise<string | null> {
  const result = await sql`
    SELECT lead_id
    FROM bewild_lead_magnet_leads
    WHERE lead_magnet_name = ${leadMagnet}
      AND visitor_id = ${visitor}
    ORDER BY last_submitted_at DESC
    LIMIT 1
  `.execute();
  const rows = Array.isArray(result) ? result : result.rows || [];
  return cleanText(rows[0]?.lead_id) || null;
}

async function updateShopifyEmailConsent(customerId: string) {
  const data = await shopifyGraphql<{
    customerEmailMarketingConsentUpdate: { customer: ShopifyCustomer | null; userErrors: unknown[] };
  }>(
    `mutation UpdatePopupCustomerConsent($input: CustomerEmailMarketingConsentUpdateInput!) {
      customerEmailMarketingConsentUpdate(input: $input) {
        customer {
          id
          emailMarketingConsent {
            marketingState
            marketingOptInLevel
            consentUpdatedAt
          }
        }
        userErrors { field message }
      }
    }`,
    {
      input: {
        customerId,
        emailMarketingConsent: {
          marketingState: "SUBSCRIBED",
          marketingOptInLevel: "SINGLE_OPT_IN",
          consentUpdatedAt: new Date().toISOString(),
        },
      },
    },
  );
  const message = userErrorMessage(data.customerEmailMarketingConsentUpdate.userErrors);
  if (message) throw new Error(message);
}

async function syncShopifyPopupCustomer(params: {
  leadMagnet: string;
  eventType: string;
  payload: LeadPayload;
  email: string;
  whatsapp: string;
  channels: string[];
  emailOptIn: boolean;
  consent: unknown;
}): Promise<ShopifySyncResult> {
  if (!shouldSyncShopifyLead(params.leadMagnet, params.eventType, params.email, params.consent)) {
    return { status: "skipped" };
  }

  const phone = shopifyPhone(params.whatsapp);
  const tags = shopifyTagsForLead(params.leadMagnet, params.payload, params.channels);
  const existing = await findShopifyCustomerByEmail(params.email);

  let customer: ShopifyCustomer;
  let action: "created" | "updated" = "created";
  if (existing) {
    const customerForUpdate =
      params.leadMagnet === "rice_comfort_recipe_finder"
        ? { ...existing, tags: withoutPreviousRiceResults(existing.tags) }
        : existing;
    try {
      customer = await updateShopifyCustomer(customerForUpdate, phone, tags);
    } catch (error) {
      if (!phone || customerForUpdate.phone) throw error;
      customer = await updateShopifyCustomer(customerForUpdate, "", tags);
    }
    action = "updated";
  } else {
    try {
      customer = await createShopifyCustomer(params.email, phone, tags, params.emailOptIn);
    } catch (error) {
      const recovered = isExistingShopifyEmailError(error)
        ? await findShopifyCustomerByEmail(params.email)
        : null;
      if (recovered) {
        const customerForUpdate =
          params.leadMagnet === "rice_comfort_recipe_finder"
            ? { ...recovered, tags: withoutPreviousRiceResults(recovered.tags) }
            : recovered;
        customer = await updateShopifyCustomer(customerForUpdate, phone, tags);
        action = "updated";
      } else {
        if (!phone) throw error;
        customer = await createShopifyCustomer(params.email, "", tags, params.emailOptIn);
      }
    }
  }

  if (params.emailOptIn) await updateShopifyEmailConsent(customer.id);

  return {
    status: "synced",
    action,
    customer_id: customer.id,
    tags: mergeTags(customer.tags, tags),
  };
}

async function recordShopifySync(sql: any, leadId: string, dedupeKey: string, result: ShopifySyncResult) {
  if (result.status === "skipped") return;
  await sql`
    UPDATE bewild_lead_magnet_leads
    SET shopify_customer_id = COALESCE(NULLIF(${cleanText(result.customer_id)}, ''), shopify_customer_id),
        shopify_sync_status = ${result.status},
        shopify_sync_error = ${cleanText(result.error)},
        shopify_synced_at = NOW(),
        shopify_synced_at_ist = NOW() AT TIME ZONE 'Asia/Kolkata',
        raw_payload = COALESCE(raw_payload, '{}'::jsonb) || ${{
          shopify_sync: result,
        }}::jsonb,
        updated_at = NOW()
    WHERE lead_id = ${leadId}
       OR dedupe_key = ${dedupeKey}
  `.execute();
}

async function createTables(sql: any) {
  await sql`
    CREATE TABLE IF NOT EXISTS bewild_lead_magnet_leads (
      lead_id TEXT PRIMARY KEY,
      dedupe_key TEXT UNIQUE NOT NULL,
      lead_magnet_name TEXT NOT NULL,
      name TEXT,
      email TEXT,
      whatsapp TEXT,
      consent BOOLEAN DEFAULT FALSE,
      coupon TEXT,
      channels JSONB DEFAULT '[]'::jsonb,
      source TEXT,
      page TEXT,
      visitor_id TEXT,
      email_opt_in BOOLEAN DEFAULT FALSE,
      whatsapp_opt_in BOOLEAN DEFAULT FALSE,
      delivery_status TEXT NOT NULL DEFAULT 'pending',
      result_key TEXT,
      result_title TEXT,
      product_interest TEXT,
      product_link TEXT,
      answers JSONB DEFAULT '{}'::jsonb,
      utm_source TEXT,
      utm_medium TEXT,
      utm_campaign TEXT,
      utm_content TEXT,
      fbclid TEXT,
      first_submitted_at TIMESTAMPTZ NOT NULL,
      first_submitted_at_ist TIMESTAMP,
      last_submitted_at TIMESTAMPTZ NOT NULL,
      last_submitted_at_ist TIMESTAMP,
      product_clicked BOOLEAN DEFAULT FALSE,
      product_click_count INTEGER DEFAULT 0,
      last_product_clicked_at TIMESTAMPTZ,
      last_product_clicked_at_ist TIMESTAMP,
      raw_payload JSONB DEFAULT '{}'::jsonb,
      shopify_customer_id TEXT,
      shopify_sync_status TEXT,
      shopify_sync_error TEXT,
      shopify_synced_at TIMESTAMPTZ,
      shopify_synced_at_ist TIMESTAMP,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      created_at_ist TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Kolkata'),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `.execute();
  await sql`ALTER TABLE bewild_lead_magnet_leads ADD COLUMN IF NOT EXISTS first_submitted_at_ist TIMESTAMP`.execute();
  await sql`ALTER TABLE bewild_lead_magnet_leads ADD COLUMN IF NOT EXISTS last_submitted_at_ist TIMESTAMP`.execute();
  await sql`ALTER TABLE bewild_lead_magnet_leads ADD COLUMN IF NOT EXISTS last_product_clicked_at_ist TIMESTAMP`.execute();
  await sql`ALTER TABLE bewild_lead_magnet_leads ADD COLUMN IF NOT EXISTS created_at_ist TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Kolkata')`.execute();
  await sql`ALTER TABLE bewild_lead_magnet_leads ADD COLUMN IF NOT EXISTS coupon TEXT`.execute();
  await sql`ALTER TABLE bewild_lead_magnet_leads ADD COLUMN IF NOT EXISTS channels JSONB DEFAULT '[]'::jsonb`.execute();
  await sql`ALTER TABLE bewild_lead_magnet_leads ADD COLUMN IF NOT EXISTS source TEXT`.execute();
  await sql`ALTER TABLE bewild_lead_magnet_leads ADD COLUMN IF NOT EXISTS page TEXT`.execute();
  await sql`ALTER TABLE bewild_lead_magnet_leads ADD COLUMN IF NOT EXISTS visitor_id TEXT`.execute();
  await sql`ALTER TABLE bewild_lead_magnet_leads ADD COLUMN IF NOT EXISTS email_opt_in BOOLEAN DEFAULT FALSE`.execute();
  await sql`ALTER TABLE bewild_lead_magnet_leads ADD COLUMN IF NOT EXISTS whatsapp_opt_in BOOLEAN DEFAULT FALSE`.execute();
  await sql`ALTER TABLE bewild_lead_magnet_leads ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'pending'`.execute();
  await sql`ALTER TABLE bewild_lead_magnet_leads ADD COLUMN IF NOT EXISTS shopify_customer_id TEXT`.execute();
  await sql`ALTER TABLE bewild_lead_magnet_leads ADD COLUMN IF NOT EXISTS shopify_sync_status TEXT`.execute();
  await sql`ALTER TABLE bewild_lead_magnet_leads ADD COLUMN IF NOT EXISTS shopify_sync_error TEXT`.execute();
  await sql`ALTER TABLE bewild_lead_magnet_leads ADD COLUMN IF NOT EXISTS shopify_synced_at TIMESTAMPTZ`.execute();
  await sql`ALTER TABLE bewild_lead_magnet_leads ADD COLUMN IF NOT EXISTS shopify_synced_at_ist TIMESTAMP`.execute();
  await sql`
    UPDATE bewild_lead_magnet_leads
    SET first_submitted_at_ist = COALESCE(first_submitted_at_ist, first_submitted_at AT TIME ZONE 'Asia/Kolkata'),
        last_submitted_at_ist = COALESCE(last_submitted_at_ist, last_submitted_at AT TIME ZONE 'Asia/Kolkata'),
        last_product_clicked_at_ist = COALESCE(last_product_clicked_at_ist, last_product_clicked_at AT TIME ZONE 'Asia/Kolkata'),
        created_at_ist = created_at AT TIME ZONE 'Asia/Kolkata'
  `.execute();
  await sql`CREATE INDEX IF NOT EXISTS bewild_lm_leads_email_idx ON bewild_lead_magnet_leads (email)`.execute();
  await sql`CREATE INDEX IF NOT EXISTS bewild_lm_leads_whatsapp_idx ON bewild_lead_magnet_leads (whatsapp)`.execute();
  await sql`CREATE INDEX IF NOT EXISTS bewild_lm_leads_result_idx ON bewild_lead_magnet_leads (lead_magnet_name, result_key)`.execute();
  await sql`CREATE INDEX IF NOT EXISTS bewild_lm_leads_visitor_idx ON bewild_lead_magnet_leads (visitor_id)`.execute();
  await sql`CREATE INDEX IF NOT EXISTS bewild_lm_leads_delivery_idx ON bewild_lead_magnet_leads (lead_magnet_name, delivery_status)`.execute();
  await sql`CREATE INDEX IF NOT EXISTS bewild_lm_leads_shopify_idx ON bewild_lead_magnet_leads (shopify_customer_id)`.execute();

  await sql`
    CREATE TABLE IF NOT EXISTS bewild_lead_magnet_events (
      event_id TEXT PRIMARY KEY,
      lead_id TEXT,
      event_name TEXT NOT NULL,
      lead_magnet_name TEXT NOT NULL,
      coupon TEXT,
      channels JSONB DEFAULT '[]'::jsonb,
      source TEXT,
      page TEXT,
      visitor_id TEXT,
      session_id TEXT,
      result_key TEXT,
      product_interest TEXT,
      product_link TEXT,
      engaged_ms INTEGER DEFAULT 0,
      elapsed_ms INTEGER DEFAULT 0,
      scroll_depth INTEGER DEFAULT 0,
      event_timestamp TIMESTAMPTZ NOT NULL,
      event_timestamp_ist TIMESTAMP,
      utm_source TEXT,
      utm_medium TEXT,
      utm_campaign TEXT,
      utm_content TEXT,
      fbclid TEXT,
      payload JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `.execute();
  await sql`ALTER TABLE bewild_lead_magnet_events ADD COLUMN IF NOT EXISTS event_timestamp_ist TIMESTAMP`.execute();
  await sql`ALTER TABLE bewild_lead_magnet_events ADD COLUMN IF NOT EXISTS coupon TEXT`.execute();
  await sql`ALTER TABLE bewild_lead_magnet_events ADD COLUMN IF NOT EXISTS channels JSONB DEFAULT '[]'::jsonb`.execute();
  await sql`ALTER TABLE bewild_lead_magnet_events ADD COLUMN IF NOT EXISTS source TEXT`.execute();
  await sql`ALTER TABLE bewild_lead_magnet_events ADD COLUMN IF NOT EXISTS page TEXT`.execute();
  await sql`ALTER TABLE bewild_lead_magnet_events ADD COLUMN IF NOT EXISTS visitor_id TEXT`.execute();
  await sql`ALTER TABLE bewild_lead_magnet_events ADD COLUMN IF NOT EXISTS session_id TEXT`.execute();
  await sql`ALTER TABLE bewild_lead_magnet_events ADD COLUMN IF NOT EXISTS engaged_ms INTEGER DEFAULT 0`.execute();
  await sql`ALTER TABLE bewild_lead_magnet_events ADD COLUMN IF NOT EXISTS elapsed_ms INTEGER DEFAULT 0`.execute();
  await sql`ALTER TABLE bewild_lead_magnet_events ADD COLUMN IF NOT EXISTS scroll_depth INTEGER DEFAULT 0`.execute();
  await sql`
    UPDATE bewild_lead_magnet_events
    SET event_timestamp_ist = COALESCE(event_timestamp_ist, event_timestamp AT TIME ZONE 'Asia/Kolkata')
  `.execute();
  await sql`CREATE INDEX IF NOT EXISTS bewild_lm_events_lead_idx ON bewild_lead_magnet_events (lead_id, event_timestamp DESC)`.execute();
  await sql`CREATE INDEX IF NOT EXISTS bewild_lm_events_name_idx ON bewild_lead_magnet_events (event_name, event_timestamp DESC)`.execute();
  await sql`CREATE INDEX IF NOT EXISTS bewild_lm_events_guide_session_idx ON bewild_lead_magnet_events (visitor_id, session_id, event_timestamp DESC)`.execute();
  await sql`CREATE INDEX IF NOT EXISTS bewild_lm_events_guide_result_idx ON bewild_lead_magnet_events (result_key, event_name, event_timestamp DESC)`.execute();

  await sql`
    CREATE TABLE IF NOT EXISTS bewild_lead_magnet_followups (
      followup_id TEXT PRIMARY KEY,
      lead_id TEXT NOT NULL,
      lead_magnet_name TEXT,
      followup_type TEXT NOT NULL,
      channel TEXT NOT NULL,
      recipient TEXT,
      due_at TIMESTAMPTZ NOT NULL,
      due_at_ist TIMESTAMP,
      status TEXT NOT NULL DEFAULT 'pending',
      sent_at TIMESTAMPTZ,
      sent_at_ist TIMESTAMP,
      provider_message_id TEXT,
      error TEXT,
      payload JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (lead_id, followup_type, channel)
    )
  `.execute();
  await sql`ALTER TABLE bewild_lead_magnet_followups ADD COLUMN IF NOT EXISTS due_at_ist TIMESTAMP`.execute();
  await sql`ALTER TABLE bewild_lead_magnet_followups ADD COLUMN IF NOT EXISTS sent_at_ist TIMESTAMP`.execute();
  await sql`ALTER TABLE bewild_lead_magnet_followups ADD COLUMN IF NOT EXISTS lead_magnet_name TEXT`.execute();
  await sql`ALTER TABLE bewild_lead_magnet_followups ADD COLUMN IF NOT EXISTS recipient TEXT`.execute();
  await sql`
    UPDATE bewild_lead_magnet_followups
    SET due_at_ist = COALESCE(due_at_ist, due_at AT TIME ZONE 'Asia/Kolkata'),
        sent_at_ist = COALESCE(sent_at_ist, sent_at AT TIME ZONE 'Asia/Kolkata')
  `.execute();
  await sql`CREATE INDEX IF NOT EXISTS bewild_lm_followups_status_idx ON bewild_lead_magnet_followups (status, due_at)`.execute();
}

async function insertEvent(sql: any, payload: LeadPayload, leadId: string | null, eventName: string) {
  const eventId = crypto.randomUUID();
  const tracking = utm(payload);
  const channels = cleanChannels(payload);
  await sql`
    INSERT INTO bewild_lead_magnet_events
      (event_id, lead_id, event_name, lead_magnet_name, coupon, channels, source, page, visitor_id, session_id, result_key, product_interest, product_link, engaged_ms, elapsed_ms, scroll_depth, event_timestamp, event_timestamp_ist, utm_source, utm_medium, utm_campaign, utm_content, fbclid, payload)
    VALUES
      (${eventId}, ${leadId}, ${eventName}, ${cleanText(payload.lead_magnet_name) || DEFAULT_LEAD_MAGNET}, ${cleanText(payload.coupon)}, ${channels}::jsonb, ${cleanText(payload.source)}, ${cleanText(payload.page)}, ${visitorId(payload)}, ${cleanText(payload.session_id)}, ${cleanText(payload.result_key)}, ${cleanText(payload.product_interest)}, ${cleanText(payload.product_link)}, ${boundedNumber(payload.engaged_ms, 86400000)}, ${boundedNumber(payload.elapsed_ms, 86400000)}, ${boundedNumber(payload.scroll_depth, 100)}, ${eventTime(payload.timestamp)}::timestamptz, ${eventTime(payload.timestamp)}::timestamptz AT TIME ZONE 'Asia/Kolkata', ${tracking.utm_source}, ${tracking.utm_medium}, ${tracking.utm_campaign}, ${tracking.utm_content}, ${tracking.fbclid}, ${payload}::jsonb)
  `.execute();
  return eventId;
}

async function upsertFollowups(sql: any, payload: LeadPayload, leadId: string, leadMagnet: string, email: string, whatsapp: string, channels: string[]) {
  const followupType = followupTypeFor(leadMagnet);
  const dueAt = new Date().toISOString();
  const rows = channels
    .map((channel) => ({
      channel,
      recipient: channel === "email" ? email : whatsapp,
    }))
    .filter((row) => row.recipient);

  for (const row of rows) {
    const followupId = `${leadId}:${followupType}:${row.channel}`;
    const resetOnResubmission = leadMagnet === "rice_comfort_recipe_finder";
    await sql`
      INSERT INTO bewild_lead_magnet_followups
        (followup_id, lead_id, lead_magnet_name, followup_type, channel, recipient, due_at, due_at_ist, status, payload)
      VALUES
        (${followupId}, ${leadId}, ${leadMagnet}, ${followupType}, ${row.channel}, ${row.recipient}, ${dueAt}::timestamptz, ${dueAt}::timestamptz AT TIME ZONE 'Asia/Kolkata', 'pending', ${payload}::jsonb)
      ON CONFLICT (lead_id, followup_type, channel) DO UPDATE SET
        lead_magnet_name = EXCLUDED.lead_magnet_name,
        recipient = EXCLUDED.recipient,
        due_at = CASE
          WHEN ${resetOnResubmission} THEN EXCLUDED.due_at
          WHEN bewild_lead_magnet_followups.status = 'sent' THEN bewild_lead_magnet_followups.due_at
          ELSE EXCLUDED.due_at
        END,
        due_at_ist = CASE
          WHEN ${resetOnResubmission} THEN EXCLUDED.due_at_ist
          WHEN bewild_lead_magnet_followups.status = 'sent' THEN bewild_lead_magnet_followups.due_at_ist
          ELSE EXCLUDED.due_at_ist
        END,
        status = CASE
          WHEN ${resetOnResubmission} THEN 'pending'
          WHEN bewild_lead_magnet_followups.status = 'sent' THEN bewild_lead_magnet_followups.status
          ELSE 'pending'
        END,
        sent_at = CASE WHEN ${resetOnResubmission} THEN NULL ELSE bewild_lead_magnet_followups.sent_at END,
        sent_at_ist = CASE WHEN ${resetOnResubmission} THEN NULL ELSE bewild_lead_magnet_followups.sent_at_ist END,
        provider_message_id = CASE WHEN ${resetOnResubmission} THEN NULL ELSE bewild_lead_magnet_followups.provider_message_id END,
        error = CASE WHEN ${resetOnResubmission} THEN NULL ELSE bewild_lead_magnet_followups.error END,
        payload = EXCLUDED.payload,
        updated_at = NOW()
    `.execute();
  }

  return rows.length;
}

export async function main(body: LeadPayload, dry_run = false) {
  const payload = body || {};
  const sql = wmill.datatable();
  const eventType = cleanText(payload.event_type || "lead_submit");
  const leadMagnet = cleanText(payload.lead_magnet_name) || DEFAULT_LEAD_MAGNET;
  const email = cleanEmail(payload.email);
  const whatsapp = cleanPhone(payload.whatsapp || payload.phone);
  const providedLeadId = cleanText(payload.lead_id);
  const channels = cleanChannels(payload);
  const emailOptIn = consentFor("email", payload, channels);
  const whatsappOptIn = consentFor("whatsapp", payload, channels);
  const analyticsEventName = guideAnalyticsEventName(eventType);
  const analyticsVisitorId = visitorId(payload);
  const analyticsSessionId = cleanText(payload.session_id);
  const analyticsResultKey = cleanText(payload.result_key);

  if (analyticsEventName) {
    if (leadMagnet !== "rice_comfort_recipe_finder") {
      throw new Error("Guide analytics events are only supported for the rice recipe finder.");
    }
    if (!/^rice_[a-z0-9]+$/i.test(analyticsVisitorId) || analyticsVisitorId.length > 100) {
      throw new Error("A valid pseudonymous rice visitor ID is required.");
    }
    if (!/^ricegs_[a-z0-9]+$/i.test(analyticsSessionId) || analyticsSessionId.length > 100) {
      throw new Error("A valid guide session ID is required.");
    }
    if (!RICE_RESULT_KEYS.includes(analyticsResultKey as (typeof RICE_RESULT_KEYS)[number])) {
      throw new Error("A valid rice guide result is required.");
    }
    if (dry_run) {
      return {
        dry_run: true,
        event_type: eventType,
        event_name: analyticsEventName,
        visitor_id: analyticsVisitorId,
        session_id: analyticsSessionId,
        result_key: analyticsResultKey,
        engaged_ms: boundedNumber(payload.engaged_ms, 86400000),
        elapsed_ms: boundedNumber(payload.elapsed_ms, 86400000),
        scroll_depth: boundedNumber(payload.scroll_depth, 100),
      };
    }

    await createTables(sql);
    const analyticsLeadId = await findLeadIdForVisitor(sql, leadMagnet, analyticsVisitorId);
    const analyticsEventId = await insertEvent(sql, payload, analyticsLeadId, analyticsEventName);
    return {
      ok: true,
      event_type: eventType,
      event_name: analyticsEventName,
      event_id: analyticsEventId,
      lead_linked: Boolean(analyticsLeadId),
      result_key: analyticsResultKey,
    };
  }

  if (!email && !whatsapp && !providedLeadId) {
    throw new Error("Missing lead identity. Provide email, WhatsApp, or lead_id.");
  }
  if (email && !isValidEmail(email)) {
    throw new Error("Invalid email address.");
  }
  if (whatsapp && !isValidPhone(whatsapp)) {
    throw new Error("Invalid WhatsApp number.");
  }

  const leadId = providedLeadId || (await leadIdFor(leadMagnet, email, whatsapp));
  const dedupeKey = `${leadMagnet}:${email || whatsapp || leadId}`;
  const tracking = utm(payload);

  if (dry_run) {
    return {
      dry_run: true,
      event_type: eventType,
      lead_id: leadId,
      dedupe_key: dedupeKey,
      channels,
      shopify_sync_planned: shouldSyncShopifyLead(leadMagnet, eventType, email, payload.consent),
      shopify_tags: shopifyTagsForLead(leadMagnet, payload, channels),
      result_key: cleanText(payload.result_key),
      product_interest: cleanText(payload.product_interest),
    };
  }

  await createTables(sql);

  if (eventType === "product_click") {
    const eventId = await insertEvent(sql, payload, leadId, "ProductRecommendationClick");
    await sql`
      UPDATE bewild_lead_magnet_leads
      SET product_clicked = TRUE,
          product_click_count = COALESCE(product_click_count, 0) + 1,
          last_product_clicked_at = ${eventTime(payload.timestamp)}::timestamptz,
          last_product_clicked_at_ist = ${eventTime(payload.timestamp)}::timestamptz AT TIME ZONE 'Asia/Kolkata',
          updated_at = NOW()
      WHERE lead_id = ${leadId}
         OR dedupe_key = ${dedupeKey}
         OR (${email} <> '' AND email = ${email})
         OR (${whatsapp} <> '' AND whatsapp = ${whatsapp})
    `.execute();
    return { ok: true, event_type: eventType, lead_id: leadId, event_id: eventId };
  }

  if (payload.consent !== true) {
    throw new Error("Consent is required before storing and following up with the lead.");
  }

  const existingCouponClaim =
    leadMagnet === DEFAULT_LEAD_MAGNET ? await findExistingCouponClaim(sql, email, whatsapp) : null;

  if (existingCouponClaim) {
    const eventId = await insertEvent(sql, payload, existingCouponClaim.lead_id, "CouponAlreadyClaimed");
    let shopify_sync: ShopifySyncResult = { status: "skipped" };
    const sameEmailClaim = email && cleanEmail(existingCouponClaim.email) === email;
    if (sameEmailClaim && shouldSyncShopifyLead(leadMagnet, eventType, email, payload.consent)) {
      try {
        shopify_sync = await syncShopifyPopupCustomer({
          leadMagnet,
          eventType,
          payload,
          email,
          whatsapp,
          channels,
          emailOptIn,
          consent: payload.consent,
        });
      } catch (error) {
        shopify_sync = {
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        };
      }
      await recordShopifySync(sql, existingCouponClaim.lead_id, dedupeKey, shopify_sync);
    }

    return {
      ok: true,
      event_type: eventType,
      lead_id: existingCouponClaim.lead_id,
      event_id: eventId,
      already_claimed: true,
      claim_status: existingCouponClaim.delivery_status || "previously_requested",
      followups_created: 0,
      shopify_sync,
      result_key: "",
      product_interest: "",
    };
  }

  await sql`
    INSERT INTO bewild_lead_magnet_leads
      (lead_id, dedupe_key, lead_magnet_name, name, email, whatsapp, consent, coupon, channels, source, page, visitor_id, email_opt_in, whatsapp_opt_in, delivery_status, result_key, result_title, product_interest, product_link, answers, utm_source, utm_medium, utm_campaign, utm_content, fbclid, first_submitted_at, first_submitted_at_ist, last_submitted_at, last_submitted_at_ist, raw_payload)
    VALUES
      (${leadId}, ${dedupeKey}, ${leadMagnet}, ${cleanText(payload.name)}, ${email}, ${whatsapp}, ${Boolean(payload.consent)}, ${cleanText(payload.coupon)}, ${channels}::jsonb, ${cleanText(payload.source)}, ${cleanText(payload.page)}, ${visitorId(payload)}, ${emailOptIn}, ${whatsappOptIn}, ${channels.length ? "pending" : "not_required"}, ${cleanText(payload.result_key)}, ${cleanText(payload.result_title)}, ${cleanText(payload.product_interest)}, ${cleanText(payload.product_link)}, ${(payload.answers || {})}::jsonb, ${tracking.utm_source}, ${tracking.utm_medium}, ${tracking.utm_campaign}, ${tracking.utm_content}, ${tracking.fbclid}, ${eventTime(payload.timestamp)}::timestamptz, ${eventTime(payload.timestamp)}::timestamptz AT TIME ZONE 'Asia/Kolkata', ${eventTime(payload.timestamp)}::timestamptz, ${eventTime(payload.timestamp)}::timestamptz AT TIME ZONE 'Asia/Kolkata', ${payload}::jsonb)
    ON CONFLICT (dedupe_key) DO UPDATE SET
      name = EXCLUDED.name,
      email = COALESCE(NULLIF(EXCLUDED.email, ''), bewild_lead_magnet_leads.email),
      whatsapp = COALESCE(NULLIF(EXCLUDED.whatsapp, ''), bewild_lead_magnet_leads.whatsapp),
      consent = EXCLUDED.consent,
      coupon = COALESCE(NULLIF(EXCLUDED.coupon, ''), bewild_lead_magnet_leads.coupon),
      channels = EXCLUDED.channels,
      source = COALESCE(NULLIF(EXCLUDED.source, ''), bewild_lead_magnet_leads.source),
      page = COALESCE(NULLIF(EXCLUDED.page, ''), bewild_lead_magnet_leads.page),
      visitor_id = COALESCE(NULLIF(EXCLUDED.visitor_id, ''), bewild_lead_magnet_leads.visitor_id),
      email_opt_in = EXCLUDED.email_opt_in,
      whatsapp_opt_in = EXCLUDED.whatsapp_opt_in,
      delivery_status = CASE
        WHEN bewild_lead_magnet_leads.delivery_status = 'sent' THEN bewild_lead_magnet_leads.delivery_status
        ELSE EXCLUDED.delivery_status
      END,
      result_key = EXCLUDED.result_key,
      result_title = EXCLUDED.result_title,
      product_interest = EXCLUDED.product_interest,
      product_link = EXCLUDED.product_link,
      answers = EXCLUDED.answers,
      utm_source = COALESCE(NULLIF(EXCLUDED.utm_source, ''), bewild_lead_magnet_leads.utm_source),
      utm_medium = COALESCE(NULLIF(EXCLUDED.utm_medium, ''), bewild_lead_magnet_leads.utm_medium),
      utm_campaign = COALESCE(NULLIF(EXCLUDED.utm_campaign, ''), bewild_lead_magnet_leads.utm_campaign),
      utm_content = COALESCE(NULLIF(EXCLUDED.utm_content, ''), bewild_lead_magnet_leads.utm_content),
      fbclid = COALESCE(NULLIF(EXCLUDED.fbclid, ''), bewild_lead_magnet_leads.fbclid),
      last_submitted_at = EXCLUDED.last_submitted_at,
      last_submitted_at_ist = EXCLUDED.last_submitted_at_ist,
      raw_payload = EXCLUDED.raw_payload,
      updated_at = NOW()
  `.execute();

  const eventId = await insertEvent(sql, payload, leadId, "Lead");
  await insertEvent(sql, payload, leadId, "LeadMagnetComplete");
  const followups_created = await upsertFollowups(sql, payload, leadId, leadMagnet, email, whatsapp, channels);
  let shopify_sync: ShopifySyncResult = { status: "skipped" };

  if (shouldSyncShopifyLead(leadMagnet, eventType, email, payload.consent)) {
    try {
      shopify_sync = await syncShopifyPopupCustomer({
        leadMagnet,
        eventType,
        payload,
        email,
        whatsapp,
        channels,
        emailOptIn,
        consent: payload.consent,
      });
    } catch (error) {
      shopify_sync = {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      };
    }
    await recordShopifySync(sql, leadId, dedupeKey, shopify_sync);
  }

  return {
    ok: true,
    event_type: eventType,
    lead_id: leadId,
    event_id: eventId,
    followups_created,
    shopify_sync,
    result_key: cleanText(payload.result_key),
    product_interest: cleanText(payload.product_interest),
  };
}


