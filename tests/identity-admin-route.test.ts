import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";

import { GET } from "../app/api/identity/admin/route";

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
    return new Response(
      JSON.stringify({
        data: [
          {
            canonical_user_id: "user_42",
            anonymous_ids: ["anon_1", "anon_2"],
            emails: ["customer@example.com"],
            phones: ["14045550100"],
            device_fingerprints: ["fp_abc", "fp_linked"],
            match_methods: ["deterministic_login", "probabilistic_device_fingerprint"],
            edge_count: 3,
            last_seen: "2026-02-20 20:10:33.123",
          },
        ],
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  }) as typeof fetch;
});

after(() => {
  process.env = originalEnv;
  global.fetch = originalFetch;
});

test("GET /api/identity/admin returns linked identifier profile", async () => {
  const request = new Request(
    "http://localhost:3000/api/identity/admin?user_id=user_42&email=customer@example.com",
    {
      method: "GET",
      headers: { "x-events-api-key": "secret" },
    },
  );

  const response = await GET(request);
  const json = (await response.json()) as {
    ok: boolean;
    profile: {
      canonicalUserId: string;
      anonymousIds: string[];
      emails: string[];
      phones: string[];
      deviceFingerprints: string[];
      matchMethods: string[];
      edgeCount: number;
      lastSeen: string | null;
    };
  };

  assert.equal(response.status, 200);
  assert.equal(json.ok, true);
  assert.equal(fetchCalls.length, 1);
  const queryBody = String(fetchCalls[0]?.init?.body ?? "");
  assert.match(queryBody, /FROM identity_customer_profiles/);
  assert.equal(json.profile.canonicalUserId, "user_42");
  assert.equal(json.profile.anonymousIds.length, 2);
  assert.deepEqual(json.profile.emails, ["customer@example.com"]);
  assert.deepEqual(json.profile.phones, ["14045550100"]);
  assert.deepEqual(json.profile.deviceFingerprints, ["fp_abc", "fp_linked"]);
  assert.equal(json.profile.edgeCount, 3);
  assert.equal(json.profile.lastSeen, "2026-02-20 20:10:33.123");
});
