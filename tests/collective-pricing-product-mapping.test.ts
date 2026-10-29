import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";

mock.module("windmill-client", () => ({
  getVariable: async () => "test-pipedrive-token",
}));

let main: typeof import("../f/sales/map_deal_product_from_collective").main;

beforeAll(async () => {
  ({ main } = await import("../f/sales/map_deal_product_from_collective"));
});

async function resolve(pipelineId: number, productAnswer: string) {
  return await main(0, true, productAnswer, pipelineId, false) as any;
}

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function installBhopalPipedriveMock(existingDealProducts: any[] = []) {
  const calls: Array<{ method: string; path: string; body: any }> = [];
  const product = { id: 5026, code: "BHPL_2AC", name: "Bhopal #2AC" };

  globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = String(init?.method || "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ method, path: url.pathname, body });

    const response = (data: any) => new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

    if (method === "GET" && url.pathname === "/api/v2/deals/15440") {
      return response({ id: 15440, pipeline_id: 4, person_id: { value: 77 }, title: "Redacted" });
    }
    if (method === "GET" && url.pathname === "/api/v1/deals/15440/products") {
      return response(existingDealProducts);
    }
    if (method === "GET" && url.pathname === "/api/v1/products") {
      return response([product]);
    }
    if (method === "PUT" && url.pathname === "/api/v1/products/5026") {
      return response(product);
    }
    if (method === "DELETE" && url.pathname.startsWith("/api/v1/deals/15440/products/")) {
      return response(true);
    }
    if (method === "POST" && url.pathname === "/api/v1/deals/15440/products") {
      return response({ id: 7001, product_id: 5026 });
    }
    if (method === "POST" && url.pathname === "/api/v1/activities") {
      return response({ id: 9001 });
    }

    throw new Error(`Unexpected Pipedrive request: ${method} ${url.pathname}`);
  }) as typeof fetch;

  return calls;
}

describe("August 2026 prospective product mapping", () => {
  test("maps the revised Mumbai offer", async () => {
    const result = await resolve(2, "₹8.01 Cr all-inclusive for 3 acres and a 2,400 sq. ft. Earth Home");
    expect(result.plan.code).toBe("MUM_EARTH_HOME_2026_08");
    expect(result.plan.price).toBe(80100000);
  });

  test("distinguishes both revised Hammiyala offers", async () => {
    const privateEstate = await resolve(1, "Private Estate — ₹3.46 Cr all-inclusive with a 2,200 sq. ft. Earth Home");
    const foundersDistrict = await resolve(1, "Founder's District — ₹3.52 Cr all-inclusive with a 1,500 sq. ft. Earth Home");
    expect(privateEstate.plan.code).toBe("HAMM_PRIVATE_ESTATE_2026_08");
    expect(privateEstate.plan.price).toBe(34600000);
    expect(foundersDistrict.plan.code).toBe("HAMM_FOUNDERS_DISTRICT_2026_08");
    expect(foundersDistrict.plan.price).toBe(35200000);
  });

  test("maps the revised Poomaale acknowledgement label", async () => {
    const result = await resolve(3, "Yes — I understand the all-inclusive price is ₹3.70 Cr.");
    expect(result.plan.code).toBe("POO_2_0_2_5AC_2026_08");
    expect(result.plan.price).toBe(37000000);
  });
});

describe("transition compatibility", () => {
  test("keeps legacy answers on legacy products", async () => {
    expect((await resolve(2, "A standard Earth Home starting at 3.88cr")).plan.code).toBe("Mum_Earth_Home");
    expect((await resolve(3, "Yes")).plan.code).toBe("POO_2.0_2.5AC");
    expect((await resolve(1, "2-3 Cr for 1 ac undivided share + home")).plan.code).toBe("HAMM_1AC");
    expect((await resolve(1, "~4.5 Cr for 2 ac undivided share + home")).plan.code).toBe("HAMM_2AC");
  });

  test("does not attach a priced product when no offer was selected", async () => {
    expect((await resolve(2, "Not ready yet — keep me posted.")).plan).toBeNull();
    expect((await resolve(1, "Not ready at the moment, but keep me posted.")).plan).toBeNull();
    expect((await resolve(3, "Not sure, I'm just exploring")).plan).toBeNull();
  });

  test("preserves the live Bhopal offer mapping", async () => {
    const current = await resolve(4, "Private estate with a divided share of 10,800 sq. ft. and UDS of 2 acres, priced at ₹3.33 Cr");
    const notReady = await resolve(4, "Not ready at the moment");
    expect(current.plan.code).toBe("BHPL_2AC");
    expect(current.plan.price).toBe(33300000);
    expect(notReady.plan).toBeNull();
  });
});

describe("Bhopal product-derived deal value", () => {
  const currentAnswer = "Private estate with a divided share of 10,800 sq. ft. and UDS of 2 acres, priced at ₹3.33 Cr";

  test("attaches the current product without a forbidden deal-value PUT", async () => {
    const calls = installBhopalPipedriveMock();
    const result = await main(15440, false, currentAnswer) as any;

    expect(result.status).toBe("attached");
    expect(result.product_id).toBe(5026);
    expect(result.deal_value_set_to).toBe(33300000);
    expect(result.deal_value_source).toBe("attached_product");
    expect(result.audit_activity_id).toBe(9001);
    expect(calls.some((call) => call.method === "PUT" && call.path === "/api/v1/deals/15440")).toBe(false);
    expect(calls.some((call) => call.method === "POST" && call.path === "/api/v1/deals/15440/products")).toBe(true);
    expect(calls.some((call) => call.method === "POST" && call.path === "/api/v1/activities")).toBe(true);
  });

  test("keeps a correctly priced attached product idempotently without a deal-value PUT", async () => {
    const calls = installBhopalPipedriveMock([
      { id: 7101, product_id: 5026, name: "Bhopal #2AC", item_price: 33300000 },
    ]);
    const result = await main(15440, false, currentAnswer) as any;

    expect(result.status).toBe("already_attached");
    expect(result.deal_value_source).toBe("attached_product");
    expect(calls.some((call) => call.method === "PUT" && call.path === "/api/v1/deals/15440")).toBe(false);
    expect(calls.some((call) => call.method === "POST" && call.path === "/api/v1/deals/15440/products")).toBe(false);
    expect(calls.some((call) => call.method === "POST" && call.path === "/api/v1/activities")).toBe(false);
  });

  test("repairs a stale Bhopal deal-product price by reattaching instead of overwriting deal value", async () => {
    const calls = installBhopalPipedriveMock([
      { id: 7102, product_id: 5026, name: "Bhopal #2AC", item_price: 7560000 },
    ]);
    const result = await main(15440, false, currentAnswer) as any;

    expect(result.status).toBe("repaired_stale_product");
    expect(result.removed_deal_product_ids).toEqual([7102]);
    expect(result.deal_value_source).toBe("attached_product");
    expect(calls.some((call) => call.method === "DELETE" && call.path === "/api/v1/deals/15440/products/7102")).toBe(true);
    expect(calls.some((call) => call.method === "POST" && call.path === "/api/v1/deals/15440/products")).toBe(true);
    expect(calls.some((call) => call.method === "PUT" && call.path === "/api/v1/deals/15440")).toBe(false);
  });
});
