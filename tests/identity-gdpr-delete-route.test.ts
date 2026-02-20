import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";

import { DELETE, POST } from "../app/api/identity/gdpr-delete/route";

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
    if (body.includes("SELECT") && body.includes("FROM identity_graph")) {
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response("", { status: 200 });
  }) as typeof fetch;
});

after(() => {
  process.env = originalEnv;
  global.fetch = originalFetch;
});

test("POST /api/identity/gdpr-delete submits ClickHouse delete mutation", async () => {
  const request = new Request("http://localhost:3000/api/identity/gdpr-delete", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-events-api-key": "secret",
    },
    body: JSON.stringify({ userId: "user_42", email: "customer@example.com" }),
  });

  const response = await POST(request);
  const json = (await response.json()) as { ok: boolean; mutationQueued: boolean };

  assert.equal(response.status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.mutationQueued, true);
  assert.equal(fetchCalls.length, 2);

  const queryBody = String(
    fetchCalls.find((call) => String(call.init?.body ?? "").includes("ALTER TABLE"))?.init?.body ?? "",
  );
  assert.match(queryBody, /ALTER TABLE `identity_graph` DELETE WHERE/);
  assert.match(queryBody, /user_id IN \('user_42'\)/);
  assert.match(queryBody, /lower\(email\) IN \('customer@example.com'\)/);
});

test("DELETE /api/identity/gdpr-delete rejects empty delete criteria", async () => {
  const request = new Request("http://localhost:3000/api/identity/gdpr-delete", {
    method: "DELETE",
    headers: {
      "content-type": "application/json",
      "x-events-api-key": "secret",
    },
    body: JSON.stringify({}),
  });

  const response = await DELETE(request);
  const json = (await response.json()) as { ok: boolean; error: string };

  assert.equal(response.status, 400);
  assert.equal(json.ok, false);
  assert.match(json.error, /identifier/i);
  assert.equal(fetchCalls.length, 0);
});

test("POST /api/identity/gdpr-delete expands linked identifiers before deletion", async () => {
  fetchCalls = [];
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls.push({ input, init });
    const body = typeof init?.body === "string" ? init.body : "";

    if (body.includes("SELECT") && body.includes("FROM identity_graph")) {
      return new Response(
        JSON.stringify({
          data: [
            {
              user_id: "user_42",
              email: "customer@example.com",
              phone: null,
              anonymous_id: "anon_first",
            },
            {
              user_id: "user_42",
              email: null,
              phone: "+1 (555) 123-4567",
              anonymous_id: "anon_second",
            },
          ],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }

    return new Response("", { status: 200 });
  }) as typeof fetch;

  const request = new Request("http://localhost:3000/api/identity/gdpr-delete", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-events-api-key": "secret",
    },
    body: JSON.stringify({ email: "customer@example.com" }),
  });

  const response = await POST(request);
  const json = (await response.json()) as { ok: boolean; mutationQueued: boolean };

  assert.equal(response.status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.mutationQueued, true);

  const selectCalls = fetchCalls.filter((call) =>
    String(call.init?.body ?? "").includes("FROM identity_graph"),
  );
  assert.ok(selectCalls.length >= 1);

  const queryBody = String(
    fetchCalls.find((call) => String(call.init?.body ?? "").includes("ALTER TABLE"))?.init?.body ?? "",
  );
  assert.match(queryBody, /ALTER TABLE `identity_graph` DELETE WHERE/);
  assert.match(queryBody, /user_id IN \('user_42'\)/);
  assert.match(queryBody, /lower\(email\) IN \('customer@example.com'\)/);
  assert.match(queryBody, /anonymous_id IN \('anon_first', 'anon_second'\)/);
  assert.match(queryBody, /replaceRegexpAll\(ifNull\(phone, ''\), '\[\^0-9\]', ''\) IN \('15551234567'\)/);
});

test("POST /api/identity/gdpr-delete treats +phone and non-+phone as the same identifier", async () => {
  fetchCalls = [];
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls.push({ input, init });
    const body = typeof init?.body === "string" ? init.body : "";
    if (body.includes("SELECT") && body.includes("FROM identity_graph")) {
      return new Response(
        JSON.stringify({
          data: [
            {
              user_id: "user_42",
              email: null,
              phone: "+1 (555) 123-4567",
              anonymous_id: "anon_phone_match",
            },
          ],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }

    return new Response("", { status: 200 });
  }) as typeof fetch;

  const request = new Request("http://localhost:3000/api/identity/gdpr-delete", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-events-api-key": "secret",
    },
    body: JSON.stringify({ phone: "15551234567" }),
  });

  const response = await POST(request);
  const json = (await response.json()) as { ok: boolean; mutationQueued: boolean };

  assert.equal(response.status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.mutationQueued, true);

  const selectBody = String(
    fetchCalls.find((call) => String(call.init?.body ?? "").includes("SELECT"))?.init?.body ?? "",
  );
  assert.match(selectBody, /replaceRegexpAll\(ifNull\(phone, ''\), '\[\^0-9\]', ''\) IN \('15551234567'\)/);

  const deleteBody = String(
    fetchCalls.find((call) => String(call.init?.body ?? "").includes("ALTER TABLE"))?.init?.body ?? "",
  );
  assert.match(deleteBody, /replaceRegexpAll\(ifNull\(phone, ''\), '\[\^0-9\]', ''\) IN \('15551234567'\)/);
});

test("POST /api/identity/gdpr-delete rejects null payloads with 400", async () => {
  const request = new Request("http://localhost:3000/api/identity/gdpr-delete", {
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
