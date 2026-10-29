import * as wmill from "windmill-client";
import { createHmac } from "node:crypto";

type Channel = "email" | "whatsapp";
type Branch = "all" | "mysore" | "navara";

type Lead = {
  lead_id: string;
  name: string | null;
  email: string | null;
  whatsapp: string | null;
  email_opt_in: boolean;
  whatsapp_opt_in: boolean;
  result_key: string | null;
  result_title: string | null;
  product_interest: string | null;
  first_submitted_at: string;
  shopify_customer_id: string | null;
};

type DispatchRow = {
  lead_id: string;
  stage: string;
  channel: Channel;
  status: string;
  attempts: number;
  dispatched_at: string | null;
};

type ShopifyCustomer = {
  id: string;
  tags: string[];
  emailMarketingConsent?: { marketingState?: string } | null;
  orders?: {
    nodes?: Array<{
      cancelledAt?: string | null;
      processedAt?: string | null;
      lineItems?: { nodes?: Array<{ product?: { handle?: string | null } | null }> };
    }>;
  };
};

type ResultContent = {
  key: string;
  recipe: string;
  tip: string;
  nextKey: string;
  nextRecipe: string;
  branch: "mysore" | "navara";
};

type Stage = {
  key: string;
  day: number;
  branch: Branch;
  emailTag: string;
  emailSentTag: string;
  whatsappTemplate: string;
};

const SHOPIFY_ADMIN_TOKEN_PATH = "f/bewild_lead_magnet/shopify_admin_access_token";
const SHOPIFY_SHOP_DOMAIN_PATH = "f/bewild_lead_magnet/shopify_shop_domain";
const INTERAKT_API_KEY_PATH = "f/bewild_lead_magnet/interakt_api_key";
const INTERAKT_BASE_URL_PATH = "f/bewild_lead_magnet/interakt_base_url";
const DELIVERY_ENABLED_PATH = "f/bewild_lead_magnet/rice_nurture_delivery_enabled";
const MATON_ORDERS_API_KEY_PATH = "f/bewild_lead_magnet/maton_api_key_orders";
const UNSUBSCRIBE_SECRET_PATH = "f/bewild_lead_magnet/rice_nurture_unsubscribe_secret";
const MATON_ORDERS_CONNECTION_ID = "8ce57989-8cae-42f7-bc76-d28d9caf718f";
const MATON_BASE_URL = "https://api.maton.ai";
const EMAIL_FROM = "Bewild <orders@bewild.life>";
const UNSUBSCRIBE_BASE_URL = "https://windmill.devsharsha.live/api/r/bewild/rice/unsubscribe";
const GUIDE_BASE_URL = "https://bewild.life/pages/rice-comfort-recipe-finder";
const SHOPIFY_API_VERSION = "2026-01";
const BUYER_EXIT_TAG = "rice_nurture_buyer_exit";
const MIN_STAGE_GAP_DAYS = 5;
const RICE_PRODUCT_HANDLES = new Set([
  "mysore-mallige-rice-5kg-protein-fibre-rich-unpolished-100-natural",
  "navara-rice",
]);

const STAGES: Stage[] = [
  { key: "d03", day: 3, branch: "all", emailTag: "rice_nurture_d03_email_due", emailSentTag: "rice_nurture_d03_email_sent", whatsappTemplate: "bewild_rice_recipe_return_v1" },
  { key: "d08", day: 8, branch: "all", emailTag: "rice_nurture_d08_email_due", emailSentTag: "rice_nurture_d08_email_sent", whatsappTemplate: "bewild_rice_cooking_note_v1" },
  { key: "d14_mysore", day: 14, branch: "mysore", emailTag: "rice_nurture_d14_mysore_email_due", emailSentTag: "rice_nurture_d14_mysore_email_sent", whatsappTemplate: "bewild_rice_grain_story_mysore_v1" },
  { key: "d14_navara", day: 14, branch: "navara", emailTag: "rice_nurture_d14_navara_email_due", emailSentTag: "rice_nurture_d14_navara_email_sent", whatsappTemplate: "bewild_rice_grain_story_navara_v1" },
  { key: "d21", day: 21, branch: "all", emailTag: "rice_nurture_d21_email_due", emailSentTag: "rice_nurture_d21_email_sent", whatsappTemplate: "bewild_rice_next_recipe_v1" },
  { key: "d28_mysore", day: 28, branch: "mysore", emailTag: "rice_nurture_d28_mysore_email_due", emailSentTag: "rice_nurture_d28_mysore_email_sent", whatsappTemplate: "bewild_rice_product_mysore_v1" },
  { key: "d28_navara", day: 28, branch: "navara", emailTag: "rice_nurture_d28_navara_email_due", emailSentTag: "rice_nurture_d28_navara_email_sent", whatsappTemplate: "bewild_rice_product_navara_v1" },
];

