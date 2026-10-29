import { beforeEach, describe, expect, mock, test } from "bun:test";

let dedupeRows = new Map<string, { status: "pending" | "sent" | "failed"; attempt_count: number }>();
const variableValues: Record<string, string> = {
  "f/sales/qualified_1on1_meta_capi/dataset_id": "synthetic-dataset-id",
  "f/sales/qualified_1on1_meta_capi/access_token": "synthetic-access-token",
  "f/facebook_ads_dashboard/META_GRAPH_VERSION": "v23.0",
  "f/sales/qualified_1on1_meta_capi/test_event_code": "TEST_SYNTHETIC",
};

mock.module("windmill-client", () => ({
  getVariable: async (path: string) => variableValues[path] || "",
  datatable: () => ({
    query: (sql: string, ...params: any[]) => ({
      fetchOne: async () => {
        if (/COUNT\(\*\) FILTER/i.test(sql)) return { minute_count: 0, hour_count: 0 };
        const eventId = String(params[0]);
        if (/INSERT INTO sales_automation\.meta_capi_signal_dedupe/i.test(sql)) {
          const existing = dedupeRows.get(eventId);
          if (existing && existing.status !== "failed") return null;
          const row = {
            status: "pending" as const,
            attempt_count: (existing?.attempt_count || 0) + 1,
          };
          dedupeRows.set(eventId, row);
          return { event_id: eventId, ...row };
        }
        if (/SELECT status FROM sales_automation\.meta_capi_signal_dedupe/i.test(sql)) {
          return dedupeRows.get(eventId) || null;
        }
        throw new Error(`Unexpected test SQL: ${sql}`);
      },
      execute: async () => {
        if (params.length >= 3 && params[2] === null) {
          throw new Error("Synthetic live datatable client rejects an untyped null parameter.");
        }
        const eventId = String(params[0]);
        const existing = dedupeRows.get(eventId);
        if (!existing) throw new Error("Missing synthetic idempotency row.");
        dedupeRows.set(eventId, { ...existing, status: params[1] });
      },
    }),
  }),
}));

const { isAllowedBeforestOrigin, main, preprocessor } = await import(
  "../f/sales/handle_typeform_qualified_1on1_signal.ts"
);
const fixtures = await Bun.file(`${import.meta.dir}/fixtures/typeform-qualified-1on1.json`).json();

const formRules = [
  ["CYae8hmZ", "113a9ad4-4d43-4165-9bf7-62f82b1352ab", "Bhopal"],
  ["kfcjiXxR", "1292d853-e1d7-438a-8f82-70fbad90e914", "Mumbai"],
  ["hbDB2ybS", "f8e95240-2bd9-4522-8eac-53860c400950", "Hammiyala"],
  ["i8eBLQkz", "4c30971d-c15d-42f8-90d1-94c19a475c4d", "Poomaale 2.0"],
  ["leXyUOuT", "113a9ad4-4d43-4165-9bf7-62f82b1352ab", "Hyderabad"],
] as const;

function fixture(name: keyof typeof fixtures): any {
  return structuredClone(fixtures[name]);
}

beforeEach(() => {
  dedupeRows = new Map();
  process.env.META_CAPI_RETRY_BASE_DELAY_MS = "0";
});

