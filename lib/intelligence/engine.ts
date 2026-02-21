export type OfferChannel = "email" | "sms" | "push" | "in_app" | "qr";

export type JourneyStage = "new" | "engaged" | "customer" | "advocate";

export type FunnelStage =
  | "free_content"
  | "paid_course"
  | "group_coaching"
  | "one_on_one_coaching"
  | "equipment";

export type OfferTriggerEvent = "course_completed" | "inactivity_14_days";

export type OfferDeliveryProvider = "resend" | "twilio" | "push" | "in_app_banner" | "qr_code";

export type CustomerBehaviorEvent = {
  event: string;
  occurredAt: string;
  properties?: Record<string, unknown>;
};

export type CustomerOfferProfile = {
  segments?: string[];
  referralCount?: number;
  lastActiveAt?: string | null;
};

export type OfferVariant = {
  id: string;
  label: string;
  weight: number;
  content: {
    headline: string;
    body: string;
    cta: string;
  };
};

export type OfferDefinition = {
  id: string;
  title: string;
  description: string;
  priority: number;
  targeting: {
    audienceSegments: string[];
    triggerEvent?: OfferTriggerEvent;
    requireEventWithinHours?: number;
    channels: OfferChannel[];
    journeyStages?: JourneyStage[];
    funnelFrom?: FunnelStage;
    funnelTo?: FunnelStage;
  };
  variants: OfferVariant[];
};

export type SelectedOffer = {
  id: string;
  title: string;
  description: string;
  priority: number;
  channel: OfferChannel;
  deliveryProvider: OfferDeliveryProvider;
  triggerEvent?: OfferTriggerEvent;
  funnelFrom?: FunnelStage;
  funnelTo?: FunnelStage;
  variant: OfferVariant;
};

export type OfferSelectionInput = {
  customerId: string;
  channel: OfferChannel;
  events: CustomerBehaviorEvent[];
  profile?: CustomerOfferProfile;
  now?: Date;
  offers?: OfferDefinition[];
};

export type OfferSelectionResult = {
  journeyStage: JourneyStage;
  funnelStage: FunnelStage;
  activeSegments: string[];
  activeTriggers: OfferTriggerEvent[];
  consideredOfferIds: string[];
  offer: SelectedOffer | null;
};

export type OfferPerformanceEventType = "impression" | "click" | "conversion";

export type OfferPerformanceRecordInput = {
  customerId: string;
  offerId: string;
  variantId?: string | null;
  channel: OfferChannel;
  eventType: OfferPerformanceEventType;
  occurredAt?: string;
  revenueCents?: number;
  attributedInstructorId?: string | null;
  attributionChannel?: string | null;
  affiliateRateBps?: number;
};

export type OfferPerformanceRecord = {
  customerId: string;
  offerId: string;
  variantId: string | null;
  channel: OfferChannel;
  eventType: OfferPerformanceEventType;
  occurredAt: string;
  revenueAttributedCents: number;
  attributedInstructorId: string | null;
  attributionChannel: string | null;
  affiliateRateBps: number;
  affiliateRevenueShareCents: number;
};

const JOURNEY_RANK: JourneyStage[] = ["new", "engaged", "customer", "advocate"];

const CHANNELS: OfferChannel[] = ["email", "sms", "push", "in_app", "qr"];
const PERFORMANCE_EVENT_TYPES: OfferPerformanceEventType[] = ["impression", "click", "conversion"];

const normalizeEventName = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_");

const parseDate = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const normalizeSegment = (segment: string): string => segment.trim().toLowerCase();

const getJourneyRank = (stage: JourneyStage): number => JOURNEY_RANK.indexOf(stage);

const hashToUnitInterval = (value: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }

  const unsigned = hash >>> 0;
  return unsigned / 4294967295;
};

const detectCtiBeginnerSignal = (event: CustomerBehaviorEvent): boolean => {
  const name = normalizeEventName(event.event);
  if (!["course_enrolled", "course_completed", "purchase"].includes(name)) {
    return false;
  }

  const title = String(event.properties?.course_title ?? event.properties?.product_name ?? "")
    .trim()
    .toLowerCase();
  const slug = String(event.properties?.course_slug ?? event.properties?.product_slug ?? "")
    .trim()
    .toLowerCase();

  return title.includes("cti") && title.includes("beginner")
    || slug.includes("cti") && slug.includes("beginner");
};