const RESULTS: Record<string, ResultContent> = {
  mysore_mallige_idli: {
    key: "mysore_mallige_idli", recipe: "Mysore Mallige Idli",
    tip: "Add water to the urad dal in very small amounts while grinding. The batter should be thick, white, and fluffy rather than runny.",
    nextKey: "mysore_mallige_curd_rice", nextRecipe: "Mysore Mallige Curd Rice", branch: "mysore",
  },
  mysore_mallige_lemon_rice: {
    key: "mysore_mallige_lemon_rice", recipe: "Mysore Mallige Lemon Rice",
    tip: "Always add lemon juice off the heat so it stays bright rather than turning bitter.",
    nextKey: "mysore_mallige_ghee_rice", nextRecipe: "Mysore Mallige Ghee Rice", branch: "mysore",
  },
  mysore_mallige_curd_rice: {
    key: "mysore_mallige_curd_rice", recipe: "Mysore Mallige Curd Rice",
    tip: "Mix curd into rice while it is slightly warm, not hot or cold. Add milk when the curd is sour or the mixture becomes too thick.",
    nextKey: "mysore_mallige_lemon_rice", nextRecipe: "Mysore Mallige Lemon Rice", branch: "mysore",
  },
  mysore_mallige_ghee_rice: {
    key: "mysore_mallige_ghee_rice", recipe: "Mysore Mallige Ghee Rice",
    tip: "Use 1.75 cups water per cup of soaked rice and keep the lid closed during the 5-minute rest.",
    nextKey: "mysore_mallige_biryani", nextRecipe: "Mysore Mallige Biryani", branch: "mysore",
  },
  mysore_mallige_biryani: {
    key: "mysore_mallige_biryani", recipe: "Mysore Mallige Biryani",
    tip: "Do not rush the onions. A tight lid or a clean kitchen towel under the lid helps keep the steam inside.",
    nextKey: "mysore_mallige_ghee_rice", nextRecipe: "Mysore Mallige Ghee Rice", branch: "mysore",
  },
  navara_red_rice_pulao: {
    key: "navara_red_rice_pulao", recipe: "Navara Red Rice Pulao",
    tip: "Give the onions their full cooking time. The 30-minute soak helps the grains cook evenly.",
    nextKey: "navara_red_rice_khichdi", nextRecipe: "Navara Red Rice Khichdi", branch: "navara",
  },
  navara_red_rice_kheer: {
    key: "navara_red_rice_kheer", recipe: "Navara Red Rice Kheer",
    tip: "Add jaggery only after removing the milk from the heat to reduce the chance of curdling.",
    nextKey: "navara_paal_kanji", nextRecipe: "Navara Paal Kanji", branch: "navara",
  },
  navara_rice_dosa: {
    key: "navara_rice_dosa", recipe: "Navara Rice Dosa",
    tip: "Bring the batter to room temperature and use a well-seasoned tawa for an even spread.",
    nextKey: "navara_red_rice_khichdi", nextRecipe: "Navara Red Rice Khichdi", branch: "navara",
  },
  navara_paal_kanji: {
    key: "navara_paal_kanji", recipe: "Navara Paal Kanji",
    tip: "Keep the heat low and stir frequently. Add warm milk if it thickens before the rice is soft.",
    nextKey: "navara_red_rice_kheer", nextRecipe: "Navara Red Rice Kheer", branch: "navara",
  },
  navara_coconut_porridge: {
    key: "navara_coconut_porridge", recipe: "Coconut Milk Red Rice Porridge",
    tip: "Add the final coconut milk off the heat to keep its fresh sweetness.",
    nextKey: "navara_red_rice_pulao", nextRecipe: "Navara Red Rice Pulao", branch: "navara",
  },
  navara_red_rice_khichdi: {
    key: "navara_red_rice_khichdi", recipe: "Navara Red Rice Khichdi",
    tip: "Adjust with hot water after cooking until it reaches a soft porridge consistency.",
    nextKey: "navara_red_rice_pulao", nextRecipe: "Navara Red Rice Pulao", branch: "navara",
  },
};

const LEGACY_KEYS: Record<string, string> = { navara_rice_kanji: "navara_paal_kanji" };

function clean(value: unknown) {
  return String(value || "").trim();
}

function rowsOf<T>(value: any): T[] {
  return Array.isArray(value) ? value : value?.rows || [];
}

function enabled(value: unknown) {
  return ["1", "true", "yes", "enabled"].includes(clean(value).toLowerCase());
}

function parseStages(csv: string) {
  const requested = new Set(clean(csv).split(",").map((value) => value.trim()).filter(Boolean));
  return STAGES.filter((stage) => requested.has(stage.key));
}

function resultFor(lead: Lead): ResultContent | null {
  const raw = clean(lead.result_key);
  const key = LEGACY_KEYS[raw] || raw;
  return RESULTS[key] || null;
}

function ageInDays(firstSubmittedAt: string, now: Date) {
  return Math.floor((now.getTime() - new Date(firstSubmittedAt).getTime()) / 86_400_000);
}

function stageMatches(stage: Stage, result: ResultContent) {
  return stage.branch === "all" || stage.branch === result.branch;
}

function timeParts(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function istMinuteOfDay(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);
  return hour * 60 + minute;
}

function istDateString(now: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
}

function catchupOffset(now: Date, startDate: string) {
  const start = new Date(`${startDate}T00:00:00+05:30`);
  const today = new Date(`${istDateString(now)}T00:00:00+05:30`);
  return Math.floor((today.getTime() - start.getTime()) / 86_400_000);
}

function catchupStartMs(startDate: string) {
  return new Date(`${startDate}T00:00:00+05:30`).getTime();
}

function addIstDays(startDate: string, days: number) {
  return istDateString(new Date(catchupStartMs(startDate) + days * 86_400_000));
}

function stageDueMs(lead: Lead, stage: Stage) {
  return new Date(lead.first_submitted_at).getTime() + stage.day * 86_400_000;
}

function stableBucket(value: string, bucketCount: number) {
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash % Math.max(1, bucketCount);
}

function insideWindow(now: Date, start: string, end: string) {
  const current = istMinuteOfDay(now);
  return current >= timeParts(start) && current <= timeParts(end);
}