describe("Typeform qualified 1on1 Meta signal", () => {
  test("browser helper is valid JavaScript", async () => {
    const source = await Bun.file(
      `${import.meta.dir}/../workflow_sales/website_snippets/typeform_qualified_1on1_embed_signal.js`,
    ).text();
    expect(() => new Function(source)).not.toThrow();
  });

  test("accepts only HTTPS beforest.co origins", () => {
    expect(isAllowedBeforestOrigin("https://beforest.co")).toBe(true);
    expect(isAllowedBeforestOrigin("https://www.beforest.co")).toBe(true);
    expect(isAllowedBeforestOrigin("https://experiences.beforest.co")).toBe(true);
    expect(isAllowedBeforestOrigin("http://beforest.co")).toBe(false);
    expect(isAllowedBeforestOrigin("https://beforest.co.evil.example")).toBe(false);
  });

  test("HTTP preprocessor passes only parsed body and trusted transport metadata", async () => {
    const body = fixture("qualified_embed");
    const result = await preprocessor({
      kind: "http",
      raw_string: JSON.stringify(body),
      headers: { Origin: "https://beforest.co", "User-Agent": "synthetic" },
    });
    expect(result.body).toEqual(body);
    expect(result.request_origin).toBe("https://beforest.co");
    expect(result.use_test_event).toBe(false);
  });

  test("preprocessor preserves authenticated internal dry-run and Test Event arguments", async () => {
    const body = fixture("qualified_embed");
    const result = await preprocessor({
      kind: "script",
      body: {
        body,
        request_origin: "https://beforest.co",
        dry_run: true,
        use_test_event: true,
      },
    });
    expect(result).toEqual({
      body,
      request_origin: "https://beforest.co",
      dry_run: true,
      use_test_event: true,
    });
  });

  test("ignores an embed movement that is not the qualified destination", async () => {
    const result = await main(fixture("non_qualified_embed"), "https://beforest.co", true, false);
    expect(result.status).toBe("ignored");
    expect(result.qualification.qualified).toBe(false);
    expect(result.qualification.reason).toBe("question_is_not_qualified_1on1_destination");
  });

  test("rejects a qualified-looking signal from an untrusted origin", async () => {
    const result = await main(fixture("qualified_embed"), "https://evil.example", true, false);
    expect(result.status).toBe("ignored");
    expect(result.qualification.reason).toBe("untrusted_request_origin");
  });

  test("previews the exact qualified destination for all five collectives", async () => {
    for (const [formId, questionRef, collective] of formRules) {
      const payload = fixture("qualified_embed");
      payload.form_id = formId;
      payload.response_id = `synthetic-response-${formId}`;
      payload.question_ref = questionRef;
      const result = await main(payload, "https://www.beforest.co", true, false);
      expect(result.status).toBe("dry_run");
      expect(result.qualification.collective).toBe(collective);
      expect(result.meta_event_preview.event_name).toBe("Qualified1on1AnswerSignal");
      expect(result.meta_event_preview.user_data_keys).toEqual(["fbc", "fbp"]);
      expect(JSON.stringify(result)).not.toContain("synthetic-response-");
    }
  });

  test("uses an atomic claim plus a stable event id to ignore duplicate embed retries", async () => {
    let calls = 0;
    globalThis.fetch = (async (_url: any, init: any) => {
      calls += 1;
      expect(String(_url)).not.toContain("synthetic-access-token");
      expect(init.headers.authorization).toBe("Bearer synthetic-access-token");
      return new Response(JSON.stringify({ events_received: 1, fbtrace_id: "synthetic-trace" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const first = await main(fixture("qualified_embed"), "https://beforest.co", false, false);
    const second = await main(fixture("qualified_embed"), "https://beforest.co", false, false);
    expect(first.status).toBe("sent");
    expect(second.status).toBe("duplicate_ignored");
    expect(second.event_id).toBe(first.event_id);
    expect(calls).toBe(1);
  });

  test("completed response is a fallback with the same event id and hashed identity", async () => {
    const embed = await main(fixture("qualified_embed"), "https://beforest.co", true, false);
    const completed = await main(fixture("qualified_completed"), "", true, false);
    expect(completed.status).toBe("dry_run");
    expect(completed.meta_event_preview.event_id).toBe(embed.meta_event_preview.event_id);
    expect(completed.meta_event_preview.user_data_keys).toEqual(["em", "fbc", "fbp", "ph"]);
    expect(JSON.stringify(completed)).not.toContain("synthetic@example.com");
    expect(JSON.stringify(completed)).not.toContain("90000 00000");
    expect(JSON.stringify(completed)).not.toContain("Synthetic reason");
  });

  test("ignores a completed response that never reached the qualified destination", async () => {
    const result = await main(fixture("non_qualified_completed"), "", true, false);
    expect(result.status).toBe("ignored");
    expect(result.qualification.reason).toBe(
      "qualified_1on1_destination_not_present_in_completed_response",
    );
  });

  test("missing attribution is explicit and does not invent source data", async () => {
    const payload = fixture("qualified_embed");
    for (const key of ["fbp", "fbc", "fbclid", "utm_source", "utm_medium", "utm_campaign"]) {
      delete payload[key];
    }
    const result = await main(payload, "https://beforest.co", true, false);
    expect(result.meta_event_preview.event_source_url_present).toBe(true);
    expect(result.meta_event_preview.user_data_keys).toEqual([]);
    expect(result.meta_event_preview.custom_data).toEqual({
      collective: "Bhopal",
      qualification_rule_version: "typeform-primary-1on1-destination-v2-2026-08-06",
    });
  });

  test("retries retryable Meta failures and then records success", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      if (calls < 3) {
        return new Response(JSON.stringify({ error: { message: "synthetic failure" } }), {
          status: calls === 1 ? 500 : 429,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ events_received: 1 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    const result = await main(fixture("qualified_embed"), "https://beforest.co", false, true);
    expect(result.status).toBe("sent");
    expect(result.delivery.attempt).toBe(3);
    expect(result.test_event).toBe(true);
    expect(calls).toBe(3);
  });

  test("records a terminal Meta rejection as failed without an untyped null parameter", async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: { message: "synthetic rejection" } }), {
      status: 400,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;

    await expect(main(fixture("qualified_embed"), "https://beforest.co", false, true)).rejects.toThrow(
      "Meta CAPI request failed with HTTP 400.",
    );
    expect([...dedupeRows.values()][0]?.status).toBe("failed");
  });
});
