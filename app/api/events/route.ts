import { NextResponse } from "next/server";

import { getClickHouseConfigFromEnv, insertJsonEachRow } from "@/lib/clickhouse/http";
import { mergeAnonymousSessionsForUser } from "@/lib/identity/alias";
import {
  formatClickHouseTimestamp,
  normalizeAnonymousId,
  normalizeDeviceFingerprint,
  normalizeEmail,
  normalizePhone,
  normalizeUserId,
} from "@/lib/identity/normalize";
import {
  ANALYTICS_ANON_ID_COOKIE,
  ANALYTICS_SESSION_ID_COOKIE,
} from "@/lib/rudderstack/constants";

export const runtime = "nodejs";

type JsonObject = Record<string, unknown>;

type SegmentLikeMessage = {
  type?: string;
  event?: string;
  name?: string;
  messageId?: string;
  anonymousId?: string;
  userId?: string;
  properties?: JsonObject;
  context?: JsonObject;
  traits?: JsonObject;
  timestamp?: string;
};

type InternalEvent = {
  event_name?: string;
  event_id?: string;
  anonymous_id?: string;
  user_id?: string;
  session_id?: string;
  properties?: JsonObject;
  context?: JsonObject;
  timestamp?: string;
};

type ClickHouseEventRow = {
  event_id: string;
  anonymous_id: string;
  user_id: string;
  session_id: string;
  event_name: string;
  properties: string;
  context: string;
  timestamp: string;
};

type ClickHouseIdentityRow = {
  anonymous_id: string;
  user_id: string;
  email?: string | null;
  phone?: string | null;
  device_fingerprint?: string | null;
  confidence: number;
  method: string;
  first_seen: string;
  last_seen: string;
  last_event_id: string;
  metadata: string;
};

type AliasMergeRequest = {
  userId: string;
  email?: string | null;
  phone?: string | null;
  anonymousId?: string | null;
};

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;
  if (v.length > 200) return null;
  return v;
};

const normalizeEventName = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;
  if (v.length > 200) return null;
  return v;
};

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const safeJsonStringify = (value: unknown): string => {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
};

const readCookie = (cookieHeader: string | null, name: string): string | null => {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((p) => p.trim());
  for (const part of parts) {
    if (!part) continue;
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq);
    if (k !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1));
    } catch {
      return null;
    }
  }
  return null;
};

const toClickHouseTimestamp = (value: unknown): string => {
  const date =
    typeof value === "string" && value.trim()
      ? new Date(value)
      : new Date();
  return formatClickHouseTimestamp(Number.isNaN(date.getTime()) ? new Date() : date);
};

const extractIdentityIdentifiers = (params: {
  traits?: JsonObject;
  properties: JsonObject;
  context: JsonObject;
}) => {
  const email = normalizeEmail(
    params.traits?.email ??
      params.properties.email ??
      params.properties.user_email,
  );

  const phone = normalizePhone(
    params.traits?.phone ??
      params.properties.phone ??
      params.properties.phone_number ??
      params.properties.mobile,
  );

  const contextDevice = params.context.device;
  const contextDeviceId =
    contextDevice && typeof contextDevice === "object"
      ? (contextDevice as { id?: unknown }).id
      : undefined;

  const deviceFingerprint = normalizeDeviceFingerprint(
    params.context.device_fingerprint ??
      params.context.deviceFingerprint ??
      contextDeviceId ??
      params.properties.device_fingerprint,
  );

  return { email, phone, deviceFingerprint };
};