function interaktRecipient(rawPhone: string) {
  const cleaned = clean(rawPhone).replace(/[^\d+]/g, "");
  const digits = cleaned.replace(/\D/g, "");
  if (!digits) return {};
  if (cleaned.startsWith("+")) return { fullPhoneNumber: digits };
  if (digits.length === 10) return { countryCode: "+91", phoneNumber: digits };
  return { fullPhoneNumber: digits };
}

async function ensureTable(sql: any) {
  await sql`
    CREATE TABLE IF NOT EXISTS bewild_rice_nurture_dispatches (
      lead_id TEXT NOT NULL,
      stage TEXT NOT NULL,
      channel TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      due_at TIMESTAMPTZ,
      dispatched_at TIMESTAMPTZ,
      provider_message_id TEXT,
      error TEXT,
      detail JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (lead_id, stage, channel)
    )
  `.execute();
  await sql`CREATE INDEX IF NOT EXISTS bewild_rice_nurture_status_idx ON bewild_rice_nurture_dispatches (status, due_at)`.execute();
}

async function shopifyGraphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const token = await wmill.getVariable(SHOPIFY_ADMIN_TOKEN_PATH);
  const shop = await wmill.getVariable(SHOPIFY_SHOP_DOMAIN_PATH);
  const response = await fetch(`https://${clean(shop).replace(/^https?:\/\//, "").replace(/\/+$/, "")}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": token, "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.errors?.length) throw new Error(`Shopify GraphQL failed: ${response.status} ${JSON.stringify(payload?.errors || payload)}`);
  return payload.data as T;
}

async function customerFor(lead: Lead): Promise<ShopifyCustomer | null> {
  const customerFields = `
    id tags
    emailMarketingConsent { marketingState }
    orders(first: 20, reverse: true) {
      nodes { cancelledAt processedAt lineItems(first: 50) { nodes { product { handle } } } }
    }
  `;
  if (lead.shopify_customer_id) {
    const data = await shopifyGraphql<{ customer: ShopifyCustomer | null }>(
      `query NurtureCustomer($id: ID!) { customer(id: $id) { ${customerFields} } }`,
      { id: lead.shopify_customer_id },
    );
    if (data.customer) return data.customer;
  }
  if (!lead.email) return null;
  const data = await shopifyGraphql<{ customers: { nodes: ShopifyCustomer[] } }>(
    `query NurtureCustomerByEmail($query: String!) { customers(first: 1, query: $query) { nodes { ${customerFields} } } }`,
    { query: `email:${lead.email}` },
  );
  return data.customers.nodes[0] || null;
}

function boughtRice(customer: ShopifyCustomer, firstSubmittedAt: string) {
  const anchor = new Date(firstSubmittedAt).getTime();
  return (customer.orders?.nodes || []).some((order) => {
    if (order.cancelledAt || !order.processedAt || new Date(order.processedAt).getTime() < anchor) return false;
    return (order.lineItems?.nodes || []).some((line) => RICE_PRODUCT_HANDLES.has(clean(line.product?.handle)));
  });
}

async function addCustomerTag(customerId: string, tag: string) {
  const data = await shopifyGraphql<{ tagsAdd: { userErrors: Array<{ message?: string }> } }>(
    `mutation AddNurtureTag($id: ID!, $tags: [String!]!) { tagsAdd(id: $id, tags: $tags) { userErrors { message } } }`,
    { id: customerId, tags: [tag] },
  );
  const message = (data.tagsAdd.userErrors || []).map((error) => error.message).filter(Boolean).join("; ");
  if (message) throw new Error(message);
}

async function dispatchRows(sql: any, leadId: string, channel: Channel): Promise<DispatchRow[]> {
  return rowsOf<DispatchRow>(await sql`
    SELECT lead_id, stage, channel, status, attempts, dispatched_at
    FROM bewild_rice_nurture_dispatches
    WHERE lead_id = ${leadId} AND channel = ${channel}
    ORDER BY due_at ASC NULLS LAST, created_at ASC
  `.execute());
}

async function markSkipped(sql: any, lead: Lead, stages: Stage[], channel: Channel, status: string, dryRun: boolean) {
  if (dryRun) return;
  for (const stage of stages) {
    await sql`
      INSERT INTO bewild_rice_nurture_dispatches (lead_id, stage, channel, status, due_at, detail)
      VALUES (${lead.lead_id}, ${stage.key}, ${channel}, ${status}, ${new Date(new Date(lead.first_submitted_at).getTime() + stage.day * 86_400_000).toISOString()}::timestamptz, ${{ reason: status }}::jsonb)
      ON CONFLICT (lead_id, stage, channel) DO UPDATE SET
        status = EXCLUDED.status,
        due_at = COALESCE(bewild_rice_nurture_dispatches.due_at, EXCLUDED.due_at),
        error = NULL,
        detail = COALESCE(bewild_rice_nurture_dispatches.detail, '{}'::jsonb) || EXCLUDED.detail,
        updated_at = NOW()
      WHERE bewild_rice_nurture_dispatches.status IN ('failed', 'pending', 'planned', 'reserved')
    `.execute();
  }
}

async function reserve(sql: any, lead: Lead, stage: Stage, channel: Channel) {
  const dueAt = new Date(new Date(lead.first_submitted_at).getTime() + stage.day * 86_400_000).toISOString();
  await sql`
    INSERT INTO bewild_rice_nurture_dispatches (lead_id, stage, channel, status, attempts, due_at)
    VALUES (${lead.lead_id}, ${stage.key}, ${channel}, 'pending', 1, ${dueAt}::timestamptz)
    ON CONFLICT (lead_id, stage, channel) DO UPDATE SET
      status = 'pending', attempts = bewild_rice_nurture_dispatches.attempts + 1, error = NULL, updated_at = NOW()
  `.execute();
}

async function finish(sql: any, lead: Lead, stage: Stage, channel: Channel, status: string, detail: Record<string, unknown>, error = "") {
  const messageId = clean(detail.provider_message_id);
  await sql`
    UPDATE bewild_rice_nurture_dispatches
    SET status = ${status},
        dispatched_at = CASE WHEN ${["sent", "verified", "handed_off"].includes(status)} THEN COALESCE(dispatched_at, NOW()) ELSE dispatched_at END,
        provider_message_id = COALESCE(NULLIF(${messageId}, ''), provider_message_id),
        error = ${error}, detail = COALESCE(detail, '{}'::jsonb) || ${detail}::jsonb, updated_at = NOW()
    WHERE lead_id = ${lead.lead_id} AND stage = ${stage.key} AND channel = ${channel}
  `.execute();
}

function escapeHtml(value: unknown) {
  return clean(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character] || character));
}

function firstName(lead: Lead) {
  return clean(lead.name).split(/\s+/).filter(Boolean)[0] || "there";
}

function trackedUrl(url: string, stage: Stage, content: string) {
  const value = new URL(url);
  value.searchParams.set("utm_source", "gmail");
  value.searchParams.set("utm_medium", "email");
  value.searchParams.set("utm_campaign", "rice_recipe_nurture_202608");
  value.searchParams.set("utm_content", `${stage.key}_${content}`);
  return value.toString();
}

function guideUrl(resultKey: string, stage: Stage, content = "guide") {
  const value = new URL(GUIDE_BASE_URL);
  value.searchParams.set("guide", "1");
  value.searchParams.set("result", resultKey);
  return `${trackedUrl(value.toString(), stage, content)}#rice-guide`;
}

