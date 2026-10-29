import * as wmill from "windmill-client";

type FollowupRow = {
  followup_id: string;
  lead_id: string;
  lead_magnet_name: string;
  channel: string;
  recipient: string;
  email: string | null;
  whatsapp: string | null;
  result_key: string | null;
  result_title: string | null;
  product_interest: string | null;
  payload: Record<string, unknown> | null;
};

type InteraktRecipient = {
  fullPhoneNumber?: string;
  countryCode?: string;
  phoneNumber?: string;
};

type RiceResult = {
  key: string;
  route: string;
  recipe: string;
  line: string;
};

const INTERAKT_API_KEY_PATH = "f/bewild_lead_magnet/interakt_api_key";
const INTERAKT_BASE_URL_PATH = "f/bewild_lead_magnet/interakt_base_url";
const INTERAKT_TEMPLATE_NAME_PATH = "f/bewild_lead_magnet/interakt_rice_guide_template_name";
const INTERAKT_CAMPAIGN_ID_PATH = "f/bewild_lead_magnet/interakt_rice_guide_campaign_id";
const RICE_GUIDE_DELIVERY_ENABLED_PATH = "f/bewild_lead_magnet/rice_guide_delivery_enabled";
const DEFAULT_TEMPLATE_NAME = "bewild_rice_guide_link_v2";
const SHOP_BASE_URL = "https://bewild.life";
const GUIDE_PATH = "/pages/rice-comfort-recipe-finder";

const RESULTS: Record<string, RiceResult> = {
  mysore_mallige_idli: {
    key: "mysore_mallige_idli",
    route: "Morning Magic",
    recipe: "Mysore Mallige Idli",
    line: "Airy, fermented idlis for a school morning that begins the night before.",
  },
  mysore_mallige_lemon_rice: {
    key: "mysore_mallige_lemon_rice",
    route: "Lunch Hero",
    recipe: "Mysore Mallige Lemon Rice",
    line: "Bright, tangy rice that travels well and comes together in 15 minutes.",
  },
  mysore_mallige_curd_rice: {
    key: "mysore_mallige_curd_rice",
    route: "Cool & Creamy",
    recipe: "Mysore Mallige Curd Rice",
    line: "A cool, creamy bowl for a hot day, a lunchbox, or an easy breakfast.",
  },
  mysore_mallige_ghee_rice: {
    key: "mysore_mallige_ghee_rice",
    route: "Simple Luxury",
    recipe: "Mysore Mallige Ghee Rice",
    line: "Fragrant, golden rice that lets the natural aroma of Mallige lead the meal.",
  },
  mysore_mallige_biryani: {
    key: "mysore_mallige_biryani",
    route: "Weekend Royalty",
    recipe: "Mysore Mallige Biryani",
    line: "A weekend pot whose jasmine-like aroma fills the house when the dum opens.",
  },
  navara_red_rice_pulao: {
    key: "navara_red_rice_pulao",
    route: "Deep & Earthy",
    recipe: "Navara Red Rice Pulao",
    line: "One pot, whole spices, and an earthy red grain with a story.",
  },
  navara_red_rice_kheer: {
    key: "navara_red_rice_kheer",
    route: "Sweet Heritage",
    recipe: "Navara Red Rice Kheer",
    line: "A slow weekend kheer that takes on a natural blush-pink colour.",
  },
  navara_rice_dosa: {
    key: "navara_rice_dosa",
    route: "Crispy Morning",
    recipe: "Navara Rice Dosa",
    line: "Thin, naturally reddish-brown dosas with an earthy, crisp finish.",
  },
  navara_paal_kanji: {
    key: "navara_paal_kanji",
    route: "Gentle & Nourishing",
    recipe: "Navara Paal Kanji",
    line: "A silky, warm milk porridge for the morning that needs something quiet.",
  },
  navara_coconut_porridge: {
    key: "navara_coconut_porridge",
    route: "Coconut Comfort",
    recipe: "Coconut Milk Red Rice Porridge",
    line: "Creamy coconut milk, Navara red rice, and cowpeas in one warm bowl.",
  },
  navara_red_rice_khichdi: {
    key: "navara_red_rice_khichdi",
    route: "One-Pot Wonder",
    recipe: "Navara Red Rice Khichdi",
    line: "Familiar rice-and-dal comfort made with an earthy heritage grain.",
  },
};

const LEGACY_RESULT_KEYS: Record<string, string> = {
  navara_rice_kanji: "navara_paal_kanji",
};

function cleanText(value: unknown) {
  return String(value || "").trim();
}

async function deliveryEnabled() {
  const value = await wmill.getVariable(RICE_GUIDE_DELIVERY_ENABLED_PATH).catch(() => "false");
  return ["1", "true", "yes", "enabled"].includes(cleanText(value).toLowerCase());
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
    throw new Error("No usable WhatsApp phone found for this rice guide follow-up.");
  }
}

