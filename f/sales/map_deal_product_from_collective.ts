import * as wmill from "windmill-client";

const PIPEDRIVE_VARIABLE_PATH = "f/collectives/zoom_collective_to_pipedrive/pipedrive_api_key";
const DEFAULT_PIPEDRIVE_DOMAIN = "beforest";
const BEFOREST_ADMIN_USER_ID = 18891506;

const PRODUCT_BY_PIPELINE: Record<number, ProductPlan> = {
  1: {
    collective: "Hammiyala",
    name: "Hammiyala #2 AC",
    code: "HAMM_2AC",
    description: "2 acre undivided share including a 500/1000 sqyd plot in housing zone at 2.05cr",
    price: 20500000,
  },
  2: {
    collective: "Mumbai",
    name: "Mumbai #Earth Home",
    code: "Mum_Earth_Home",
    description: "Earth Home set in 1000 sqyd in a 105 acre collective starting at 3.88cr all inclusive including maintenance",
    price: 38800000,
  },
  3: {
    collective: "Poomaale 2.0",
    name: "Poomaale 2.0 #2.5AC",
    code: "POO_2.0_2.5AC",
    description: "1.45 Cr onwards for 2.5 acre share in 100+ acre collective",
    price: 14500000,
  },
  4: {
    collective: "Bhopal",
    name: "Bhopal #1AC",
    code: "BHPL_1AC",
    description: "1 acre undivided share including a 500 sqyd plot on housing zone at 75.6L",
    price: 7560000,
  },
};

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

  const response = await fetch(url, {
    method,
    headers: options.body ? { "content-type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
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

async function getDealProducts(dealId: number): Promise<any[]> {
  const payload = await pipedriveRequest("GET", `deals/${dealId}/products`, {
    params: { include_product_data: 1 },
  });
  return payload.data || [];
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

export async function main(deal_id: number, dry_run = false, product_answer = "") {
  const dealId = Number(deal_id);
  if (!Number.isFinite(dealId) || dealId <= 0) throw new Error("deal_id is required.");

  const deal = await getDeal(dealId);
  const plan = PRODUCT_BY_PIPELINE[pipelineId(deal) || 0];
  if (!plan) {
    return { status: "ignored", reason: "Unsupported pipeline for product mapping.", deal_id: dealId };
  }

  const existingProduct = await findProduct(plan);
  const existingDealProducts = await getDealProducts(dealId);
  const alreadyAttached = existingDealProducts.some((item) => Number(item.product_id) === Number(existingProduct?.id));

  if (dry_run) {
    return {
      dry_run: true,
      status: alreadyAttached ? "already_attached" : "would_attach",
      deal_id: dealId,
      deal_title: deal.title || null,
      product_exists: Boolean(existingProduct),
      product_id: Number(existingProduct?.id) || null,
      plan,
      existing_deal_product_count: existingDealProducts.length,
    };
  }

  const product = existingProduct || (await createProduct(plan));
  if (existingDealProducts.some((item) => Number(item.product_id) === Number(product.id))) {
    return {
      dry_run: false,
      status: "already_attached",
      deal_id: dealId,
      product_id: Number(product.id),
      product_name: plan.name,
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
    status: existingProduct ? "attached" : "created_product_and_attached",
    deal_id: dealId,
    product_id: Number(product.id),
    product_name: plan.name,
    deal_product_id: Number(dealProduct?.id) || null,
    audit_activity_id: Number(activity?.id) || null,
  };
}
