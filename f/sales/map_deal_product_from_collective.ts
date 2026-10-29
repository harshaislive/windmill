import * as wmill from "windmill-client";


type PipedriveUsageLogArgs = {
  method: string;
  rawEndpoint: string;
  statusCode?: number;
  success: boolean;
  durationMs?: number;
  rateLimitRemaining?: number;
  rateLimitReset?: string;
  retryAfter?: string;
  errorMessage?: string;
  requestFingerprint?: string;
};

async function logPipedriveApiUsage(_args: PipedriveUsageLogArgs) {
  return;
}

function pipedriveRateLimitRemaining(response: Response): number | undefined {
  const value = Number(response.headers.get("x-ratelimit-remaining") || response.headers.get("x-rate-limit-remaining"));
  return Number.isFinite(value) ? value : undefined;
}

function pipedriveEndpointForLog(url: URL): string {
  return url.pathname;
}

const PIPEDRIVE_VARIABLE_PATH = "f/collectives/zoom_collective_to_pipedrive/pipedrive_api_key";
const DEFAULT_PIPEDRIVE_DOMAIN = "beforest";
const BEFOREST_ADMIN_USER_ID = 18891506;

const PRODUCT_BY_CODE: Record<string, ProductPlan> = {
  HAMM_1AC: {
    collective: "Hammiyala",
    name: "Hammiyala #1 AC",
    code: "HAMM_1AC",
    description:
      "2-3 Cr for 1 ac undivided share plus home in the 100+ acre collective, including home, GST, stamp duty, registration and commons operations until 2033",
    price: 30000000,
  },
  HAMM_2AC: {
    collective: "Hammiyala",
    name: "Hammiyala #2 AC",
    code: "HAMM_2AC",
    description:
      "4.5 Cr for 2 ac undivided share plus home in the 100+ acre collective, including home, GST, stamp duty, registration and commons operations until 2033",
    price: 45000000,
  },
  HAMM_PRIVATE_ESTATE_2026_08: {
    collective: "Hammiyala",
    name: "Hammiyala #Private Estate — Aug 2026",
    code: "HAMM_PRIVATE_ESTATE_2026_08",
    description:
      "3.46 Cr all-inclusive for 1.5 acres UDS, 20 cents for the home and a 2,200 sq. ft. Earth Home, including GST, stamp duty, registration, Operations Fund until 2033 and applicable premium charges",
    price: 34600000,
  },
  HAMM_FOUNDERS_DISTRICT_2026_08: {
    collective: "Hammiyala",
    name: "Hammiyala #Founder's District — Aug 2026",
    code: "HAMM_FOUNDERS_DISTRICT_2026_08",
    description:
      "3.52 Cr all-inclusive for 1.5 acres UDS, 20 cents for the home and a 1,500 sq. ft. Earth Home, including GST, stamp duty, registration, Operations Fund until 2033 and applicable premium charges",
    price: 35200000,
  },
  MUM_EARTH_HOME: {
    collective: "Mumbai",
    name: "Mumbai #Earth Home",
    code: "Mum_Earth_Home",
    description: "Earth Home set in 1000 sqyd in a 105 acre collective starting at 3.88cr all inclusive including maintenance",
    price: 38800000,
  },
  MUM_EARTH_HOME_2026_08: {
    collective: "Mumbai",
    name: "Mumbai #Earth Home — Aug 2026",
    code: "MUM_EARTH_HOME_2026_08",
    description:
      "8.01 Cr all-inclusive for 3 acres of agricultural land and a 2,400 sq. ft. Earth Home, including the tourist-home permit, construction, GST, stamp duty, registration and Operations Fund until 2033",
    price: 80100000,
  },
  POO_2_0_2_5AC: {
    collective: "Poomaale 2.0",
    name: "Poomaale 2.0 #2.5AC",
    code: "POO_2.0_2.5AC",
    description:
      "1.65 Cr for 2.5 ac share in the 100+ acre collective, including GST, stamp duty, registration and commons operations until 2033",
    price: 16500000,
  },
  POO_2_0_2_5AC_2026_08: {
    collective: "Poomaale 2.0",
    name: "Poomaale 2.0 #2.5AC — Aug 2026",
    code: "POO_2_0_2_5AC_2026_08",
    description:
      "3.70 Cr all-inclusive for 2.5 acres UDS, 20 cents for the home and a 2,200 sq. ft. Earth Home, including GST, stamp duty, registration and Operations Fund until 2033",
    price: 37000000,
  },
  BHPL_1AC: {
    collective: "Bhopal",
    name: "Bhopal #1AC",
    code: "BHPL_1AC",
    description: "1 acre undivided share including a 500 sqyd plot on housing zone at 75.6L",
    price: 7560000,
  },
  BHPL_2AC: {
    collective: "Bhopal",
    name: "Bhopal #2AC",
    code: "BHPL_2AC",
    description: "Private estate with a divided share of 10,800 sq. ft. and UDS of 2 acres, priced at 3.33 Cr",
    price: 33300000,
  },
};

