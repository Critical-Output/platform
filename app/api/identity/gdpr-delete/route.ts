import { NextResponse } from "next/server";

import { executeSql, getClickHouseConfigFromEnv } from "@/lib/clickhouse/http";
import {
  buildIdentityDeleteWhereClause,
  resolveLinkedIdentityIdentifiers,
} from "@/lib/identity/gdpr";

export const runtime = "nodejs";

type DeletePayload = {
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

const handleDelete = async (request: Request) => {
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

  const body = payload as DeletePayload;

  if (!buildIdentityDeleteWhereClause(body)) {
    return NextResponse.json(
      {
        ok: false,
        error: "At least one identifier is required (userId, email, phone, anonymousId)",
      },
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
    const linkedIdentifiers = await resolveLinkedIdentityIdentifiers({
      config,
      input: body,
    });
    const whereClause = linkedIdentifiers
      ? buildIdentityDeleteWhereClause(linkedIdentifiers)
      : null;

    if (!whereClause) {
      return NextResponse.json(
        {
          ok: false,
          error: "No matching identifiers found to delete",
        },
        { status: 400 },
      );
    }

    await executeSql({
      config,
      query: `ALTER TABLE \`identity_graph\` DELETE WHERE ${whereClause}`,
    });

    return NextResponse.json({
      ok: true,
      mutationQueued: true,
      note: "Deletion is asynchronous in ClickHouse MergeTree; run dbt identity models after mutation completes.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
};

export async function POST(request: Request) {
  return handleDelete(request);
}

export async function DELETE(request: Request) {
  return handleDelete(request);
}