const detectFunnelStage = (events: CustomerBehaviorEvent[]): FunnelStage => {
  let hasFreeContent = false;
  let hasPaidCourse = false;
  let hasGroupCoaching = false;
  let hasOneOnOneCoaching = false;
  let hasEquipment = false;

  for (const event of events) {
    const name = normalizeEventName(event.event);
    const productType = normalizeEventName(String(event.properties?.product_type ?? ""));

    if (name === "equipment_purchased" || productType === "equipment") {
      hasEquipment = true;
      continue;
    }

    if (name === "one_on_one_completed" || productType === "one_on_one_coaching") {
      hasOneOnOneCoaching = true;
      continue;
    }

    if (name === "group_coaching_completed" || productType === "group_coaching") {
      hasGroupCoaching = true;
      continue;
    }

    if (["course_enrolled", "course_completed", "purchase"].includes(name)) {
      hasPaidCourse = true;
      continue;
    }

    if (["free_content_viewed", "content_viewed", "page_view", "video_play"].includes(name)) {
      hasFreeContent = true;
    }
  }

  if (hasEquipment) return "equipment";
  if (hasOneOnOneCoaching) return "one_on_one_coaching";
  if (hasGroupCoaching) return "group_coaching";
  if (hasPaidCourse) return "paid_course";
  if (hasFreeContent) return "free_content";
  return "free_content";
};

const detectJourneyStage = (
  events: CustomerBehaviorEvent[],
  profile: CustomerOfferProfile | undefined,
): JourneyStage => {
  if (events.length === 0) return "new";

  let hasEngagement = false;
  let hasCustomerSignal = false;
  let hasAdvocacySignal = false;

  for (const event of events) {
    const name = normalizeEventName(event.event);

    if (
      [
        "page_view",
        "video_play",
        "content_viewed",
        "free_content_viewed",
        "course_enrolled",
        "course_completed",
      ].includes(name)
    ) {
      hasEngagement = true;
    }

    if (
      [
        "purchase",
        "course_enrolled",
        "course_completed",
        "group_coaching_completed",
        "one_on_one_completed",
        "equipment_purchased",
      ].includes(name)
    ) {
      hasCustomerSignal = true;
    }

    if (["referral_made", "testimonial_submitted", "certificate_issued"].includes(name)) {
      hasAdvocacySignal = true;
    }
  }

  if ((profile?.referralCount ?? 0) > 0) {
    hasAdvocacySignal = true;
  }

  if (hasAdvocacySignal && hasCustomerSignal) return "advocate";
  if (hasCustomerSignal) return "customer";
  if (hasEngagement) return "engaged";
  return "new";
};

const lastActivityAt = (events: CustomerBehaviorEvent[], profile?: CustomerOfferProfile): Date | null => {
  const profileLastActive = parseDate(profile?.lastActiveAt ?? null);

  let lastSeen = profileLastActive;

  for (const event of events) {
    const eventDate = parseDate(event.occurredAt);
    if (!eventDate) continue;
    if (!lastSeen || eventDate > lastSeen) {
      lastSeen = eventDate;
    }
  }

  return lastSeen;
};

const hasEventWithinHours = (
  events: CustomerBehaviorEvent[],
  eventName: string,
  now: Date,
  windowHours: number,
): boolean => {
  const windowMs = windowHours * 60 * 60 * 1000;
  const normalizedEventName = normalizeEventName(eventName);

  return events.some((event) => {
    const name = normalizeEventName(event.event);
    if (name !== normalizedEventName) return false;

    const eventDate = parseDate(event.occurredAt);
    if (!eventDate) return false;

    const ageMs = now.getTime() - eventDate.getTime();
    return ageMs >= 0 && ageMs <= windowMs;
  });
};

const resolveActiveTriggers = (
  events: CustomerBehaviorEvent[],
  profile: CustomerOfferProfile | undefined,
  now: Date,
): OfferTriggerEvent[] => {
  const triggers = new Set<OfferTriggerEvent>();

  if (hasEventWithinHours(events, "course_completed", now, 24)) {
    triggers.add("course_completed");
  }

  const lastSeen = lastActivityAt(events, profile);
  if (lastSeen) {
    const inactivityMs = now.getTime() - lastSeen.getTime();
    if (inactivityMs >= 14 * 24 * 60 * 60 * 1000) {
      triggers.add("inactivity_14_days");
    }
  }

  return Array.from(triggers);
};

