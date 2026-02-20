import { NextResponse } from "next/server";

import { getClickHouseConfigFromEnv } from "@/lib/clickhouse/http";
import { getIdentityProfileForUser } from "@/lib/identity/admin";
import { normalizeEmail, normalizeUserId } from "@/lib/identity/normalize";

export const runtime = "nodejs";

const isAuthorized = (request: Request): boolean => {
  const expectedKey = process.env.EVENTS_API_KEY?.trim();
  const isDevelopment = process.env.NODE_ENV === "development";

  if (!expectedKey) return isDevelopment;

  const got = request.headers.get("x-events-api-key")?.trim();
  return Boolean(got && got === expectedKey);
};

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const requestUrl = new URL(request.url);
  const userId = normalizeUserId(requestUrl.searchParams.get("user_id"));
  const email = normalizeEmail(requestUrl.searchParams.get("email"));

  if (!userId) {
    return NextResponse.json({ ok: false, error: "user_id query param is required" }, { status: 400 });
  }

  const config = getClickHouseConfigFromEnv();
  if (!config) {
    return NextResponse.json(
      { ok: false, error: "ClickHouse is not configured (CLICKHOUSE_URL missing)" },
      { status: 500 },
    );
  }

  try {
    const profile = await getIdentityProfileForUser({
      config,
      userId,
      email,
    });

    return NextResponse.json({ ok: true, profile });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
