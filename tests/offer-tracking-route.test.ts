import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { POST } from "../app/api/offers/track/route";

type FetchCall = {
  input: RequestInfo | URL;
  init?: RequestInit;
};

const originalEnv = { ...process.env };
const originalFetch = global.fetch;

afterEach(() => {
  process.env = { ...originalEnv };
  global.fetch = originalFetch;
});

test("POST /api/offers/track persists conversion metrics and affiliate attribution", async () => {
  process.env.NODE_ENV = "production";
  process.env.OFFERS_API_KEY = "secret";
  process.env.CLICKHOUSE_URL = "http://clickhouse.local:8123";
  process.env.CLICKHOUSE_DATABASE = "analytics";
  process.env.CLICKHOUSE_USER = "";
  process.env.CLICKHOUSE_PASSWORD = "";

  const fetchCalls: FetchCall[] = [];
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls.push({ input, init });
    return new Response("", { status: 200 });
  }) as typeof fetch;

  const request = new Request("http://localhost:3000/api/offers/track", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-offers-api-key": "secret",
    },
    body: JSON.stringify({
      customer_id: "cust_1",
      offer_id: "cti-beginner-to-karen-advanced-coaching",
      variant_id: "karen-advanced-a",
      channel: "email",
      event_type: "conversion",
      revenue_cents: 50000,
      attributed_instructor_id: "inst_44",
      attribution_channel: "karen-miles",
      affiliate_rate_bps: 3000,
      user_id: "user_1",
    }),
  });

  const response = await POST(request);
  const json = (await response.json()) as {
    ok: boolean;
    persisted: boolean;
    record: {
      affiliateRevenueShareCents: number;
      revenueAttributedCents: number;
    };
  };

  assert.equal(response.status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.persisted, true);
  assert.equal(json.record.revenueAttributedCents, 50000);
  assert.equal(json.record.affiliateRevenueShareCents, 15000);
  assert.equal(fetchCalls.length, 1);

  const insertBody = String(fetchCalls[0].init?.body ?? "").trim();
  const row = JSON.parse(insertBody) as {
    event_name: string;
    properties: string;
  };

  assert.equal(row.event_name, "offer_conversion");

  const properties = JSON.parse(row.properties) as {
    offer_id: string;
    affiliate_revenue_share_cents: number;
  };

  assert.equal(properties.offer_id, "cti-beginner-to-karen-advanced-coaching");
  assert.equal(properties.affiliate_revenue_share_cents, 15000);
});

test("POST /api/offers/track returns non-persisted record when ClickHouse is not configured", async () => {
  process.env.NODE_ENV = "production";
  process.env.OFFERS_API_KEY = "secret";
  delete process.env.CLICKHOUSE_URL;

  let fetchCalled = false;
  global.fetch = (async () => {
    fetchCalled = true;
    return new Response("", { status: 200 });
  }) as typeof fetch;

  const request = new Request("http://localhost:3000/api/offers/track", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-offers-api-key": "secret",
    },
    body: JSON.stringify({
      customer_id: "cust_1",
      offer_id: "free-content-to-paid-course",
      channel: "email",
      event_type: "impression",
    }),
  });

  const response = await POST(request);
  const json = (await response.json()) as { ok: boolean; persisted: boolean };

  assert.equal(response.status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.persisted, false);
  assert.equal(fetchCalled, false);
});

test("POST /api/offers/track returns 400 for non-object JSON payloads", async () => {
  process.env.NODE_ENV = "production";
  process.env.OFFERS_API_KEY = "secret";

  for (const body of ["null", "[]"]) {
    const request = new Request("http://localhost:3000/api/offers/track", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-offers-api-key": "secret",
      },
      body,
    });

    const response = await POST(request);
    const json = (await response.json()) as { ok: boolean; error: string };

    assert.equal(response.status, 400);
    assert.equal(json.ok, false);
    assert.equal(json.error, "Invalid payload: expected JSON object");
  }
});
