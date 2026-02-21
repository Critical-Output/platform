import { NextResponse } from "next/server";

import { getClickHouseConfigFromEnv, insertJsonEachRow } from "@/lib/clickhouse/http";
import { formatClickHouseTimestamp } from "@/lib/identity/normalize";
import {
  buildOfferPerformanceRecord,
  isOfferChannel,
  isOfferPerformanceEventType,
  type OfferChannel,
  type OfferPerformanceEventType,
} from "@/lib/intelligence/engine";

export const runtime = "nodejs";

type TrackOfferPayload = {
  customer_id?: unknown;
  offer_id?: unknown;
  variant_id?: unknown;
  channel?: unknown;
  event_type?: unknown;
  occurred_at?: unknown;
  revenue_cents?: unknown;
  attributed_instructor_id?: unknown;
  attribution_channel?: unknown;
  affiliate_rate_bps?: unknown;
  anonymous_id?: unknown;
  user_id?: unknown;
  session_id?: unknown;
};

const asTrimmedString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const asObject = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const asFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const isAuthorized = (request: Request): { authorized: boolean; misconfigured: boolean } => {
  const expectedKey = process.env.OFFERS_API_KEY?.trim();
  const isDevelopment = process.env.NODE_ENV === "development";

  if (!expectedKey) {
    return {
      authorized: isDevelopment,
      misconfigured: !isDevelopment,
    };
  }

  const providedKey = request.headers.get("x-offers-api-key")?.trim();
  return {
    authorized: Boolean(providedKey && providedKey === expectedKey),
    misconfigured: false,
  };
};

export async function POST(request: Request) {
  const auth = isAuthorized(request);
  if (auth.misconfigured) {
    return NextResponse.json(
      { ok: false, error: "Server misconfigured: OFFERS_API_KEY is required" },
      { status: 500 },
    );
  }

  if (!auth.authorized) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const body = asObject(payload);
  if (!body) {
    return NextResponse.json({ ok: false, error: "Invalid payload: expected JSON object" }, { status: 400 });
  }

  const normalizedPayload = body as TrackOfferPayload;

  const customerId = asTrimmedString(normalizedPayload.customer_id);
  const offerId = asTrimmedString(normalizedPayload.offer_id);
  const channelRaw = asTrimmedString(normalizedPayload.channel);
  const eventTypeRaw = asTrimmedString(normalizedPayload.event_type);

  if (!customerId || !offerId) {
    return NextResponse.json(
      { ok: false, error: "customer_id and offer_id are required" },
      { status: 400 },
    );
  }

  if (!channelRaw || !isOfferChannel(channelRaw)) {
    return NextResponse.json(
      { ok: false, error: "channel must be one of: email, sms, push, in_app, qr" },
      { status: 400 },
    );
  }

  if (!eventTypeRaw || !isOfferPerformanceEventType(eventTypeRaw)) {
    return NextResponse.json(
      { ok: false, error: "event_type must be one of: impression, click, conversion" },
      { status: 400 },
    );
  }

  const channel = channelRaw as OfferChannel;
  const eventType = eventTypeRaw as OfferPerformanceEventType;

  const record = buildOfferPerformanceRecord({
    customerId,
    offerId,
    variantId: asTrimmedString(normalizedPayload.variant_id),
    channel,
    eventType,
    occurredAt: asTrimmedString(normalizedPayload.occurred_at) ?? undefined,
    revenueCents: asFiniteNumber(normalizedPayload.revenue_cents) ?? undefined,
    attributedInstructorId: asTrimmedString(normalizedPayload.attributed_instructor_id),
    attributionChannel: asTrimmedString(normalizedPayload.attribution_channel),
    affiliateRateBps: asFiniteNumber(normalizedPayload.affiliate_rate_bps) ?? undefined,
  });

  const clickHouseConfig = getClickHouseConfigFromEnv();
  if (!clickHouseConfig) {
    return NextResponse.json({
      ok: true,
      persisted: false,
      reason: "ClickHouse is not configured; event returned for async ingestion.",
      record,
    });
  }

  const anonymousId = asTrimmedString(normalizedPayload.anonymous_id) ?? "";
  const userId = asTrimmedString(normalizedPayload.user_id) ?? customerId;
  const sessionId = asTrimmedString(normalizedPayload.session_id) ?? "";

  try {
    await insertJsonEachRow({
      config: clickHouseConfig,
      table: "events",
      rows: [
        {
          event_id: crypto.randomUUID(),
          anonymous_id: anonymousId,
          user_id: userId,
          session_id: sessionId,
          event_name: `offer_${record.eventType}`,
          properties: JSON.stringify({
            customer_id: record.customerId,
            offer_id: record.offerId,
            variant_id: record.variantId,
            channel: record.channel,
            event_type: record.eventType,
            revenue_attributed_cents: record.revenueAttributedCents,
            attributed_instructor_id: record.attributedInstructorId,
            attribution_channel: record.attributionChannel,
            affiliate_rate_bps: record.affiliateRateBps,
            affiliate_revenue_share_cents: record.affiliateRevenueShareCents,
          }),
          context: JSON.stringify({ source: "api/offers/track" }),
          timestamp: formatClickHouseTimestamp(new Date(record.occurredAt)),
        },
      ],
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to persist offer tracking event",
        record,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    persisted: true,
    record,
  });
}