async function unsubscribeUrl(lead: Lead) {
  const payload = Buffer.from(JSON.stringify({ v: 1, lead_id: lead.lead_id, iat: new Date().toISOString() })).toString("base64url");
  const secret = await wmill.getVariable(UNSUBSCRIBE_SECRET_PATH);
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${UNSUBSCRIBE_BASE_URL}?t=${encodeURIComponent(`${payload}.${signature}`)}`;
}

function stageEmail(stage: Stage, result: ResultContent) {
  const recipe = escapeHtml(result.recipe);
  const nextRecipe = escapeHtml(result.nextRecipe);
  const mysoreProduct = "https://bewild.life/products/mysore-mallige-rice-5kg-protein-fibre-rich-unpolished-100-natural";
  const navaraProduct = "https://bewild.life/products/navara-rice";
  if (stage.key === "d03") return {
    subject: `A small note for ${result.recipe}`,
    eyebrow: "Day 3 · Cooking note",
    heading: "Keep this small note close.",
    paragraphs: [`Before you make <strong>${recipe}</strong>, keep this small note close:`, escapeHtml(result.tip), "The full timing and method are in your guide. This is simply the part worth remembering when the pot is already on the stove."],
    cta: "See the recipe again", ctaUrl: guideUrl(result.key, stage),
    closing: "If you cook it, reply and tell us what changed at your table.",
  };
  if (stage.key === "d08") return {
    subject: `Did you cook ${result.recipe}?`,
    eyebrow: "Day 8 · Cooking check-in",
    heading: "How did it go in your kitchen?",
    paragraphs: [`Your first match was <strong>${recipe}</strong>.`, "If you have cooked it, we would love to know what worked—and what you would change next time. If you have not, the guide is still there whenever the meal feels right."],
    cta: "Return to my guide", ctaUrl: guideUrl(result.key, stage),
    closing: "Reply to this email with a question or a note from your kitchen.",
  };
  if (stage.key === "d14_mysore") return {
    subject: "Why Mysore Mallige feels different in the pot",
    eyebrow: "Day 14 · Mysore Mallige",
    heading: "A grain with its own character.",
    paragraphs: ["Mysore Mallige is a fragrant, semi-polished rice from the Beforest Hyderabad Collective. Its character is clearest in familiar meals—curd rice, lemon rice, ghee rice and biryani.", "Because the grain has not been polished into sameness, notice how it drinks water and settles after cooking. Follow the guide once; after that, your own pot will teach you the rest."],
    cta: "Return to my guide", ctaUrl: guideUrl(result.key, stage),
    closing: "The rice comes from one place we can name.",
  };
  if (stage.key === "d14_navara") return {
    subject: "Why Navara asks for a slower pot",
    eyebrow: "Day 14 · Navara",
    heading: "Give the grain its time.",
    paragraphs: ["Navara is an earthy, semi-polished heritage red rice from the Beforest Hyderabad Collective. Its texture suits khichdi, pulao, dosa, kheer and quiet porridge bowls.", "The bran and character of the grain remain visible. Give it the soaking and cooking time in the guide rather than asking it to behave like everyday white rice."],
    cta: "Return to my guide", ctaUrl: guideUrl(result.key, stage),
    closing: "The rice comes from one place we can name.",
  };
  if (stage.key === "d21") return {
    subject: "One more recipe for your rice",
    eyebrow: "Day 21 · Next recipe",
    heading: "Let the same rice move through the week.",
    paragraphs: [`You began with <strong>${recipe}</strong>. For the next meal, try <strong>${nextRecipe}</strong>.`, "It uses the same rice in a different rhythm, so the bag can move through the week rather than wait for a special occasion."],
    cta: "Choose my next recipe", ctaUrl: guideUrl(result.nextKey, stage, "next_recipe"),
    closing: "The method is already in your Bewild guide.",
  };
  if (stage.key === "d28_mysore") return {
    subject: "The rice behind your Mysore Mallige recipe",
    eyebrow: "Day 28 · Mysore Mallige",
    heading: "Cook the guide with the rice it was written for.",
    paragraphs: ["Your recipes were written around Bewild Mysore Mallige Rice—a fragrant, semi-polished grain grown at the Beforest Hyderabad Collective.", "If you are ready to cook the guide with the rice it was designed for, you can find it below."],
    cta: "View Mysore Mallige Rice", ctaUrl: trackedUrl(mysoreProduct, stage, "product_mysore"),
    closing: "Available for delivery in Hyderabad. Keep the guide either way.",
  };
  return {
    subject: "The rice behind your Navara recipe",
    eyebrow: "Day 28 · Navara",
    heading: "Cook the guide with the rice it was written for.",
    paragraphs: ["Your recipes were written around Bewild Navara Red Rice—an earthy, semi-polished heritage grain grown at the Beforest Hyderabad Collective.", "If you are ready to cook the guide with the rice it was designed for, you can find it below."],
    cta: "View Navara Red Rice", ctaUrl: trackedUrl(navaraProduct, stage, "product_navara"),
    closing: "Available for delivery in Hyderabad. Keep the guide either way.",
  };
}

async function renderEmail(lead: Lead, stage: Stage, result: ResultContent) {
  const content = stageEmail(stage, result);
  const optOutUrl = await unsubscribeUrl(lead);
  const hero = result.branch === "navara"
    ? "https://cdn.shopify.com/s/files/1/0367/0831/9276/files/rice_navara_1.jpg?v=1769578942"
    : "https://cdn.shopify.com/s/files/1/0367/0831/9276/files/Img_21.jpg?v=1763025664";
  const paragraphs = content.paragraphs.map((paragraph) => `<p style="margin:0 0 18px;font-size:17px;line-height:1.65;">${paragraph}</p>`).join("");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(content.subject)}</title></head><body style="margin:0;background:#f3efe6;color:#20251f;font-family:Georgia,'Times New Roman',serif;font-weight:normal;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3efe6;"><tr><td align="center" style="padding:24px 12px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#fffdf8;border:1px solid #ded7c8;"><tr><td style="padding:27px 34px 22px;"><img src="https://cdn.shopify.com/s/files/1/0367/0831/9276/files/25_Bewild_-_Black_with_Tagline_817ce002-f286-4170-b754-53a67d6e61bd.png?v=1748334157" width="120" alt="Bewild" style="display:block;width:120px;height:auto;border:0;"></td></tr><tr><td><img src="${hero}" width="640" alt="" style="display:block;width:100%;max-height:290px;object-fit:cover;border:0;"></td></tr><tr><td style="padding:38px 42px 42px;"><p style="margin:0 0 16px;color:#9b4b3f;font-family:Arial,sans-serif;font-size:11px;line-height:1.4;letter-spacing:1.7px;text-transform:uppercase;">${escapeHtml(content.eyebrow)}</p><h1 style="margin:0 0 26px;color:#263e2d;font-family:Georgia,'Times New Roman',serif;font-size:36px;line-height:1.08;font-weight:normal;">${escapeHtml(content.heading)}</h1><p style="margin:0 0 18px;font-size:17px;line-height:1.65;">Hello ${escapeHtml(firstName(lead))},</p>${paragraphs}<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0 25px;"><tr><td bgcolor="#2f523a"><a href="${escapeHtml(content.ctaUrl)}" style="display:inline-block;padding:14px 20px;color:#fffdf8;font-family:Arial,sans-serif;font-size:14px;line-height:1;text-decoration:none;">${escapeHtml(content.cta)}</a></td></tr></table><p style="margin:0 0 26px;font-size:16px;line-height:1.6;color:#565b53;">${escapeHtml(content.closing)}</p><p style="margin:0;font-size:16px;line-height:1.5;">Team Bewild</p></td></tr><tr><td style="padding:20px 34px;background:#263e2d;color:#f7f1e5;font-family:Arial,sans-serif;font-size:11px;line-height:1.6;">Bewild · Forest-friendly produce from places we can name<br>Sent to Rice Finder subscribers who opted into email.<br><a href="${escapeHtml(optOutUrl)}" style="color:#f7f1e5;text-decoration:underline;">Unsubscribe</a></td></tr></table></td></tr></table></body></html>`;
  if (/\{\{[^}]+\}\}/.test(html)) throw new Error("Rendered email still contains an unresolved template placeholder.");
  return { subject: content.subject, html, unsubscribe_url: optOutUrl };
}

