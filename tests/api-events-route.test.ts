import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";

import { POST } from "../app/api/events/route";

type FetchCall = {
  input: RequestInfo | URL;
  init?: RequestInit;
};

const parseJsonEachRowBody = <T>(body: string): T[] =>
  body
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);

const originalEnv = { ...process.env };
const originalFetch = global.fetch;
let fetchCalls: FetchCall[] = [];

const resetEnv = () => {
  process.env = { ...originalEnv };
  process.env.CLICKHOUSE_URL = "http://clickhouse.local:8123";
  process.env.CLICKHOUSE_DATABASE = "analytics";
  process.env.CLICKHOUSE_USER = "";
  process.env.CLICKHOUSE_PASSWORD = "";
};

const setFetchOk = () => {
  fetchCalls = [];
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls.push({ input, init });
    return new Response("", { status: 200 });
  }) as typeof fetch;
};

beforeEach(() => {
  resetEnv();
  setFetchOk();
});

after(() => {
  process.env = originalEnv;
  global.fetch = originalFetch;
});

test("POST accepts a valid Segment track payload", async () => {
  process.env.NODE_ENV = "production";
  process.env.EVENTS_API_KEY = "secret";

  const payload = {
    type: "track",
    event: "booking_created",
    messageId: "0a8db678-f73f-4636-a20d-23d4df011f57",
    anonymousId: "anon_123",
    properties: { booking_id: "bk_123" },
  };

  const request = new Request("http://localhost:3000/api/events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-events-api-key": "secret",
    },
    body: JSON.stringify(payload),
  });

  const response = await POST(request);
  assert.equal(response.status, 200);
  assert.equal(fetchCalls.length, 1);

  const json = (await response.json()) as { ok: boolean; inserted: number };
  assert.equal(json.ok, true);
  assert.equal(json.inserted, 1);
});

test("POST rejects invalid non-object payload items", async () => {
  process.env.NODE_ENV = "production";
  process.env.EVENTS_API_KEY = "secret";

  const request = new Request("http://localhost:3000/api/events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-events-api-key": "secret",
    },
    body: JSON.stringify([1, 2]),
  });

  const response = await POST(request);
  assert.equal(response.status, 400);
  assert.equal(fetchCalls.length, 0);

  const json = (await response.json()) as { ok: boolean; error: string };
  assert.equal(json.ok, false);
  assert.match(json.error, /Invalid event at index 0/);
});

test("POST tolerates malformed cookie headers without throwing", async () => {
  process.env.NODE_ENV = "production";
  process.env.EVENTS_API_KEY = "secret";

  const request = new Request("http://localhost:3000/api/events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-events-api-key": "secret",
      cookie: "pcc_aid=%E0%A4%A; pcc_sid=session_123",
    },
    body: JSON.stringify({ type: "track", event: "video_play" }),
  });

  const response = await POST(request);
  assert.equal(response.status, 200);
  assert.equal(fetchCalls.length, 1);

  const json = (await response.json()) as { ok: boolean; inserted: number };
  assert.equal(json.ok, true);
  assert.equal(json.inserted, 1);
});

test("POST rejects empty payload arrays", async () => {
  process.env.NODE_ENV = "production";
  process.env.EVENTS_API_KEY = "secret";

  const request = new Request("http://localhost:3000/api/events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-events-api-key": "secret",
    },
    body: JSON.stringify([]),
  });

  const response = await POST(request);
  assert.equal(response.status, 400);
  assert.equal(fetchCalls.length, 0);

  const json = (await response.json()) as { ok: boolean; error: string };
  assert.equal(json.ok, false);
  assert.match(json.error, /at least one event object/);
});

test("POST requires EVENTS_API_KEY outside development", async () => {
  process.env.NODE_ENV = "production";
  delete process.env.EVENTS_API_KEY;

  const request = new Request("http://localhost:3000/api/events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ type: "track", event: "page_view" }),
  });

  const response = await POST(request);
  assert.equal(response.status, 500);
  assert.equal(fetchCalls.length, 0);

  const json = (await response.json()) as { ok: boolean; error: string };
  assert.equal(json.ok, false);
  assert.match(json.error, /EVENTS_API_KEY/);
});

