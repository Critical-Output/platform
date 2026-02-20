import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";

import type { ClickHouseConfig } from "../lib/clickhouse/http";
import { resolveLinkedIdentityIdentifiers } from "../lib/identity/gdpr";

const originalFetch = global.fetch;
const config: ClickHouseConfig = {
  url: "http://clickhouse.local:8123",
  database: "analytics",
};

beforeEach(() => {
  global.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => {
    return new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
});

after(() => {
  global.fetch = originalFetch;
});

test("resolveLinkedIdentityIdentifiers expands to fixed point beyond 8 iterations", async () => {
  let selectCalls = 0;
  global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = typeof init?.body === "string" ? init.body : "";
    if (!body.includes("SELECT") || !body.includes("FROM identity_graph")) {
      return new Response("", { status: 200 });
    }

    selectCalls += 1;
    const nextAnonymousId = selectCalls <= 9 ? `anon_${selectCalls}` : "anon_9";

    return new Response(
      JSON.stringify({
        data: [
          {
            user_id: "user_42",
            email: "customer@example.com",
            phone: null,
            anonymous_id: nextAnonymousId,
          },
        ],
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  }) as typeof fetch;

  const identifiers = await resolveLinkedIdentityIdentifiers({
    config,
    input: { email: "customer@example.com" },
    timeoutMs: 2000,
  });

  assert.ok(identifiers);
  assert.equal(selectCalls, 10);
  assert.ok(identifiers.anonymousIds.has("anon_9"));
  assert.ok(identifiers.userIds.has("user_42"));
});

test("resolveLinkedIdentityIdentifiers fails when explicit maxIterations is reached", async () => {
  let selectCalls = 0;
  global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = typeof init?.body === "string" ? init.body : "";
    if (!body.includes("SELECT") || !body.includes("FROM identity_graph")) {
      return new Response("", { status: 200 });
    }

    selectCalls += 1;
    return new Response(
      JSON.stringify({
        data: [
          {
            user_id: null,
            email: "customer@example.com",
            phone: null,
            anonymous_id: `anon_${selectCalls}`,
          },
        ],
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  }) as typeof fetch;

  await assert.rejects(
    resolveLinkedIdentityIdentifiers({
      config,
      input: { email: "customer@example.com" },
      maxIterations: 2,
      timeoutMs: 2000,
    }),
    /maxIterations=2/,
  );
  assert.equal(selectCalls, 2);
});