const buildAudienceSegments = (
  events: CustomerBehaviorEvent[],
  journeyStage: JourneyStage,
  activeTriggers: OfferTriggerEvent[],
  profile?: CustomerOfferProfile,
): string[] => {
  const segments = new Set<string>();

  for (const segment of profile?.segments ?? []) {
    segments.add(normalizeSegment(segment));
  }

  const hasFreeContent = events.some((event) => {
    const name = normalizeEventName(event.event);
    return ["free_content_viewed", "content_viewed", "page_view", "video_play"].includes(name);
  });

  if (hasFreeContent) {
    segments.add("free_content_consumer");
  }

  if (events.some(detectCtiBeginnerSignal)) {
    segments.add("cti_beginner_buyer");
  }

  if (journeyStage === "customer" || journeyStage === "advocate") {
    segments.add("customer");
  }

  if (journeyStage === "advocate") {
    segments.add("advocate");
  }

  for (const trigger of activeTriggers) {
    segments.add(trigger);
  }

  return Array.from(segments);
};

const resolveDeliveryProvider = (channel: OfferChannel): OfferDeliveryProvider => {
  switch (channel) {
    case "email":
      return "resend";
    case "sms":
      return "twilio";
    case "push":
      return "push";
    case "in_app":
      return "in_app_banner";
    case "qr":
      return "qr_code";
    default:
      return "in_app_banner";
  }
};

const pickVariant = (offer: OfferDefinition, customerId: string): OfferVariant => {
  if (offer.variants.length === 0) {
    throw new Error(`Offer ${offer.id} has no variants`);
  }

  const totalWeight = offer.variants.reduce((total, variant) => {
    if (!Number.isFinite(variant.weight) || variant.weight <= 0) return total;
    return total + variant.weight;
  }, 0);

  if (totalWeight <= 0) {
    return offer.variants[0];
  }

  const target = hashToUnitInterval(`${customerId}:${offer.id}`) * totalWeight;
  let cumulative = 0;

  for (const variant of offer.variants) {
    const weight = Number.isFinite(variant.weight) && variant.weight > 0 ? variant.weight : 0;
    cumulative += weight;
    if (target <= cumulative) {
      return variant;
    }
  }

  return offer.variants[offer.variants.length - 1];
};

const offerMatchesContext = (params: {
  offer: OfferDefinition;
  channel: OfferChannel;
  journeyStage: JourneyStage;
  funnelStage: FunnelStage;
  segments: string[];
  activeTriggers: OfferTriggerEvent[];
  events: CustomerBehaviorEvent[];
  now: Date;
}): boolean => {
  const { offer, channel, journeyStage, funnelStage, segments, activeTriggers, events, now } = params;

  if (!offer.targeting.channels.includes(channel)) return false;

  if (offer.targeting.journeyStages && !offer.targeting.journeyStages.includes(journeyStage)) {
    return false;
  }

  if (offer.targeting.funnelFrom && offer.targeting.funnelFrom !== funnelStage) {
    return false;
  }

  if (offer.targeting.audienceSegments.length > 0) {
    const hasAudienceMatch = offer.targeting.audienceSegments.some((segment) =>
      segments.includes(normalizeSegment(segment)),
    );

    if (!hasAudienceMatch) return false;
  }

  if (offer.targeting.triggerEvent && !activeTriggers.includes(offer.targeting.triggerEvent)) {
    return false;
  }

  if (offer.targeting.triggerEvent && offer.targeting.requireEventWithinHours) {
    const hasWindowEvent = hasEventWithinHours(
      events,
      offer.targeting.triggerEvent,
      now,
      offer.targeting.requireEventWithinHours,
    );

    if (!hasWindowEvent) return false;
  }

  return true;
};

export const isOfferChannel = (value: unknown): value is OfferChannel =>
  typeof value === "string" && CHANNELS.includes(value as OfferChannel);

export const isOfferPerformanceEventType = (value: unknown): value is OfferPerformanceEventType =>
  typeof value === "string" && PERFORMANCE_EVENT_TYPES.includes(value as OfferPerformanceEventType);