function resultFor(row: FollowupRow): RiceResult {
  const fromRow = cleanText(row.result_key);
  const fromPayload = cleanText(row.payload?.result_key || row.payload?.recipe_result);
  const normalizedRow = LEGACY_RESULT_KEYS[fromRow] || fromRow;
  const normalizedPayload = LEGACY_RESULT_KEYS[fromPayload] || fromPayload;
  return RESULTS[normalizedRow] || RESULTS[normalizedPayload] || RESULTS.navara_red_rice_khichdi;
}

function guideContext(row: FollowupRow) {
  const payload = row.payload || {};
  const answers = (payload.answers && typeof payload.answers === "object" ? payload.answers : {}) as Record<string, unknown>;
  return {
    cook_identity: cleanText(payload.cook_identity || answers.cook_identity),
    household: cleanText(payload.household || answers.household),
    rice_relationship: cleanText(payload.rice_relationship || answers.rice_relationship),
  };
}

function guideUrl(result: RiceResult, row?: FollowupRow) {
  const params = new URLSearchParams({ guide: "1", result: result.key });
  if (row) {
    const context = guideContext(row);
    Object.entries(context).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
  }
  return `${SHOP_BASE_URL}${GUIDE_PATH}?${params.toString()}#rice-guide`;
}

function renderMessage(result: RiceResult, row?: FollowupRow) {
  return [
    "Your Bewild rice guide is ready.",
    "",
    `Start with: ${result.recipe}`,
    result.line,
    "",
    "The guide includes 11 recipes, honest prep time, complete methods, and the rice to use.",
    `Open it here: ${guideUrl(result, row)}`,
  ].join("\n");
}

function templateBodyValues(result: RiceResult) {
  return [result.recipe, result.line];
}

function templateButtonValues(result: RiceResult) {
  return { "0": [result.key] };
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
      l.email,
      l.whatsapp,
      l.result_key,
      l.result_title,
      l.product_interest
    FROM bewild_lead_magnet_followups f
    LEFT JOIN bewild_lead_magnet_leads l ON l.lead_id = f.lead_id
    WHERE f.lead_magnet_name = 'rice_comfort_recipe_finder'
      AND f.followup_type = 'recipe_guide_delivery'
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
  result: RiceResult;
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
    callbackData: `bewild_rice_guide:${params.row.followup_id}`,
    template_category: "marketing",
    type: "Template",
    template: {
      name: params.templateName,
      languageCode: "en",
      bodyValues: templateBodyValues(params.result),
      buttonValues: templateButtonValues(params.result),
    },
  };
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
    throw new Error(`Interakt rice guide send failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return { request: body, response: payload };
}

export async function main(dry_run = true, limit = 25, debug_followup_id = "") {
  const sql = wmill.datatable();
  const enabled = await deliveryEnabled();
  if (!dry_run && !enabled) {
    return {
      dry_run,
      status: "delivery_disabled",
      enable_variable: RICE_GUIDE_DELIVERY_ENABLED_PATH,
    };
  }

  const templateName =
    (await wmill.getVariable(INTERAKT_TEMPLATE_NAME_PATH).catch(() => "")) ||
    DEFAULT_TEMPLATE_NAME;
  const campaignId = await wmill.getVariable(INTERAKT_CAMPAIGN_ID_PATH).catch(() => "");
  let rows = await pendingWhatsappFollowups(sql, Number(limit || 25));
  if (debug_followup_id) rows = rows.filter((row) => row.followup_id === debug_followup_id);

  if (!rows.length) {
    return { dry_run, status: "no_pending_whatsapp_rice_guide_followups" };
  }

  const planned: any[] = [];
  const sent: any[] = [];
  const failed: any[] = [];

  for (const row of rows) {
    const result = resultFor(row);
    const preview = {
      followup_id: row.followup_id,
      lead_id: row.lead_id,
      recipient_tail: cleanText(row.recipient).slice(-4),
      template_name: templateName,
      campaign_id_present: Boolean(campaignId),
      result_key: result.key,
      recipe: result.recipe,
      route: result.route,
      guide_url: guideUrl(result, row),
      body_values: templateBodyValues(result),
      button_values: templateButtonValues(result),
      preview_message: renderMessage(result, row),
    };

    if (dry_run) {
      planned.push(preview);
      continue;
    }

    try {
      const interakt = await sendInteraktTemplate({ row, result, templateName, campaignId });
      const providerMessageId = cleanText((interakt.response as any)?.id || (interakt.response as any)?.message_id);
      await markFollowup(sql, row, "sent", {
        provider: "interakt",
        provider_message_id: providerMessageId,
        result_key: result.key,
        recipe: result.recipe,
        guide_url: guideUrl(result, row),
        interakt_response: interakt.response,
      });
      sent.push({ ...preview, provider_message_id: providerMessageId || null });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await markFollowup(sql, row, "failed", {
        provider: "interakt",
        result_key: result.key,
        recipe: result.recipe,
        guide_url: guideUrl(result, row),
      }, message);
      failed.push({ ...preview, error: message });
    }
  }

  return {
    dry_run,
    status: dry_run ? "planned" : failed.length ? "completed_with_failures" : "sent",
    checked: rows.length,
    planned,
    sent,
    failed,
  };
}
