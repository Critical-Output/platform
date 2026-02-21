import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { POST } from "../app/api/offers/select/route";

const testDependencyKey = "__PCC_OFFERS_SELECT_ROUTE_DEPS__";
const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  delete (globalThis as Record<string, unknown>)[testDependencyKey];
});

test("POST /api/offers/select returns cross-sell offer for CTI beginner completion", async () => {
  process.env.NODE_ENV = "production";
  process.env.OFFERS_API_KEY = "secret";

  (globalThis as Record<string, unknown>)[testDependencyKey] = {
    createAdminClient: () => ({} as any),
    loadCustomerContext: async () => ({
      customerId: "cust_1",
      brandId: "brand_1",
      events: [
        {
          event: "course_completed",
          occurredAt: "2026-02-21T03:00:00.000Z",
          properties: {
            course_title: "CTI Beginner Course",
            course_slug: "cti-beginner-course",
          },
        },
      ],
      profile: {
        segments: [],
        referralCount: 0,
      },
    }),
    now: () => new Date("2026-02-21T12:00:00.000Z"),
  };

  const request = new Request("http://localhost:3000/api/offers/select", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-offers-api-key": "secret",
    },
    body: JSON.stringify({
      customer_id: "cust_1",
      channel: "email",
    }),
  });

  const response = await POST(request);
  const json = (await response.json()) as {
    ok: boolean;
    journey_stage: string;
    offer: { id: string } | null;
  };

  assert.equal(response.status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.journey_stage, "customer");
  assert.equal(json.offer?.id, "cti-beginner-to-karen-advanced-coaching");
});

test("POST /api/offers/select validates channel", async () => {
  process.env.NODE_ENV = "production";
  process.env.OFFERS_API_KEY = "secret";

  (globalThis as Record<string, unknown>)[testDependencyKey] = {
    createAdminClient: () => ({} as any),
    loadCustomerContext: async () => null,
    now: () => new Date("2026-02-21T12:00:00.000Z"),
  };

  const request = new Request("http://localhost:3000/api/offers/select", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-offers-api-key": "secret",
    },
    body: JSON.stringify({
      customer_id: "cust_1",
      channel: "whatsapp",
    }),
  });

  const response = await POST(request);
  const json = (await response.json()) as { ok: boolean; error: string };

  assert.equal(response.status, 400);
  assert.equal(json.ok, false);
  assert.match(json.error, /channel must be one of/i);
});

test("POST /api/offers/select requires API key outside development", async () => {
  process.env.NODE_ENV = "production";
  process.env.OFFERS_API_KEY = "secret";

  const request = new Request("http://localhost:3000/api/offers/select", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      customer_id: "cust_1",
      channel: "email",
    }),
  });

  const response = await POST(request);
  const json = (await response.json()) as { ok: boolean; error: string };

  assert.equal(response.status, 401);
  assert.equal(json.ok, false);
  assert.match(json.error, /Unauthorized/i);
});
