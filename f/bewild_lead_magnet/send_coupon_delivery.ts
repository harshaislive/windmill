import * as wmill from "windmill-client";

type FollowupRow = {
  followup_id: string;
  lead_id: string;
  lead_magnet_name: string;
  channel: string;
  recipient: string;
  coupon: string | null;
  email: string | null;
  whatsapp: string | null;
  payload: Record<string, unknown> | null;
};

type InteraktRecipient = {
  fullPhoneNumber?: string;
  countryCode?: string;
  phoneNumber?: string;
};

type ProductNudge = {
  handle: string;
  name: string;
  line: string;
};

const INTERAKT_API_KEY_PATH = "f/bewild_lead_magnet/interakt_api_key";
const INTERAKT_BASE_URL_PATH = "f/bewild_lead_magnet/interakt_base_url";
const INTERAKT_TEMPLATE_NAME_PATH = "f/bewild_lead_magnet/interakt_coupon_template_name";
const INTERAKT_CAMPAIGN_ID_PATH = "f/bewild_lead_magnet/interakt_coupon_campaign_id";
const COUPON_DELIVERY_ENABLED_PATH = "f/bewild_lead_magnet/coupon_delivery_enabled";
const DEFAULT_TEMPLATE_NAME = "bewild_bw10_coupon_product_v1";
const PRODUCT_CTA_TEMPLATE_NAMES = new Set(["bewild_bw10_coupon_product_cta_v2"]);
const DEFAULT_COUPON = "BW10";
const SHOP_BASE_URL = "https://bewild.life";

const PRODUCT_NUDGES: ProductNudge[] = [
  {
    handle: "mysore-mallige-rice-5kg-protein-fibre-rich-unpolished-100-natural",
    name: "Mysore Mallige Rice",
    line: "Soft, aromatic rice for everyday dal, curd rice, lemon rice, and school dabbas.",
  },
  {
    handle: "navara-rice",
    name: "Navara Red Rice",
    line: "A grounding red rice for slower meals, kanji, and comfort bowls.",
  },
  {
    handle: "medium-roasted-whole-beans",
    name: "Medium Roast Canephora Coffee",
    line: "A forest-grown coffee for mornings that need depth without noise.",
  },
  {
    handle: "connected-coffee-drip-bags-canephora-coffee-robusta-medium-roast-anoxic-naturals",
    name: "Connected Coffee Drip Bags",
    line: "An easy way to carry Bewild coffee to office, travel, or slow mornings.",
  },
  {
    handle: "multi-floral-raw-honey-500g-apis-dorsata-wild-purely-sourced",
    name: "Multi Floral Raw Honey",
    line: "Raw, unblended honey for toast, warm drinks, or a spoonful after meals.",
  },
  {
    handle: "peanut-butter-crunchy-250g-friends-of-beforest-slow-roasted-naturally-delicious",
    name: "Crunchy Peanut Butter",
    line: "Slow-roasted peanut butter for breakfast, snack boxes, and quick toast.",
  },
  {
    handle: "ragi-laddu-250g-traditionally-made-sprouted-millet-goodness",
    name: "Ragi Laddu",
    line: "A small-batch millet sweet for tea time, travel, or a better snack drawer.",
  },
  {
    handle: "groundnut-oil-500ml-sustainably-crafted-100-natural-wood-pressed-single-filtered",
    name: "Wood-pressed Groundnut Oil",
    line: "Wood-pressed groundnut oil for everyday cooking with a cleaner pantry story.",
  },
  {
    handle: "green-elaichi-green-cardamom-75g-sundried-extra-bold",
    name: "Green Cardamom",
    line: "Forest-grown elaichi for chai, sweets, and the quiet lift in home cooking.",
  },
  {
    handle: "tomato-pickle-250g-traditionally-crafted-slow-cured",
    name: "Tomato Pickle",
    line: "A traditional pantry companion for rice, curd rice, rotis, and rushed meals.",
  },
];

function cleanText(value: unknown) {
  return String(value || "").trim();
}

async function couponDeliveryEnabled() {
  const value = await wmill.getVariable(COUPON_DELIVERY_ENABLED_PATH).catch(() => "false");
  return ["1", "true", "yes", "enabled"].includes(cleanText(value).toLowerCase());
}

function productUrl(handle: string) {
  return `${SHOP_BASE_URL}/products/${handle}`;
}

function productJsonUrl(handle: string) {
  return `${productUrl(handle)}.js`;
}

