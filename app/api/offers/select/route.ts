import { NextResponse } from "next/server";

import { loadCustomerOfferContext } from "@/lib/intelligence/context";
import {
  isOfferChannel,
  selectBestOffer,
  type CustomerBehaviorEvent,
  type CustomerOfferProfile,
  type OfferChannel,
} from "@/lib/intelligence/engine";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type SelectOfferPayload = {
  customer_id?: unknown;
  channel?: unknown;
  brand_id?: unknown;
  now?: unknown;
  event_history?: unknown;
  profile?: unknown;
};

type RouteDependencies = {
  createAdminClient: typeof createSupabaseAdminClient;
  loadCustomerContext: typeof loadCustomerOfferContext;
  now: () => Date;
};

const testDependencyKey = "__PCC_OFFERS_SELECT_ROUTE_DEPS__";

const defaultDependencies: RouteDependencies = {
  createAdminClient: createSupabaseAdminClient,
  loadCustomerContext: loadCustomerOfferContext,
  now: () => new Date(),
};

const resolveDependencies = (): RouteDependencies => {
  const overrides = (globalThis as Record<string, unknown>)[testDependencyKey] as
    | Partial<RouteDependencies>
    | undefined;

  if (!overrides) return defaultDependencies;

  return {
    ...defaultDependencies,
    ...overrides,
  };
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

const parseDate = (value: unknown): Date | null => {
  const raw = asTrimmedString(value);
  if (!raw) return null;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const parseEventHistory = (value: unknown): CustomerBehaviorEvent[] => {
  if (!Array.isArray(value)) return [];

  const events: CustomerBehaviorEvent[] = [];
  for (const item of value) {
    const asRecord = asObject(item);
    if (!asRecord) continue;

    const eventName = asTrimmedString(asRecord.event);
    const occurredAt = asTrimmedString(asRecord.occurred_at ?? asRecord.occurredAt);
    if (!eventName || !occurredAt) continue;

    const occurredDate = new Date(occurredAt);
    if (Number.isNaN(occurredDate.getTime())) continue;

    const propertiesRaw = asObject(asRecord.properties) ?? undefined;

    events.push({
      event: eventName,
      occurredAt: occurredDate.toISOString(),
      properties: propertiesRaw,
    });
  }

  return events;
};

const parseProfile = (value: unknown): CustomerOfferProfile => {
  const profile = asObject(value);
  if (!profile) return {};

  const segments = Array.isArray(profile.segments)
    ? profile.segments
      .map((segment) => asTrimmedString(segment))
      .filter((segment): segment is string => Boolean(segment))
    : undefined;

  const referralCountRaw = profile.referral_count ?? profile.referralCount;
  const referralCount =
    typeof referralCountRaw === "number" && Number.isFinite(referralCountRaw)
      ? referralCountRaw
      : typeof referralCountRaw === "string" && referralCountRaw.trim()
        ? Number(referralCountRaw)
        : undefined;

  const lastActiveAt = asTrimmedString(profile.last_active_at ?? profile.lastActiveAt);

  return {
    segments,
    referralCount: Number.isFinite(referralCount ?? NaN) ? referralCount : undefined,
    lastActiveAt,
  };
};

const mergeProfiles = (base: CustomerOfferProfile, override: CustomerOfferProfile): CustomerOfferProfile => {
  const segments = Array.from(new Set([...(base.segments ?? []), ...(override.segments ?? [])]));

  return {
    segments,
    referralCount:
      typeof override.referralCount === "number"
        ? override.referralCount
        : base.referralCount,
    lastActiveAt: override.lastActiveAt ?? base.lastActiveAt,
  };
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

  let payload: SelectOfferPayload;

  try {
    payload = (await request.json()) as SelectOfferPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const body = asObject(payload);
  if (!body) {
    return NextResponse.json({ ok: false, error: "Invalid payload: expected JSON object" }, { status: 400 });
  }

  const customerId = asTrimmedString(payload.customer_id);
  const channelRaw = asTrimmedString(payload.channel);
  const brandId = asTrimmedString(payload.brand_id) ?? undefined;

  if (!customerId) {
    return NextResponse.json({ ok: false, error: "customer_id is required" }, { status: 400 });
  }

  if (!channelRaw || !isOfferChannel(channelRaw)) {
    return NextResponse.json(
      { ok: false, error: "channel must be one of: email, sms, push, in_app, qr" },
      { status: 400 },
    );
  }

  const channel = channelRaw as OfferChannel;
  const manualEvents = parseEventHistory(payload.event_history);
  const manualProfile = parseProfile(payload.profile);

  const dependencies = resolveDependencies();

  let resolvedBrandId = brandId;
  let mergedEvents = manualEvents;
  let mergedProfile: CustomerOfferProfile = manualProfile;

  try {
    const adminClient = dependencies.createAdminClient();
    const loadedContext = await dependencies.loadCustomerContext(adminClient, { customerId, brandId });

    if (loadedContext) {
      resolvedBrandId = loadedContext.brandId;
      mergedEvents = [...loadedContext.events, ...manualEvents];
      mergedProfile = mergeProfiles(loadedContext.profile, manualProfile);
    } else if (manualEvents.length === 0) {
      return NextResponse.json(
        { ok: false, error: `No customer context found for customer_id ${customerId}` },
        { status: 404 },
      );
    }
  } catch (error) {
    if (manualEvents.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: error instanceof Error ? error.message : "Unable to load customer context",
        },
        { status: 500 },
      );
    }
  }

  const parsedNow = parseDate(payload.now) ?? dependencies.now();

  const result = selectBestOffer({
    customerId,
    channel,
    events: mergedEvents,
    profile: mergedProfile,
    now: parsedNow,
  });

  return NextResponse.json({
    ok: true,
    customer_id: customerId,
    brand_id: resolvedBrandId ?? null,
    channel,
    journey_stage: result.journeyStage,
    funnel_stage: result.funnelStage,
    active_segments: result.activeSegments,
    active_triggers: result.activeTriggers,
    considered_offer_ids: result.consideredOfferIds,
    offer: result.offer,
  });
}