export const defaultOfferCatalog: OfferDefinition[] = [
  {
    id: "win-back-14-day-sequence",
    title: "We miss you offer",
    description: "14-day inactivity win-back sequence with a limited-time return incentive.",
    priority: 120,
    targeting: {
      audienceSegments: ["inactivity_14_days"],
      triggerEvent: "inactivity_14_days",
      channels: ["email", "sms", "push"],
      journeyStages: ["engaged", "customer", "advocate"],
    },
    variants: [
      {
        id: "winback-a",
        label: "Come back discount",
        weight: 50,
        content: {
          headline: "Ready to jump back in?",
          body: "Return this week and unlock 15% off your next step in training.",
          cta: "Claim comeback offer",
        },
      },
      {
        id: "winback-b",
        label: "Fresh start",
        weight: 50,
        content: {
          headline: "Your next breakthrough is waiting",
          body: "Pick up where you left off with a guided re-entry plan.",
          cta: "Restart my plan",
        },
      },
    ],
  },
  {
    id: "cti-beginner-to-karen-advanced-coaching",
    title: "Karen Miles Advanced Coaching",
    description: "Cross-sell from CTI beginner graduates into Karen Miles advanced coaching.",
    priority: 110,
    targeting: {
      audienceSegments: ["cti_beginner_buyer"],
      triggerEvent: "course_completed",
      requireEventWithinHours: 24,
      channels: ["email", "sms", "push", "in_app", "qr"],
      journeyStages: ["customer", "advocate"],
      funnelFrom: "paid_course",
      funnelTo: "group_coaching",
    },
    variants: [
      {
        id: "karen-advanced-a",
        label: "Outcome-led",
        weight: 50,
        content: {
          headline: "Advance with Karen Miles coaching",
          body: "You finished CTI beginner. Join Karen's advanced coaching cohort for live feedback.",
          cta: "Apply for advanced coaching",
        },
      },
      {
        id: "karen-advanced-b",
        label: "Mentor-led",
        weight: 50,
        content: {
          headline: "Your coach-ready next step",
          body: "Graduate from fundamentals into Karen Miles advanced sessions this week.",
          cta: "Reserve my spot",
        },
      },
    ],
  },
  {
    id: "free-content-to-paid-course",
    title: "Starter paid course",
    description: "Move free-content learners into first paid course purchase.",
    priority: 90,
    targeting: {
      audienceSegments: ["free_content_consumer"],
      channels: ["email", "push", "in_app", "qr"],
      journeyStages: ["new", "engaged"],
      funnelFrom: "free_content",
      funnelTo: "paid_course",
    },
    variants: [
      {
        id: "free-to-paid-default",
        label: "Starter conversion",
        weight: 100,
        content: {
          headline: "Turn practice into progress",
          body: "Start the paid beginner pathway and unlock structured milestones.",
          cta: "View beginner course",
        },
      },
    ],
  },
  {
    id: "paid-course-to-group-coaching",
    title: "Group coaching upsell",
    description: "Guide paid-course customers into group coaching.",
    priority: 85,
    targeting: {
      audienceSegments: ["customer"],
      channels: ["email", "sms", "push", "in_app"],
      journeyStages: ["customer", "advocate"],
      funnelFrom: "paid_course",
      funnelTo: "group_coaching",
    },
    variants: [
      {
        id: "paid-to-group-default",
        label: "Group coaching",
        weight: 100,
        content: {
          headline: "Join a live group coaching pod",
          body: "Move from self-paced progress to weekly coached reps with peers.",
          cta: "See group coaching times",
        },
      },
    ],
  },
  {
    id: "group-coaching-to-one-on-one",
    title: "1:1 coaching upgrade",
    description: "Promote private 1:1 coaching after group coaching outcomes.",
    priority: 80,
    targeting: {
      audienceSegments: ["customer"],
      channels: ["email", "sms", "push", "in_app"],
      journeyStages: ["customer", "advocate"],
      funnelFrom: "group_coaching",
      funnelTo: "one_on_one_coaching",
    },
    variants: [
      {
        id: "group-to-1on1-default",
        label: "Private coaching",
        weight: 100,
        content: {
          headline: "Graduate to private coaching",
          body: "Book focused 1:1 sessions to accelerate your skill gaps.",
          cta: "Book private coaching",
        },
      },
    ],
  },
  {
    id: "one-on-one-to-equipment",
    title: "Equipment bundle",
    description: "Recommend equipment bundles for 1:1 coaching customers.",
    priority: 70,
    targeting: {
      audienceSegments: ["customer"],
      channels: ["email", "sms", "push", "in_app", "qr"],
      journeyStages: ["customer", "advocate"],
      funnelFrom: "one_on_one_coaching",
      funnelTo: "equipment",
    },
    variants: [
      {
        id: "1on1-to-equipment-default",
        label: "Equipment bundle",
        weight: 100,
        content: {
          headline: "Complete your setup",
          body: "Get the same equipment kit used in your private coaching plan.",
          cta: "Shop equipment bundle",
        },
      },
    ],
  },
];