function headerValue(value: unknown) {
  return clean(value).replace(/[\r\n]+/g, " ");
}

function rawEmail(to: string, subject: string, html: string, optOutUrl: string) {
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
  return Buffer.from([
    `From: ${EMAIL_FROM}`,
    `To: ${headerValue(to)}`,
    `Reply-To: orders@bewild.life`,
    `Subject: ${encodedSubject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8",
    `List-Unsubscribe: <${optOutUrl}>`,
    "",
    html,
  ].join("\r\n"), "utf8").toString("base64url");
}

function gmailHeader(headers: Array<{ name?: string; value?: string }> | undefined, name: string) {
  return clean((headers || []).find((header) => clean(header.name).toLowerCase() === name.toLowerCase())?.value);
}

async function sendMatonEmail(lead: Lead, stage: Stage, result: ResultContent) {
  const rendered = await renderEmail(lead, stage, result);
  const apiKey = await wmill.getVariable(MATON_ORDERS_API_KEY_PATH);
  const commonHeaders = {
    Authorization: `Bearer ${apiKey}`,
    "Maton-Connection": MATON_ORDERS_CONNECTION_ID,
    "content-type": "application/json",
  };
  const sendResponse = await fetch(`${MATON_BASE_URL}/google-mail/gmail/v1/users/me/messages/send`, {
    method: "POST",
    headers: commonHeaders,
    body: JSON.stringify({ raw: rawEmail(clean(lead.email), rendered.subject, rendered.html, rendered.unsubscribe_url) }),
  });
  const sent = await sendResponse.json().catch(() => ({}));
  if (!sendResponse.ok || !clean(sent?.id)) throw new Error(`Maton Gmail send failed: ${sendResponse.status} ${JSON.stringify(sent)}`);

  let readbackVerified = false;
  let readbackError = "";
  try {
    const readResponse = await fetch(`${MATON_BASE_URL}/google-mail/gmail/v1/users/me/messages/${encodeURIComponent(sent.id)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject`, {
      headers: { Authorization: `Bearer ${apiKey}`, "Maton-Connection": MATON_ORDERS_CONNECTION_ID },
    });
    const readback = await readResponse.json().catch(() => ({}));
    if (!readResponse.ok) throw new Error(`Maton Gmail read-back failed: ${readResponse.status} ${JSON.stringify(readback)}`);
    const headers = readback?.payload?.headers || [];
    const from = gmailHeader(headers, "From").toLowerCase();
    const to = gmailHeader(headers, "To").toLowerCase();
    if (!from.includes("orders@bewild.life") || !to.includes(clean(lead.email).toLowerCase())) {
      throw new Error("Maton Gmail read-back did not match the expected sender and recipient.");
    }
    readbackVerified = true;
  } catch (error) {
    readbackError = error instanceof Error ? error.message : String(error);
  }
  return {
    provider_message_id: clean(sent.id),
    provider_thread_id: clean(sent.threadId),
    subject: rendered.subject,
    rendered_bytes: Buffer.byteLength(rendered.html, "utf8"),
    unresolved_placeholders: 0,
    readback_verified: readbackVerified,
    readback_error: readbackError,
  };
}

function whatsappValues(stage: Stage, result: ResultContent) {
  if (stage.key === "d03") return { bodyValues: [result.recipe], buttonValues: { "0": [result.key] } };
  if (stage.key === "d08") return { bodyValues: [result.recipe, result.tip] };
  if (stage.key.startsWith("d14_")) return { buttonValues: { "0": [result.key] } };
  if (stage.key === "d21") return { bodyValues: [result.recipe, result.nextRecipe], buttonValues: { "0": [result.nextKey] } };
  return {};
}

async function sendWhatsapp(lead: Lead, stage: Stage, result: ResultContent) {
  const apiKey = await wmill.getVariable(INTERAKT_API_KEY_PATH);
  const baseUrl = (await wmill.getVariable(INTERAKT_BASE_URL_PATH).catch(() => "https://api.interakt.ai")) || "https://api.interakt.ai";
  const campaignId = await wmill.getVariable(`f/bewild_lead_magnet/interakt_nurture_${stage.key}_campaign_id`).catch(() => "");
  const body: Record<string, unknown> = {
    ...interaktRecipient(clean(lead.whatsapp)),
    callbackData: `bewild_rice_nurture:${lead.lead_id}:${stage.key}`,
    template_category: "marketing",
    type: "Template",
    template: { name: stage.whatsappTemplate, languageCode: "en", ...whatsappValues(stage, result) },
  };
  if (campaignId) body.campaignId = campaignId;
  const response = await fetch(`${clean(baseUrl).replace(/\/+$/, "")}/v1/public/message/`, {
    method: "POST",
    headers: { authorization: clean(apiKey).toLowerCase().startsWith("basic ") ? apiKey : `Basic ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.result === false) throw new Error(`Interakt nurture send failed: ${response.status} ${JSON.stringify(payload)}`);
  return { provider_message_id: clean(payload?.id || payload?.message_id), interakt_response: payload };
}

function lastDispatch(rows: DispatchRow[]) {
  return rows
    .filter((row) => ["sent", "verified", "handed_off"].includes(row.status) && row.dispatched_at)
    .map((row) => new Date(row.dispatched_at as string).getTime())
    .sort((a, b) => b - a)[0] || 0;
}

function terminal(status: string) {
  return ["sent", "verified", "handed_off", "suppressed", "skipped_backfill", "skipped_buyer"].includes(status);
}

export async function main(
  dry_run = true,
  limit = 250,
  enabled_stages_csv = "d03,d08,d14_mysore",
  enable_email = true,
  enable_whatsapp = false,
  email_window_start = "09:45",
  email_window_end = "10:15",
  whatsapp_window_start = "15:45",
  whatsapp_window_end = "16:15",
  bypass_window = false,
  debug_lead_id = "",
  catchup_mode = false,
  catchup_start_date = "",
  catchup_days = 3,
  email_provider = "shopify_flow",
  max_email_sends = 10,
) {
  const sql = wmill.datatable();
  await ensureTable(sql);
  const killSwitch = await wmill.getVariable(DELIVERY_ENABLED_PATH).catch(() => "false");
  if (!dry_run && !enabled(killSwitch)) return { dry_run, status: "delivery_disabled", enable_variable: DELIVERY_ENABLED_PATH };

  const now = new Date();
  const configuredStages = parseStages(enabled_stages_csv);
  const normalizedCatchupDays = Math.max(1, Math.min(Number(catchup_days || 3), 7));
  const normalizedCatchupStart = clean(catchup_start_date);
  const catchupConfigured = catchup_mode && /^\d{4}-\d{2}-\d{2}$/.test(normalizedCatchupStart);
  const catchupDay = catchupConfigured
    ? catchupOffset(now, normalizedCatchupStart)
    : -1;
  const catchupActive = catchupDay >= 0 && catchupDay < normalizedCatchupDays;
  let leads = rowsOf<Lead>(await sql`
    SELECT lead_id, name, email, whatsapp, email_opt_in, whatsapp_opt_in, result_key, result_title,
           product_interest, first_submitted_at, shopify_customer_id
    FROM bewild_lead_magnet_leads
    WHERE lead_magnet_name = 'rice_comfort_recipe_finder'
      AND consent = TRUE
      AND first_submitted_at <= NOW() - INTERVAL '3 days'
    ORDER BY first_submitted_at ASC
    LIMIT ${Math.max(1, Math.min(Number(limit || 250), 250))}
  `.execute());
  if (debug_lead_id) leads = leads.filter((lead) => lead.lead_id === debug_lead_id);

  const planned: any[] = [];
  const completed: any[] = [];
  const skipped: any[] = [];
  const failed: any[] = [];
  const repaired: any[] = [];
  let emailSendCount = 0;

  for (const lead of leads) {
    const result = resultFor(lead);
    if (!result) {
      skipped.push({ lead_id: lead.lead_id, reason: "unknown_result", result_key: lead.result_key });
      continue;
    }
    const age = ageInDays(lead.first_submitted_at, now);
    const dueStages = configuredStages.filter((stage) => stage.day <= age && stageMatches(stage, result));
    if (!dueStages.length) continue;

    let customer: ShopifyCustomer | null = null;
    try {
      customer = await customerFor(lead);
    } catch (error) {
      failed.push({ lead_id: lead.lead_id, reason: "shopify_customer_read_failed", error: error instanceof Error ? error.message : String(error) });
      continue;
    }
    const isBuyer = Boolean(customer && (customer.tags.includes(BUYER_EXIT_TAG) || boughtRice(customer, lead.first_submitted_at)));
    if (isBuyer) {
      if (!dry_run && customer && !customer.tags.includes(BUYER_EXIT_TAG)) await addCustomerTag(customer.id, BUYER_EXIT_TAG);
      await markSkipped(sql, lead, dueStages, "email", "skipped_buyer", dry_run);
      await markSkipped(sql, lead, dueStages, "whatsapp", "skipped_buyer", dry_run);
      skipped.push({ lead_id: lead.lead_id, reason: "verified_rice_buyer" });
      continue;
    }

    let catchupTouchSelected = false;
    for (const channel of ["email", "whatsapp"] as Channel[]) {
      const channelEnabled = channel === "email" ? enable_email : enable_whatsapp;
      if (!channelEnabled) continue;
      const consentOkay = channel === "email"
        ? Boolean(lead.email_opt_in && lead.email && customer?.emailMarketingConsent?.marketingState === "SUBSCRIBED")
        : Boolean(lead.whatsapp_opt_in && lead.whatsapp);
      if (!consentOkay) {
        skipped.push({ lead_id: lead.lead_id, channel, reason: "channel_not_opted_in_or_unavailable" });
        continue;
      }

      const existing = await dispatchRows(sql, lead.lead_id, channel);
      const currentByStage = new Map(existing.map((row) => [row.stage, row]));
      const progressedStageDays = dueStages
        .filter((stage) => ["sent", "verified", "handed_off"].includes(currentByStage.get(stage.key)?.status || ""))
        .map((stage) => stage.day);
      const furthestProgressDay = progressedStageDays.length ? Math.max(...progressedStageDays) : 0;
      const staleOlderStages = dueStages.filter((stage) => {
        const row = currentByStage.get(stage.key);
        return stage.day < furthestProgressDay && !terminal(row?.status || "");
      });
      await markSkipped(sql, lead, staleOlderStages, channel, "skipped_backfill", dry_run);
      if (staleOlderStages.length) {
        repaired.push({
          lead_id: lead.lead_id,
          channel,
          stages: staleOlderStages.map((stage) => stage.key),
          action: dry_run ? "would_repair" : "repaired",
        });
      }
      const available = dueStages.filter((stage) => {
        const row = currentByStage.get(stage.key);
        return stage.day > furthestProgressDay && !terminal(row?.status || "") && Number(row?.attempts || 0) < 3;
      });
      if (!available.length) continue;
      const selected = available[available.length - 1];
      const older = available.filter((stage) => stage.day < selected.day);
      const isCatchupCohort = catchupConfigured && stageDueMs(lead, selected) < catchupStartMs(normalizedCatchupStart);
      const assignedCatchupDay = isCatchupCohort ? stableBucket(lead.lead_id, normalizedCatchupDays) : -1;
      const catchupScheduledDate = isCatchupCohort ? addIstDays(normalizedCatchupStart, assignedCatchupDay) : null;
      if (isCatchupCohort && catchupTouchSelected) {
        skipped.push({ lead_id: lead.lead_id, channel, stage: selected.key, reason: "catchup_daily_touch_already_selected", scheduled_date: catchupScheduledDate });
        continue;
      }
      if (isCatchupCohort && !dry_run) {
        if (catchupDay < 0) {
          skipped.push({ lead_id: lead.lead_id, channel, stage: selected.key, reason: "catchup_not_started", scheduled_date: catchupScheduledDate });
          continue;
        }
        if (catchupDay >= normalizedCatchupDays) {
          skipped.push({ lead_id: lead.lead_id, channel, stage: selected.key, reason: "catchup_window_ended", scheduled_date: catchupScheduledDate });
          continue;
        }
        if (assignedCatchupDay !== catchupDay) {
          skipped.push({ lead_id: lead.lead_id, channel, stage: selected.key, reason: "catchup_day_bucket", catchup_day: catchupDay + 1, scheduled_date: catchupScheduledDate });
          continue;
        }
      }
      await markSkipped(sql, lead, older, channel, "skipped_backfill", dry_run);

      const previousAt = lastDispatch(existing);
      if (previousAt && now.getTime() < previousAt + MIN_STAGE_GAP_DAYS * 86_400_000) {
        skipped.push({ lead_id: lead.lead_id, channel, stage: selected.key, reason: "five_day_spacing" });
        continue;
      }
      if (isCatchupCohort) catchupTouchSelected = true;
      const inWindow = channel === "email"
        ? insideWindow(now, email_window_start, email_window_end)
        : insideWindow(now, whatsapp_window_start, whatsapp_window_end);
      const preview = {
        lead_id: lead.lead_id,
        channel,
        stage: selected.key,
        result_key: result.key,
        recipient_tail: clean(channel === "email" ? lead.email : lead.whatsapp).slice(-4),
        catchup: isCatchupCohort,
        scheduled_date: catchupScheduledDate || istDateString(now),
      };
      if (dry_run || (!bypass_window && !inWindow)) {
        planned.push({ ...preview, action: dry_run ? "dry_run" : "waiting_for_channel_window", provider: channel === "email" ? email_provider : "interakt" });
        continue;
      }

      if (channel === "email" && email_provider === "maton_gmail" && emailSendCount >= Math.max(1, Math.min(Number(max_email_sends || 10), 25))) {
        skipped.push({ ...preview, reason: "email_batch_limit" });
        continue;
      }

      try {
        await reserve(sql, lead, selected, channel);
        if (channel === "email") {
          if (!customer) throw new Error("Shopify customer is unavailable for email handoff.");
          if (email_provider === "maton_gmail") {
            const response = await sendMatonEmail(lead, selected, result);
            emailSendCount += 1;
            await finish(sql, lead, selected, channel, "sent", { provider: "maton_gmail", ...response });
            if (!response.readback_verified) {
              completed.push({ ...preview, status: "sent_readback_pending", provider: "maton_gmail", provider_message_id: response.provider_message_id });
              failed.push({ ...preview, reason: "gmail_readback_failed", error: response.readback_error, message_already_sent: true });
              continue;
            }
            try {
              await addCustomerTag(customer.id, selected.emailSentTag);
              await finish(sql, lead, selected, channel, "verified", { provider: "maton_gmail", sent_tag: selected.emailSentTag, ...response });
              completed.push({ ...preview, status: "verified", provider: "maton_gmail", sent_tag: selected.emailSentTag, provider_message_id: response.provider_message_id });
            } catch (tagError) {
              const tagMessage = tagError instanceof Error ? tagError.message : String(tagError);
              await finish(sql, lead, selected, channel, "sent", { provider: "maton_gmail", sent_tag_pending: selected.emailSentTag, tag_error: tagMessage, ...response });
              completed.push({ ...preview, status: "sent_tag_pending", provider: "maton_gmail", provider_message_id: response.provider_message_id });
              failed.push({ ...preview, reason: "shopify_sent_tag_failed", error: tagMessage, message_already_sent: true });
            }
          } else {
            await addCustomerTag(customer.id, selected.emailTag);
            await finish(sql, lead, selected, channel, "handed_off", { provider: "shopify_flow", due_tag: selected.emailTag });
            completed.push({ ...preview, status: "handed_off", due_tag: selected.emailTag });
          }
        } else {
          const response = await sendWhatsapp(lead, selected, result);
          await finish(sql, lead, selected, channel, "sent", { provider: "interakt", template_name: selected.whatsappTemplate, ...response });
          completed.push({ ...preview, status: "sent", template_name: selected.whatsappTemplate, provider_message_id: response.provider_message_id || null });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await finish(sql, lead, selected, channel, "failed", { stage: selected.key }, message);
        failed.push({ ...preview, error: message });
      }
    }
  }

  const stagedCounts = Object.values(planned.reduce((acc: Record<string, any>, item: any) => {
    const key = `${item.scheduled_date}|${item.stage}|${item.channel}`;
    if (!acc[key]) acc[key] = { scheduled_date: item.scheduled_date, stage: item.stage, channel: item.channel, count: 0 };
    acc[key].count += 1;
    return acc;
  }, {})).sort((a: any, b: any) => `${a.scheduled_date}|${a.stage}|${a.channel}`.localeCompare(`${b.scheduled_date}|${b.stage}|${b.channel}`));

  return {
    dry_run,
    status: failed.length ? "completed_with_failures" : "ok",
    enabled_stages: configuredStages.map((stage) => stage.key),
    channels: { email: enable_email, whatsapp: enable_whatsapp },
    email_provider,
    email_batch_limit: Math.max(1, Math.min(Number(max_email_sends || 10), 25)),
    catchup: {
      requested: catchup_mode,
      configured: catchupConfigured,
      active: catchupActive,
      start_date: normalizedCatchupStart || null,
      day: catchupActive ? catchupDay + 1 : null,
      days: normalizedCatchupDays,
      staged_counts: stagedCounts,
    },
    checked: leads.length,
    planned,
    completed,
    skipped,
    failed,
    repaired,
  };
}