const normalizeMessageToRows = (message: SegmentLikeMessage | InternalEvent, cookieHeader: string | null) => {
  const isSegment = "messageId" in message || "anonymousId" in message || "userId" in message;

  const eventNameFromPayload =
    normalizeEventName(
      (message as InternalEvent).event_name ?? (message as SegmentLikeMessage).event,
    ) ??
    ((message as SegmentLikeMessage).type === "page"
      ? "page_view"
      : normalizeEventName((message as SegmentLikeMessage).name));

  const eventName =
    eventNameFromPayload ??
    ((message as SegmentLikeMessage).type === "identify" ? "identify" : null);

  if (!eventName) return { ok: false as const, error: "Missing event name" };

  const eventIdCandidate = normalizeId(
    (message as InternalEvent).event_id ?? (message as SegmentLikeMessage).messageId,
  );
  const event_id = eventIdCandidate && isUuid(eventIdCandidate) ? eventIdCandidate : crypto.randomUUID();

  const anonymousId =
    normalizeAnonymousId((message as InternalEvent).anonymous_id) ??
    normalizeAnonymousId((message as SegmentLikeMessage).anonymousId) ??
    normalizeAnonymousId(readCookie(cookieHeader, ANALYTICS_ANON_ID_COOKIE)) ??
    "";

  const userId =
    normalizeUserId((message as InternalEvent).user_id) ??
    normalizeUserId((message as SegmentLikeMessage).userId) ??
    "";

  const contextObj =
    ((message as SegmentLikeMessage).context as JsonObject | undefined) ??
    ((message as InternalEvent).context as JsonObject | undefined) ??
    {};

  const sessionId =
    normalizeId((message as InternalEvent).session_id) ??
    normalizeId((contextObj as { session_id?: unknown }).session_id) ??
    normalizeId((contextObj as { sessionId?: unknown }).sessionId) ??
    normalizeId(readCookie(cookieHeader, ANALYTICS_SESSION_ID_COOKIE)) ??
    "";

  const traitsObj = (message as SegmentLikeMessage).traits as JsonObject | undefined;

  const propertiesObj =
    ((message as SegmentLikeMessage).properties as JsonObject | undefined) ??
    ((message as InternalEvent).properties as JsonObject | undefined) ??
    // RudderStack/Segment identify payloads use traits.
    traitsObj ??
    {};

  const timestamp = toClickHouseTimestamp(
    (message as SegmentLikeMessage).timestamp ?? (message as InternalEvent).timestamp,
  );

  const eventRow: ClickHouseEventRow = {
    event_id,
    anonymous_id: anonymousId,
    user_id: userId,
    session_id: sessionId,
    event_name: eventName,
    properties: safeJsonStringify(propertiesObj),
    context: safeJsonStringify(contextObj),
    timestamp,
  };

  const identityRows: ClickHouseIdentityRow[] = [];
  let aliasMergeRequest: AliasMergeRequest | null = null;
  const identifiers = extractIdentityIdentifiers({
    traits: isSegment ? traitsObj : undefined,
    properties: propertiesObj,
    context: contextObj,
  });

  if (anonymousId && userId) {
    identityRows.push({
      anonymous_id: anonymousId,
      user_id: userId,
      email: identifiers.email ?? null,
      phone: identifiers.phone ?? null,
      device_fingerprint: identifiers.deviceFingerprint ?? null,
      confidence: 1.0,
      method: eventName === "identify" ? "deterministic_login" : "deterministic_user_id",
      first_seen: timestamp,
      last_seen: timestamp,
      last_event_id: event_id,
      metadata: safeJsonStringify({ source: "api/events" }),
    });

    if (eventName === "identify" && (identifiers.email || identifiers.phone)) {
      aliasMergeRequest = {
        userId,
        email: identifiers.email,
        phone: identifiers.phone,
        anonymousId,
      };
    }
  }

  if (anonymousId && !userId && identifiers.deviceFingerprint) {
    identityRows.push({
      anonymous_id: anonymousId,
      user_id: "",
      email: identifiers.email ?? null,
      phone: identifiers.phone ?? null,
      device_fingerprint: identifiers.deviceFingerprint,
      confidence: 0.8,
      method: "probabilistic_device_fingerprint_observation",
      first_seen: timestamp,
      last_seen: timestamp,
      last_event_id: event_id,
      metadata: safeJsonStringify({
        source: "api/events",
        anonymous_observation: true,
      }),
    });
  }

  return { ok: true as const, eventRow, identityRows, aliasMergeRequest };
};

export async function POST(request: Request) {
  const expectedKey = process.env.EVENTS_API_KEY?.trim();
  const isDevelopment = process.env.NODE_ENV === "development";

  if (!expectedKey && !isDevelopment) {
    return NextResponse.json(
      { ok: false, error: "Server misconfigured: EVENTS_API_KEY is required outside development" },
      { status: 500 },
    );
  }

  if (expectedKey) {
    const got = request.headers.get("x-events-api-key")?.trim();
    if (!got || got !== expectedKey) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  let payload: unknown;
  try {
    payload = (await request.json()) as unknown;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const cookieHeader = request.headers.get("cookie");

    const rawMessages: unknown[] = Array.isArray(payload) ? payload : [payload];
    if (rawMessages.length === 0) {
      return NextResponse.json({ ok: false, error: "Payload must include at least one event object" }, { status: 400 });
    }

    const messages: (SegmentLikeMessage | InternalEvent)[] = [];
    for (let index = 0; index < rawMessages.length; index += 1) {
      const msg = rawMessages[index];
      if (!msg || typeof msg !== "object" || Array.isArray(msg)) {
        return NextResponse.json(
          { ok: false, error: `Invalid event at index ${index}: expected object` },
          { status: 400 },
        );
      }
      messages.push(msg as SegmentLikeMessage | InternalEvent);
    }

    const eventRows: ClickHouseEventRow[] = [];
    const identityRows: ClickHouseIdentityRow[] = [];
    const aliasMergeRequests: AliasMergeRequest[] = [];

    for (const msg of messages) {
      const normalized = normalizeMessageToRows(msg, cookieHeader);
      if (!normalized.ok) {
        return NextResponse.json({ ok: false, error: normalized.error }, { status: 400 });
      }
      eventRows.push(normalized.eventRow);
      identityRows.push(...normalized.identityRows);
      if (normalized.aliasMergeRequest) {
        aliasMergeRequests.push(normalized.aliasMergeRequest);
      }
    }

    if (eventRows.length === 0) {
      return NextResponse.json({ ok: false, error: "Payload must include at least one event object" }, { status: 400 });
    }

    const config = getClickHouseConfigFromEnv();
    if (!config) {
      return NextResponse.json(
        { ok: false, error: "ClickHouse is not configured (CLICKHOUSE_URL missing)" },
        { status: 500 },
      );
    }

    await insertJsonEachRow({ config, table: "events", rows: eventRows });
    if (identityRows.length > 0) {
      await insertJsonEachRow({ config, table: "identity_graph", rows: identityRows });
    }

    if (aliasMergeRequests.length > 0) {
      const dedupedRequests = new Map<string, AliasMergeRequest>();
      for (const requestItem of aliasMergeRequests) {
        const key = `${requestItem.userId}|${requestItem.email ?? ""}|${requestItem.phone ?? ""}|${requestItem.anonymousId ?? ""}`;
        if (!dedupedRequests.has(key)) {
          dedupedRequests.set(key, requestItem);
        }
      }

      for (const requestItem of Array.from(dedupedRequests.values())) {
        await mergeAnonymousSessionsForUser({
          config,
          userId: requestItem.userId,
          email: requestItem.email,
          phone: requestItem.phone,
          anonymousId: requestItem.anonymousId,
          source: "api/events-identify",
        });
      }
    }

    return NextResponse.json({ ok: true, inserted: eventRows.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