function interaktRecipient(rawPhone: string): InteraktRecipient {
  const cleaned = cleanText(rawPhone).replace(/[^\d+]/g, "");
  if (!cleaned) return {};
  const digits = cleaned.replace(/\D/g, "");
  if (cleaned.startsWith("+")) return { fullPhoneNumber: digits };
  if (digits.length === 10) return { countryCode: "+91", phoneNumber: digits };
  if (digits.length === 12 && digits.startsWith("91")) return { fullPhoneNumber: digits };
  return { fullPhoneNumber: digits };
}

function assertRecipientReady(recipient: InteraktRecipient, rawPhone: string) {
  if (!rawPhone || (!recipient.fullPhoneNumber && !(recipient.countryCode && recipient.phoneNumber))) {
    throw new Error("No usable WhatsApp phone found for this coupon follow-up.");
  }
}

function hashIndex(seed: string, size: number) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return size ? hash % size : 0;
}

async function isProductAvailable(product: ProductNudge) {
  const response = await fetch(productJsonUrl(product.handle), { headers: { accept: "application/json" } });
  if (!response.ok) return false;
  const payload = await response.json().catch(() => null);
  return Boolean(payload?.available || (payload?.variants || []).some((variant: any) => variant?.available === true));
}

async function activeProducts() {
  const checks = await Promise.all(
    PRODUCT_NUDGES.map(async (product) => ({
      product,
      available: await isProductAvailable(product).catch(() => false),
    })),
  );
  return checks.filter((check) => check.available).map((check) => check.product);
}

function chooseProduct(products: ProductNudge[], seed: string) {
  if (!products.length) throw new Error("No active Bewild products available for BW10 coupon delivery.");
  return products[hashIndex(seed, products.length)];
}

function renderMessage(product: ProductNudge, coupon: string) {
  return [
    `Your Bewild first-order coupon is here: ${coupon}`,
    "",
    `A good place to begin: ${product.name}.`,
    product.line,
    "",
    `Use ${coupon} for 10% off your first order.`,
    `Shop here: ${productUrl(product.handle)}`,
  ].join("\n");
}

function templateBodyValues(templateName: string, product: ProductNudge, coupon: string) {
  if (PRODUCT_CTA_TEMPLATE_NAMES.has(templateName)) {
    return [product.name, product.line, coupon];
  }
  return [product.name, product.line, coupon, productUrl(product.handle)];
}

function templateButtonValues(templateName: string, product: ProductNudge) {
  if (PRODUCT_CTA_TEMPLATE_NAMES.has(templateName)) {
    return { "0": [product.handle] };
  }
  return null;
}

async function pendingWhatsappFollowups(sql: any, limit: number): Promise<FollowupRow[]> {
  const result = await sql`
    SELECT
      f.followup_id,
      f.lead_id,
      f.lead_magnet_name,
      f.channel,
      f.recipient,
      f.payload,
      l.coupon,
      l.email,
      l.whatsapp
    FROM bewild_lead_magnet_followups f
    LEFT JOIN bewild_lead_magnet_leads l ON l.lead_id = f.lead_id
    WHERE f.lead_magnet_name = 'bewild_coupon_popup'
      AND f.followup_type = 'coupon_delivery'
      AND f.channel = 'whatsapp'
      AND f.status IN ('pending', 'retry')
      AND f.due_at <= NOW()
    ORDER BY f.due_at ASC
    LIMIT ${Math.max(1, Math.min(Number(limit || 25), 100))}
  `.execute();
  return Array.isArray(result) ? result : result.rows || [];
}

async function markFollowup(sql: any, row: FollowupRow, status: string, detail: Record<string, unknown>, error = "") {
  const sentAt = status === "sent" ? new Date().toISOString() : null;
  await sql`
    UPDATE bewild_lead_magnet_followups
    SET status = ${status},
        sent_at = COALESCE(${sentAt}::timestamptz, sent_at),
        sent_at_ist = COALESCE(${sentAt}::timestamptz AT TIME ZONE 'Asia/Kolkata', sent_at_ist),
        provider_message_id = COALESCE(NULLIF(${cleanText(detail.provider_message_id)}, ''), provider_message_id),
        error = ${error},
        payload = COALESCE(payload, '{}'::jsonb) || ${detail}::jsonb,
        updated_at = NOW()
    WHERE followup_id = ${row.followup_id}
  `.execute();

  await sql`
    UPDATE bewild_lead_magnet_leads
    SET delivery_status = CASE
          WHEN ${status} = 'sent' THEN 'sent'
          WHEN delivery_status = 'sent' THEN delivery_status
          ELSE ${status}
        END,
        updated_at = NOW()
    WHERE lead_id = ${row.lead_id}
  `.execute();
}

