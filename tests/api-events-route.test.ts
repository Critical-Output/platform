import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";

import { POST } from "../app/api/events/route";

type FetchCall = {
  input: RequestInfo | URL;
  init?: RequestInit;
};

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
