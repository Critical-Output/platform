import { NextResponse } from "next/server";

import { getClickHouseConfigFromEnv } from "@/lib/clickhouse/http";
import { mergeAnonymousSessionsForUser } from "@/lib/identity/alias";
import { normalizeAnonymousId, normalizeEmail, normalizePhone, normalizeUserId } from "@/lib/identity/normalize";

export const runtime = "nodejs";

type AliasPayload = {
  userId?: unknown;
  email?: unknown;
  phone?: unknown;
  anonymousId?: unknown;
};

const isAuthorized = (request: Request): boolean => {
  const expectedKey = process.env.EVENTS_API_KEY?.trim();
  const isDevelopment = process.env.NODE_ENV === "development";

  if (!expectedKey) return isDevelopment;

  const got = request.headers.get("x-events-api-key")?.trim();
  return Boolean(got && got === expectedKey);
};

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = (await request.json()) as unknown;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json(
      { ok: false, error: "Invalid payload: expected JSON object" },
      { status: 400 },
    );
  }

  const body = payload as AliasPayload;

  const userId = normalizeUserId(body.userId);
  const email = normalizeEmail(body.email);
  const phone = normalizePhone(body.phone);
  const anonymousId = normalizeAnonymousId(body.anonymousId);

  if (!userId) {
    return NextResponse.json({ ok: false, error: "userId is required" }, { status: 400 });
  }

  if (!email && !phone) {
    return NextResponse.json(
      { ok: false, error: "At least one of email or phone is required" },
      { status: 400 },
    );
  }

  const config = getClickHouseConfigFromEnv();
  if (!config) {
    return NextResponse.json(
      { ok: false, error: "ClickHouse is not configured (CLICKHOUSE_URL missing)" },
      { status: 500 },
    );
  }

  try {
    const merged = await mergeAnonymousSessionsForUser({
      config,
      userId,
      email,
      phone,
      anonymousId,
      source: "api/identity/alias",
    });

    return NextResponse.json({
      ok: true,
      userId,
      mergedAnonymousIds: merged.mergedAnonymousIds,
      mergedCount: merged.mergedAnonymousIds.length,
      insertedRows: merged.insertedRows,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