const DEFAULT_PRODUCT_CODE_BY_PIPELINE: Record<number, string> = {
  1: "HAMM_2AC",
  2: "MUM_EARTH_HOME",
  3: "POO_2_0_2_5AC",
};

const PROSPECTIVE_PRODUCT_CODES = [
  "MUM_EARTH_HOME_2026_08",
  "HAMM_PRIVATE_ESTATE_2026_08",
  "HAMM_FOUNDERS_DISTRICT_2026_08",
  "POO_2_0_2_5AC_2026_08",
] as const;

const MANAGED_PRODUCT_NAMES = new Set(Object.values(PRODUCT_BY_CODE).map((plan) => plan.name.toLowerCase()));

type ProductPlan = {
  collective: string;
  name: string;
  code: string;
  description: string;
  price: number;
};

type Deal = Record<string, any> & {
  id?: number;
  title?: string;
  pipeline_id?: number | { id?: number };
  person_id?: number | { id?: number };
};

type Product = {
  id?: number;
  name?: string;
  code?: string;
  prices?: Array<{ price?: number; currency?: string }>;
};

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(asString(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function pipelineId(deal: Deal): number | null {
  if (typeof deal.pipeline_id === "object") return asNumber(deal.pipeline_id?.id);
  return asNumber(deal.pipeline_id);
}

function personId(deal: Deal): number | null {
  if (typeof deal.person_id === "number") return deal.person_id;
  if (deal.person_id && typeof deal.person_id === "object") return asNumber(deal.person_id.id);
  return null;
}

function normalizedAnswer(value: string): string {
  return value.toLowerCase().replace(/[,₹*]/g, "").replace(/\s+/g, " ").trim();
}

function answerMentionsOneAcre(answer: string): boolean {
  return /\b1\s*acre\b/.test(answer) || /\b1\s*ac\b/.test(answer) || answer.includes("1acre");
}

function answerMentionsTwoAcres(answer: string): boolean {
  return /\b2\s*acre\b/.test(answer) || /\b2\s*ac\b/.test(answer) || answer.includes("2acre");
}

function answerIsNotReady(answer: string): boolean {
  return answer.includes("not ready");
}

function answerDeclinesProduct(answer: string): boolean {
  return answerIsNotReady(answer) || answer.includes("not sure") || answer.includes("just exploring");
}

function answerMentionsBhopalCurrentProduct(answer: string): boolean {
  return (
    answerMentionsTwoAcres(answer) ||
    answer.includes("3.33") ||
    answer.includes("333 cr") ||
    answer.includes("333cr") ||
    answer.includes("10800") ||
    answer.includes("10 800") ||
    answer.includes("uds of 2 acres") ||
    answer.includes("divided share")
  );
}

function answerMentionsProspectivePrice(answer: string, price: string): boolean {
  const compact = price.replace(".", "");
  return answer.includes(price) || answer.includes(`${price} cr`) || answer.includes(`${price}cr`) || answer.includes(`${compact}cr`);
}

function isProspectivePlan(plan: ProductPlan): boolean {
  return (PROSPECTIVE_PRODUCT_CODES as readonly string[]).includes(plan.code);
}

function resolveProductPlan(deal: Deal, productAnswer: string): ProductPlan | null {
  const pipeline = pipelineId(deal) || 0;
  const answer = normalizedAnswer(productAnswer);

  if ([1, 2, 3].includes(pipeline) && answerDeclinesProduct(answer)) return null;

  if (pipeline === 1) {
    if (answer.includes("private estate") || answer.includes("2200 sq") || answerMentionsProspectivePrice(answer, "3.46")) {
      return PRODUCT_BY_CODE.HAMM_PRIVATE_ESTATE_2026_08;
    }
    if (answer.includes("founder's district") || answer.includes("founders district") || answer.includes("1500 sq") || answerMentionsProspectivePrice(answer, "3.52")) {
      return PRODUCT_BY_CODE.HAMM_FOUNDERS_DISTRICT_2026_08;
    }
    if (answerMentionsOneAcre(answer) || answer.includes("1.04cr") || answer.includes("104cr")) {
      return PRODUCT_BY_CODE.HAMM_1AC;
    }
    if (answerMentionsTwoAcres(answer) || answer.includes("2.05cr") || answer.includes("205cr")) {
      return PRODUCT_BY_CODE.HAMM_2AC;
    }
  }

  if (pipeline === 2 && (answer.includes("2400 sq") || answer.includes("3 acres") || answerMentionsProspectivePrice(answer, "8.01"))) {
    return PRODUCT_BY_CODE.MUM_EARTH_HOME_2026_08;
  }

  if (pipeline === 3 && (answer.includes("i understand the all-inclusive price") || answerMentionsProspectivePrice(answer, "3.70"))) {
    return PRODUCT_BY_CODE.POO_2_0_2_5AC_2026_08;
  }

  if (pipeline === 4) {
    if (!answer || answerIsNotReady(answer)) return null;
    if (answerMentionsBhopalCurrentProduct(answer)) return PRODUCT_BY_CODE.BHPL_2AC;
    return null;
  }

  return PRODUCT_BY_CODE[DEFAULT_PRODUCT_CODE_BY_PIPELINE[pipeline]];
}

function todayInTimezone(timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

async function pipedriveRequest(
  method: string,
  path: string,
  options: { params?: Record<string, unknown>; body?: Record<string, unknown>; apiVersion?: "v1" | "v2" } = {},
): Promise<any> {
  const apiToken = await wmill.getVariable(PIPEDRIVE_VARIABLE_PATH);
  const apiVersion = options.apiVersion || "v1";
  const url = new URL(`https://${DEFAULT_PIPEDRIVE_DOMAIN}.pipedrive.com/api/${apiVersion}/${path}`);
  url.searchParams.set("api_token", apiToken);
  for (const [key, value] of Object.entries(options.params || {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }

  const startedAt = Date.now();

  const response = await fetch(url, {
    method,
    headers: options.body ? { "content-type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  await logPipedriveApiUsage({
    method,
    rawEndpoint: pipedriveEndpointForLog(url),
    statusCode: response.status,
    success: response.ok && payload?.success !== false,
    durationMs: Date.now() - startedAt,
    rateLimitRemaining: pipedriveRateLimitRemaining(response),
    rateLimitReset: response.headers.get("x-ratelimit-reset") || response.headers.get("x-rate-limit-reset") || "",
    retryAfter: response.headers.get("retry-after") || "",
    errorMessage: response.ok && payload?.success !== false ? "" : JSON.stringify(payload).slice(0, 800),
    requestFingerprint: method.toUpperCase() + " " + pipedriveEndpointForLog(url),
  });
  if (!response.ok || payload?.success === false) {
    throw new Error(`Pipedrive ${method} ${path} failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function getDeal(dealId: number): Promise<Deal> {
  const payload = await pipedriveRequest("GET", `deals/${dealId}`, { apiVersion: "v2" });
  return payload.data as Deal;
}

async function findProduct(plan: ProductPlan): Promise<Product | null> {
  const searchTerms = [plan.code, plan.name];
  for (const term of searchTerms) {
    const payload = await pipedriveRequest("GET", "products", {
      params: { term, limit: 100 },
    });
    const products = (payload.data || []) as Product[];
    const exact = products.find(
      (product) =>
        asString(product.code).toLowerCase() === plan.code.toLowerCase() ||
        asString(product.name).toLowerCase() === plan.name.toLowerCase(),
    );
    if (exact) return exact;
  }
  return null;
}

async function createProduct(plan: ProductPlan): Promise<Product> {
  const payload = await pipedriveRequest("POST", "products", {
    body: {
      name: plan.name,
      code: plan.code,
      description: plan.description,
      unit: "share",
      visible_to: 3,
      prices: [{ price: plan.price, currency: "INR" }],
    },
  });
  return payload.data as Product;
}

async function updateProduct(productId: number, plan: ProductPlan): Promise<Product> {
  const payload = await pipedriveRequest("PUT", `products/${productId}`, {
    body: {
      name: plan.name,
      code: plan.code,
      description: plan.description,
      visible_to: 3,
      prices: [{ price: plan.price, currency: "INR" }],
    },
  });
  return payload.data as Product;
}

async function getDealProducts(dealId: number): Promise<any[]> {
  const payload = await pipedriveRequest("GET", `deals/${dealId}/products`, {
    params: { include_product_data: 1 },
  });
  return payload.data || [];
}

function staleManagedDealProducts(existingDealProducts: any[], correctProductId: number | null): any[] {
  return existingDealProducts.filter((item) => {
    const name = asString(item.name || item.product?.name).toLowerCase();
    const productId = Number(item.product_id);
    return MANAGED_PRODUCT_NAMES.has(name) && (!correctProductId || productId !== correctProductId);
  });
}

function managedDealProductsForCollective(existingDealProducts: any[], collective: string): any[] {
  const managedNames = new Set(
    Object.values(PRODUCT_BY_CODE)
      .filter((plan) => plan.collective === collective)
      .map((plan) => plan.name.toLowerCase()),
  );
  return existingDealProducts.filter((item) => managedNames.has(asString(item.name || item.product?.name).toLowerCase()));
}

function dealProductPrice(item: any): number | null {
  for (const value of [item.item_price, item.price, item.sum, item.product?.price]) {
    const parsed = asNumber(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function staleCurrentProductDealProducts(existingDealProducts: any[], correctProductId: number, plan: ProductPlan): any[] {
  if (!["Bhopal", "Poomaale 2.0"].includes(plan.collective)) return [];
  return existingDealProducts.filter((item) => {
    if (Number(item.product_id) !== correctProductId) return false;
    const price = dealProductPrice(item);
    return price !== null && price !== plan.price;
  });
}

async function removeDealProduct(dealId: number, dealProductId: number) {
  const payload = await pipedriveRequest("DELETE", `deals/${dealId}/products/${dealProductId}`);
  return payload.data;
}

async function attachProductToDeal(dealId: number, product: Product, plan: ProductPlan, productAnswer?: string) {
  const payload = await pipedriveRequest("POST", `deals/${dealId}/products`, {
    body: {
      product_id: Number(product.id),
      item_price: plan.price,
      quantity: 1,
      discount: 0,
      comments: productAnswer ? `Mapped from Typeform answer: ${productAnswer}` : "Mapped from collective intake",
    },
  });
  return payload.data;
}

async function updateDealValue(dealId: number, value: number) {
  const payload = await pipedriveRequest("PUT", `deals/${dealId}`, {
    body: { value },
  });
  return payload.data;
}

async function createPipedriveActivity(dealId: number, subject: string, note: string, personIdValue?: number | null) {
  const payload = await pipedriveRequest("POST", "activities", {
    body: {
      deal_id: dealId,
      ...(personIdValue ? { person_id: personIdValue } : {}),
      user_id: BEFOREST_ADMIN_USER_ID,
      subject,
      type: "task",
      done: 1,
      due_date: todayInTimezone("Asia/Kolkata"),
      note,
    },
  });
  return payload.data;
}

export async function main(
  deal_id = 0,
  dry_run = false,
  product_answer = "",
  preview_pipeline_id = 0,
  provision_products = false,
) {
  const previewPipelineId = Number(preview_pipeline_id);
  if (dry_run && previewPipelineId > 0) {
    const plan = resolveProductPlan({ pipeline_id: previewPipelineId }, product_answer);
    return {
      dry_run: true,
      status: plan ? "resolved" : "no_product",
      preview_pipeline_id: previewPipelineId,
      product_answer,
      plan,
    };
  }

  if (provision_products) {
    const results = [];
    for (const code of PROSPECTIVE_PRODUCT_CODES) {
      const plan = PRODUCT_BY_CODE[code];
      const existing = await findProduct(plan);
      if (dry_run) {
        results.push({ code, status: existing ? "exists" : "would_create", product_id: Number(existing?.id) || null, plan });
        continue;
      }
      const product = existing || (await createProduct(plan));
      results.push({ code, status: existing ? "exists" : "created", product_id: Number(product.id) || null, plan });
    }
    return { dry_run, status: "provisioned", products: results };
  }

  const dealId = Number(deal_id);
  if (!Number.isFinite(dealId) || dealId <= 0) throw new Error("deal_id is required.");

  const deal = await getDeal(dealId);
  const plan = resolveProductPlan(deal, product_answer);
  const existingDealProducts = await getDealProducts(dealId);
  if (!plan) {
    if (pipelineId(deal) === 4) {
      const productsToRemove = managedDealProductsForCollective(existingDealProducts, "Bhopal");
      if (dry_run) {
        return {
          dry_run: true,
          status: productsToRemove.length ? "would_clear_bhopal_product" : "no_product_required",
          deal_id: dealId,
          deal_title: deal.title || null,
          product_answer,
          stale_bhopal_deal_product_ids: productsToRemove.map((item) => Number(item.id)).filter(Boolean),
          deal_value_would_be_set_to: 0,
        };
      }

      const removedDealProductIds = [];
      for (const productToRemove of productsToRemove) {
        const dealProductId = Number(productToRemove.id);
        if (!dealProductId) continue;
        await removeDealProduct(dealId, dealProductId);
        removedDealProductIds.push(dealProductId);
      }
      await updateDealValue(dealId, 0);

      const activity = removedDealProductIds.length
        ? await createPipedriveActivity(
            dealId,
            "Product mapping cleared",
            "Bhopal Typeform answer did not select the current 3.33 Cr product. Deal value set to INR 0.",
            personId(deal),
          )
        : null;

      return {
        dry_run: false,
        status: removedDealProductIds.length ? "cleared_bhopal_product" : "no_product_required",
        deal_id: dealId,
        removed_deal_product_ids: removedDealProductIds,
        deal_value_set_to: 0,
        audit_activity_id: Number(activity?.id) || null,
      };
    }

    return { status: "ignored", reason: "Unsupported pipeline or no product selected.", deal_id: dealId };
  }

  const existingProduct = await findProduct(plan);
  const alreadyAttached = existingDealProducts.some((item) => Number(item.product_id) === Number(existingProduct?.id));
  const staleProducts = staleManagedDealProducts(existingDealProducts, Number(existingProduct?.id) || null);
  const staleCurrentProductRows = existingProduct
    ? staleCurrentProductDealProducts(existingDealProducts, Number(existingProduct.id), plan)
    : [];
  const preserveExistingPricing = isProspectivePlan(plan) && staleProducts.length > 0;

  if (dry_run) {
    const wouldRepair = staleProducts.length > 0 || staleCurrentProductRows.length > 0;
    return {
      dry_run: true,
      status: preserveExistingPricing
        ? "would_preserve_existing_pricing"
        : wouldRepair
          ? "would_repair_stale_product"
          : alreadyAttached
            ? "already_attached"
            : "would_attach",
      deal_id: dealId,
      deal_title: deal.title || null,
      product_exists: Boolean(existingProduct),
      product_id: Number(existingProduct?.id) || null,
      plan,
      existing_deal_product_count: existingDealProducts.length,
      stale_managed_deal_product_ids: staleProducts.map((item) => Number(item.id)).filter(Boolean),
      stale_current_product_deal_product_ids: staleCurrentProductRows.map((item) => Number(item.id)).filter(Boolean),
    };
  }

  if (preserveExistingPricing) {
    return {
      dry_run: false,
      status: "existing_pricing_preserved",
      deal_id: dealId,
      prospective_product_code: plan.code,
      existing_managed_deal_product_ids: staleProducts.map((item) => Number(item.id)).filter(Boolean),
    };
  }

  const product = existingProduct ? await updateProduct(Number(existingProduct.id), plan) : await createProduct(plan);
  const staleProductsToRemove = [
    ...staleManagedDealProducts(existingDealProducts, Number(product.id)),
    ...staleCurrentProductDealProducts(existingDealProducts, Number(product.id), plan),
  ];
  const removedDealProductIds = [];
  for (const staleProduct of staleProductsToRemove) {
    const dealProductId = Number(staleProduct.id);
    if (!dealProductId) continue;
    await removeDealProduct(dealId, dealProductId);
    removedDealProductIds.push(dealProductId);
  }

  const stillAttached = existingDealProducts.some(
    (item) => Number(item.product_id) === Number(product.id) && !removedDealProductIds.includes(Number(item.id)),
  );
  if (stillAttached) {
    return {
      dry_run: false,
      status: removedDealProductIds.length ? "removed_stale_products" : "already_attached",
      deal_id: dealId,
      product_id: Number(product.id),
      product_name: plan.name,
      removed_deal_product_ids: removedDealProductIds,
      deal_value_set_to: plan.collective === "Bhopal" ? plan.price : null,
      deal_value_source: plan.collective === "Bhopal" ? "attached_product" : null,
    };
  }

  const dealProduct = await attachProductToDeal(dealId, product, plan, product_answer);
  const activity = await createPipedriveActivity(
    dealId,
    "Product mapped",
    [`Product: ${plan.name}`, `Value: INR ${plan.price.toLocaleString("en-IN")}`].join("<br>"),
    personId(deal),
  );

  return {
    dry_run: false,
    status: removedDealProductIds.length ? "repaired_stale_product" : existingProduct ? "attached" : "created_product_and_attached",
    deal_id: dealId,
    product_id: Number(product.id),
    product_name: plan.name,
    deal_product_id: Number(dealProduct?.id) || null,
    removed_deal_product_ids: removedDealProductIds,
    deal_value_set_to: plan.collective === "Bhopal" ? plan.price : null,
    deal_value_source: plan.collective === "Bhopal" ? "attached_product" : null,
    audit_activity_id: Number(activity?.id) || null,
  };
}
