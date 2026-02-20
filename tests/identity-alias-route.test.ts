import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";

import { POST } from "../app/api/identity/alias/route";

type FetchCall = {
  input: RequestInfo | URL;
  init?: RequestInit;
};

const originalEnv = { ...process.env };
const originalFetch = global.fetch;
let fetchCalls: FetchCall[] = [];

beforeEach(() => {
  process.env = { ...originalEnv };
  process.env.NODE_ENV = "production";
  process.env.EVENTS_API_KEY = "secret";
  process.env.CLICKHOUSE_URL = "http://clickhouse.local:8123";
  process.env.CLICKHOUSE_DATABASE = "analytics";
  process.env.CLICKHOUSE_USER = "";
  process.env.CLICKHOUSE_PASSWORD = "";

  fetchCalls = [];
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls.push({ input, init });

    const body = typeof init?.body === "string" ? init.body : "";
    const inputUrl = input.toString();

    if (body.includes("SELECT DISTINCT anonymous_id")) {
      return new Response(JSON.stringify({ data: [{ anonymous_id: "anon_from_history" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (inputUrl.includes("INSERT%20INTO") || inputUrl.includes("INSERT+INTO")) {
      return new Response("", { status: 200 });
    }

    return new Response("", { status: 200 });
  }) as typeof fetch;
});

after(() => {
  process.env = originalEnv;
  global.fetch = originalFetch;
});

test("POST /api/identity/alias merges known anonymous IDs for email identifiers", async () => {
  const request = new Request("http://localhost:3000/api/identity/alias", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-events-api-key": "secret",
    },
    body: JSON.stringify({
      userId: "user_42",
      email: "Customer@Example.com",
      anonymousId: "anon_current",
    }),
  });

  const response = await POST(request);
  const json = (await response.json()) as {
    ok: boolean;
    mergedCount: number;
    mergedAnonymousIds: string[];
    insertedRows: number;
  };

  assert.equal(response.status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.mergedCount, 2);
  assert.deepEqual(
    new Set(json.mergedAnonymousIds),
    new Set(["anon_from_history", "anon_current"]),
  );
  assert.equal(json.insertedRows, 2);
  assert.equal(fetchCalls.length, 2);

  const insertCall = fetchCalls.find((call) => call.input.toString().includes("INSERT"));
  assert.ok(insertCall);

  const insertBody = String(insertCall.init?.body ?? "").trim();
  const rows = insertBody
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { method: string; confidence: number });

  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.method === "deterministic_email"));
  assert.ok(rows.every((row) => row.confidence === 1));
});

test("POST /api/identity/alias rejects payloads without email or phone", async () => {
  const request = new Request("http://localhost:3000/api/identity/alias", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-events-api-key": "secret",
    },
    body: JSON.stringify({ userId: "user_42" }),
  });

  const response = await POST(request);
  const json = (await response.json()) as { ok: boolean; error: string };

  assert.equal(response.status, 400);
  assert.equal(json.ok, false);
  assert.match(json.error, /email or phone/i);
  assert.equal(fetchCalls.length, 0);
});

test("POST /api/identity/alias treats +phone and non-+phone as the same identifier", async () => {
  fetchCalls = [];
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls.push({ input, init });

    const body = typeof init?.body === "string" ? init.body : "";
    const inputUrl = input.toString();

    if (body.includes("SELECT DISTINCT anonymous_id")) {
      return new Response(JSON.stringify({ data: [{ anonymous_id: "anon_phone_history" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (inputUrl.includes("INSERT%20INTO") || inputUrl.includes("INSERT+INTO")) {
      return new Response("", { status: 200 });
    }

    return new Response("", { status: 200 });
  }) as typeof fetch;

  const request = new Request("http://localhost:3000/api/identity/alias", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-events-api-key": "secret",
    },
    body: JSON.stringify({
      userId: "user_42",
      phone: "+1 (555) 123-4567",
      anonymousId: "anon_current",
    }),
  });

  const response = await POST(request);
  const json = (await response.json()) as {
    ok: boolean;
    mergedCount: number;
    mergedAnonymousIds: string[];
    insertedRows: number;
  };

  assert.equal(response.status, 200);
  assert.equal(json.ok, true);
  assert.deepEqual(new Set(json.mergedAnonymousIds), new Set(["anon_phone_history", "anon_current"]));
  assert.equal(json.insertedRows, 2);

  const selectBody = String(
    fetchCalls.find((call) => String(call.init?.body ?? "").includes("SELECT DISTINCT anonymous_id"))?.init
      ?.body ?? "",
  );
  assert.match(selectBody, /replaceRegexpAll\(ifNull\(phone, ''\), '\[\^0-9\]', ''\) = '15551234567'/);

  const insertCall = fetchCalls.find((call) => call.input.toString().includes("INSERT"));
  assert.ok(insertCall);

  const insertBody = String(insertCall.init?.body ?? "").trim();
  const rows = insertBody
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { method: string; confidence: number; phone: string | null });

  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.method === "deterministic_phone"));
  assert.ok(rows.every((row) => row.phone === "15551234567"));
});

test("POST /api/identity/alias rejects null payloads with 400", async () => {
  const request = new Request("http://localhost:3000/api/identity/alias", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-events-api-key": "secret",
    },
    body: "null",
  });

  const response = await POST(request);
  const json = (await response.json()) as { ok: boolean; error: string };

  assert.equal(response.status, 400);
  assert.equal(json.ok, false);
  assert.match(json.error, /expected json object/i);
  assert.equal(fetchCalls.length, 0);
});