async function sendInteraktTemplate(params: {
  row: FollowupRow;
  product: ProductNudge;
  coupon: string;
  templateName: string;
  campaignId: string;
}) {
  const recipient = interaktRecipient(params.row.recipient || params.row.whatsapp || "");
  assertRecipientReady(recipient, params.row.recipient || params.row.whatsapp || "");

  const apiKey = await wmill.getVariable(INTERAKT_API_KEY_PATH);
  if (!apiKey || apiKey.toLowerCase().includes("dummy")) {
    throw new Error(`Interakt API key is missing or still dummy at ${INTERAKT_API_KEY_PATH}.`);
  }
  const baseUrl = (await wmill.getVariable(INTERAKT_BASE_URL_PATH).catch(() => "https://api.interakt.ai")) || "https://api.interakt.ai";
  const authorization = apiKey.toLowerCase().startsWith("basic ") ? apiKey : `Basic ${apiKey}`;
  const body: Record<string, unknown> = {
    ...recipient,
    callbackData: `bewild_coupon:${params.row.followup_id}`,
    template_category: "marketing",
    type: "Template",
    template: {
      name: params.templateName,
      languageCode: "en",
      bodyValues: templateBodyValues(params.templateName, params.product, params.coupon),
    },
  };
  const buttonValues = templateButtonValues(params.templateName, params.product);
  if (buttonValues) {
    (body.template as Record<string, unknown>).buttonValues = buttonValues;
  }
  if (params.campaignId) body.campaignId = params.campaignId;

  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/v1/public/message/`, {
    method: "POST",
    headers: {
      authorization,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.result === false) {
    throw new Error(`Interakt BW10 coupon send failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return { request: body, response: payload };
}

export async function main(dry_run = true, limit = 25, debug_followup_id = "") {
  const sql = wmill.datatable();
  const deliveryEnabled = await couponDeliveryEnabled();
  if (!dry_run && !deliveryEnabled) {
    return {
      dry_run,
      status: "delivery_disabled",
      enable_variable: COUPON_DELIVERY_ENABLED_PATH,
    };
  }

  const templateName =
    (await wmill.getVariable(INTERAKT_TEMPLATE_NAME_PATH).catch(() => "")) ||
    DEFAULT_TEMPLATE_NAME;
  const campaignId = await wmill.getVariable(INTERAKT_CAMPAIGN_ID_PATH).catch(() => "");
  const active = await activeProducts();
  let rows = await pendingWhatsappFollowups(sql, Number(limit || 25));
  if (debug_followup_id) rows = rows.filter((row) => row.followup_id === debug_followup_id);

  if (!rows.length) {
    return { dry_run, status: "no_pending_whatsapp_coupon_followups", active_product_count: active.length };
  }

  const sent: any[] = [];
  const failed: any[] = [];
  const planned: any[] = [];

  for (const row of rows) {
    const coupon = cleanText(row.coupon) || DEFAULT_COUPON;
    const product = chooseProduct(active, row.followup_id || row.lead_id);
    const preview = {
      followup_id: row.followup_id,
      lead_id: row.lead_id,
      recipient_tail: cleanText(row.recipient).slice(-4),
      template_name: templateName,
      campaign_id_present: Boolean(campaignId),
      coupon,
      product: {
        handle: product.handle,
        name: product.name,
        url: productUrl(product.handle),
      },
      body_values: templateBodyValues(templateName, product, coupon),
      button_values: templateButtonValues(templateName, product),
      preview_message: renderMessage(product, coupon),
    };

    if (dry_run) {
      planned.push(preview);
      continue;
    }

    try {
      const interakt = await sendInteraktTemplate({ row, product, coupon, templateName, campaignId });
      const providerMessageId = cleanText((interakt.response as any)?.id || (interakt.response as any)?.message_id);
      await markFollowup(sql, row, "sent", {
        provider: "interakt",
        provider_message_id: providerMessageId,
        selected_product_handle: product.handle,
        selected_product_name: product.name,
        selected_product_url: productUrl(product.handle),
        coupon,
        interakt_response: interakt.response,
      });
      sent.push({ ...preview, provider_message_id: providerMessageId || null });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await markFollowup(sql, row, "failed", {
        provider: "interakt",
        selected_product_handle: product.handle,
        selected_product_name: product.name,
        selected_product_url: productUrl(product.handle),
        coupon,
      }, message);
      failed.push({ ...preview, error: message });
    }
  }

  return {
    dry_run,
    status: dry_run ? "planned" : failed.length ? "completed_with_failures" : "sent",
    active_product_count: active.length,
    checked: rows.length,
    planned,
    sent,
    failed,
  };
}