export const selectBestOffer = (input: OfferSelectionInput): OfferSelectionResult => {
  const now = input.now ?? new Date();
  const offers = input.offers ?? defaultOfferCatalog;
  const journeyStage = detectJourneyStage(input.events, input.profile);
  const funnelStage = detectFunnelStage(input.events);
  const activeTriggers = resolveActiveTriggers(input.events, input.profile, now);
  const activeSegments = buildAudienceSegments(input.events, journeyStage, activeTriggers, input.profile);

  const matchingOffers = offers
    .filter((offer) =>
      offerMatchesContext({
        offer,
        channel: input.channel,
        journeyStage,
        funnelStage,
        segments: activeSegments,
        activeTriggers,
        events: input.events,
        now,
      }),
    )
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));

  const selected = matchingOffers[0];

  if (!selected) {
    return {
      journeyStage,
      funnelStage,
      activeSegments,
      activeTriggers,
      consideredOfferIds: [],
      offer: null,
    };
  }

  const variant = pickVariant(selected, input.customerId);

  return {
    journeyStage,
    funnelStage,
    activeSegments,
    activeTriggers,
    consideredOfferIds: matchingOffers.map((offer) => offer.id),
    offer: {
      id: selected.id,
      title: selected.title,
      description: selected.description,
      priority: selected.priority,
      channel: input.channel,
      deliveryProvider: resolveDeliveryProvider(input.channel),
      triggerEvent: selected.targeting.triggerEvent,
      funnelFrom: selected.targeting.funnelFrom,
      funnelTo: selected.targeting.funnelTo,
      variant,
    },
  };
};

export const calculateAffiliateRevenueShareCents = (
  revenueCents: number,
  affiliateRateBps = 1500,
): number => {
  const normalizedRevenue = Number.isFinite(revenueCents) ? Math.max(0, Math.round(revenueCents)) : 0;
  const normalizedBps = Number.isFinite(affiliateRateBps)
    ? Math.max(0, Math.min(10000, Math.round(affiliateRateBps)))
    : 0;

  return Math.round((normalizedRevenue * normalizedBps) / 10000);
};

export const buildOfferPerformanceRecord = (
  input: OfferPerformanceRecordInput,
): OfferPerformanceRecord => {
  const occurredAtDate = parseDate(input.occurredAt) ?? new Date();
  const revenueAttributedCents =
    input.eventType === "conversion" && Number.isFinite(input.revenueCents ?? NaN)
      ? Math.max(0, Math.round(input.revenueCents ?? 0))
      : 0;

  const affiliateRateBps =
    Number.isFinite(input.affiliateRateBps ?? NaN) && (input.affiliateRateBps ?? 0) > 0
      ? Math.round(input.affiliateRateBps ?? 0)
      : 1500;

  return {
    customerId: input.customerId,
    offerId: input.offerId,
    variantId: input.variantId?.trim() || null,
    channel: input.channel,
    eventType: input.eventType,
    occurredAt: occurredAtDate.toISOString(),
    revenueAttributedCents,
    attributedInstructorId: input.attributedInstructorId?.trim() || null,
    attributionChannel: input.attributionChannel?.trim() || null,
    affiliateRateBps,
    affiliateRevenueShareCents: calculateAffiliateRevenueShareCents(revenueAttributedCents, affiliateRateBps),
  };
};

export const getJourneyStageForEvents = detectJourneyStage;
export const getFunnelStageForEvents = detectFunnelStage;