test("POST records anonymous fingerprint observations and supports canonical backfill", async () => {
  process.env.NODE_ENV = "production";
  process.env.EVENTS_API_KEY = "secret";

  const request = new Request("http://localhost:3000/api/events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-events-api-key": "secret",
    },
    body: JSON.stringify([
      {
        type: "track",
        event: "page_view",
        messageId: "2481856f-fe62-4b5e-ae67-cd82fc2aa2b6",
        anonymousId: "anon_pre_login",
        context: {
          device_fingerprint: "fp_shared_device",
        },
      },
      {
        type: "identify",
        messageId: "8af3a7a3-7449-4288-af67-20adc3d85981",
        anonymousId: "anon_after_login",
        userId: "user_42",
        context: {
          device_fingerprint: "fp_shared_device",
        },
      },
    ]),
  });

  const response = await POST(request);
  const json = (await response.json()) as { ok: boolean; inserted: number };

  assert.equal(response.status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.inserted, 2);
  assert.equal(fetchCalls.length, 2);

  const eventInsertBody = String(
    fetchCalls.find((call) => String(call.init?.body ?? "").includes('"event_name"'))?.init?.body ?? "",
  );
  const identityInsertBody = String(
    fetchCalls.find((call) => String(call.init?.body ?? "").includes('"device_fingerprint"'))?.init?.body ?? "",
  );
  assert.ok(eventInsertBody);
  assert.ok(identityInsertBody);

  const eventRows = parseJsonEachRowBody<{ anonymous_id: string; user_id: string }>(eventInsertBody);
  const identityRows = parseJsonEachRowBody<{
    anonymous_id: string;
    user_id: string;
    device_fingerprint: string | null;
  }>(identityInsertBody);

  const anonymousFingerprintRow = identityRows.find(
    (row) => row.anonymous_id === "anon_pre_login" && row.device_fingerprint === "fp_shared_device",
  );
  assert.ok(anonymousFingerprintRow);
  assert.equal(anonymousFingerprintRow.user_id, "");

  const fingerprintToCanonicalUser = new Map<string, string>();
  for (const row of identityRows) {
    if (!row.device_fingerprint || !row.user_id) continue;
    const current = fingerprintToCanonicalUser.get(row.device_fingerprint);
    if (!current || row.user_id < current) {
      fingerprintToCanonicalUser.set(row.device_fingerprint, row.user_id);
    }
  }

  const aliasByAnonymousId = new Map<string, string>();
  for (const row of identityRows) {
    if (!row.anonymous_id || !row.device_fingerprint) continue;
    const canonicalUserId = fingerprintToCanonicalUser.get(row.device_fingerprint);
    if (canonicalUserId) {
      aliasByAnonymousId.set(row.anonymous_id, canonicalUserId);
    }
  }

  const preLoginEvent = eventRows.find(
    (row) => row.anonymous_id === "anon_pre_login" && row.user_id === "",
  );
  assert.ok(preLoginEvent);
  const canonicalUserId = preLoginEvent.user_id || aliasByAnonymousId.get(preLoginEvent.anonymous_id);
  assert.equal(canonicalUserId, "user_42");
});

test("POST identify payload triggers alias merge for email-linked anonymous sessions", async () => {
  process.env.NODE_ENV = "production";
  process.env.EVENTS_API_KEY = "secret";

  fetchCalls = [];
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls.push({ input, init });

    const body = typeof init?.body === "string" ? init.body : "";
    if (body.includes("SELECT DISTINCT anonymous_id")) {
      return new Response(JSON.stringify({ data: [{ anonymous_id: "anon_historical" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response("", { status: 200 });
  }) as typeof fetch;

  const request = new Request("http://localhost:3000/api/events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-events-api-key": "secret",
    },
    body: JSON.stringify({
      type: "identify",
      messageId: "7f5f10c4-8348-4d9b-9be1-3d940ddf84ad",
      anonymousId: "anon_current",
      userId: "user_42",
      traits: {
        email: "customer@example.com",
      },
    }),
  });

  const response = await POST(request);
  const json = (await response.json()) as { ok: boolean; inserted: number };

  assert.equal(response.status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.inserted, 1);
  assert.equal(fetchCalls.length, 4);

  const queryCall = fetchCalls.find((call) =>
    typeof call.init?.body === "string" && call.init.body.includes("SELECT DISTINCT anonymous_id"),
  );
  assert.ok(queryCall);
});
