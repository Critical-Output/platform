import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

import type { CustomerBehaviorEvent, CustomerOfferProfile } from "./engine";

export type LoadedCustomerOfferContext = {
  customerId: string;
  brandId: string;
  events: CustomerBehaviorEvent[];
  profile: CustomerOfferProfile;
};

const asObject = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
};

const asString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const asStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asString(item))
    .filter((item): item is string => Boolean(item));
};

const asNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const toSlug = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");

const parseDate = (value: string): Date | null => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

export const loadCustomerOfferContext = async (
  adminClient: SupabaseClient<Database>,
  params: { customerId: string; brandId?: string },
): Promise<LoadedCustomerOfferContext | null> => {
  let customerQuery = adminClient
    .from("customers")
    .select("id,brand_id,metadata")
    .eq("id", params.customerId)
    .is("deleted_at", null);

  if (params.brandId) {
    customerQuery = customerQuery.eq("brand_id", params.brandId);
  }

  const { data: customer, error: customerError } = await customerQuery.maybeSingle();
  if (customerError) {
    throw new Error(customerError.message);
  }

  if (!customer) return null;

  const customerMetadata = asObject(customer.metadata);
  const resolvedBrandId = asString(customer.brand_id);
  const resolvedCustomerId = asString(customer.id);

  if (!resolvedBrandId || !resolvedCustomerId) {
    return null;
  }

  const [enrollmentsResult, paymentsResult, bookingsResult, certificatesResult] = await Promise.all([
    adminClient
      .from("enrollments")
      .select("course_id,status,enrolled_at,completed_at,metadata")
      .eq("brand_id", resolvedBrandId)
      .eq("customer_id", resolvedCustomerId)
      .is("deleted_at", null)
      .order("enrolled_at", { ascending: true })
      .limit(500),
    adminClient
      .from("payments")
      .select("amount_cents,status,paid_at,metadata")
      .eq("brand_id", resolvedBrandId)
      .eq("customer_id", resolvedCustomerId)
      .is("deleted_at", null)
      .order("paid_at", { ascending: true })
      .limit(500),
    adminClient
      .from("bookings")
      .select("status,completed_at,metadata")
      .eq("brand_id", resolvedBrandId)
      .eq("customer_id", resolvedCustomerId)
      .is("deleted_at", null)
      .order("completed_at", { ascending: true })
      .limit(500),
    adminClient
      .from("certificates")
      .select("issued_at")
      .eq("brand_id", resolvedBrandId)
      .eq("customer_id", resolvedCustomerId)
      .is("deleted_at", null)
      .order("issued_at", { ascending: true })
      .limit(200),
  ]);

  if (enrollmentsResult.error) throw new Error(enrollmentsResult.error.message);
  if (paymentsResult.error) throw new Error(paymentsResult.error.message);
  if (bookingsResult.error) throw new Error(bookingsResult.error.message);
  if (certificatesResult.error) throw new Error(certificatesResult.error.message);

  const enrollments = (enrollmentsResult.data ?? []) as Array<{
    course_id: unknown;
    status: unknown;
    enrolled_at: unknown;
    completed_at: unknown;
    metadata: unknown;
  }>;

  const courseIds = Array.from(
    new Set(
      enrollments
        .map((row) => asString(row.course_id))
        .filter((row): row is string => Boolean(row)),
    ),
  );

  const courseMap = new Map<string, { title: string | null; slug: string | null }>();

  if (courseIds.length > 0) {
    const { data: courseRows, error: courseError } = await adminClient
      .from("courses")
      .select("id,title,metadata")
      .eq("brand_id", resolvedBrandId)
      .in("id", courseIds)
      .is("deleted_at", null);

    if (courseError) throw new Error(courseError.message);

    for (const row of (courseRows ?? []) as Array<{ id: unknown; title: unknown; metadata: unknown }>) {
      const courseId = asString(row.id);
      if (!courseId) continue;

      const title = asString(row.title);
      const metadata = asObject(row.metadata);
      const slug = asString(metadata.slug) ?? (title ? toSlug(title) : null);

      courseMap.set(courseId, { title, slug });
    }
  }

  const events: CustomerBehaviorEvent[] = [];
  const pushEvent = (
    event: string,
    occurredAtValue: unknown,
    properties?: Record<string, unknown>,
  ) => {
    const occurredAt = asString(occurredAtValue);
    if (!occurredAt) return;

    if (!parseDate(occurredAt)) return;

    events.push({
      event,
      occurredAt,
      properties,
    });
  };

  for (const enrollment of enrollments) {
    const courseId = asString(enrollment.course_id);
    const course = courseId ? courseMap.get(courseId) : undefined;
    const enrollmentMeta = asObject(enrollment.metadata);

    const properties: Record<string, unknown> = {
      course_id: courseId,
      course_title: course?.title ?? asString(enrollmentMeta.course_title),
      course_slug: course?.slug ?? asString(enrollmentMeta.course_slug),
    };

    pushEvent("course_enrolled", enrollment.enrolled_at, properties);

    const status = asString(enrollment.status)?.toLowerCase();
    if (status === "completed" || asString(enrollment.completed_at)) {
      pushEvent("course_completed", enrollment.completed_at ?? enrollment.enrolled_at, properties);
    }
  }

  for (const payment of (paymentsResult.data ?? []) as Array<{
    amount_cents: unknown;
    status: unknown;
    paid_at: unknown;
    metadata: unknown;
  }>) {
    const status = asString(payment.status)?.toLowerCase();
    if (!status || !["paid", "succeeded"].includes(status)) continue;

    const metadata = asObject(payment.metadata);
    const productTypeRaw = asString(metadata.product_type) ?? "";
    const productType = productTypeRaw.trim().toLowerCase();

    const properties: Record<string, unknown> = {
      amount_cents: asNumber(payment.amount_cents),
      product_type: productType || null,
      product_name: asString(metadata.product_name),
      product_slug: asString(metadata.product_slug),
    };

    pushEvent("purchase", payment.paid_at, properties);

    if (productType === "equipment") {
      pushEvent("equipment_purchased", payment.paid_at, properties);
    }

    if (productType === "group_coaching") {
      pushEvent("group_coaching_completed", payment.paid_at, properties);
    }

    if (productType === "one_on_one_coaching") {
      pushEvent("one_on_one_completed", payment.paid_at, properties);
    }
  }

  for (const booking of (bookingsResult.data ?? []) as Array<{
    status: unknown;
    completed_at: unknown;
    metadata: unknown;
  }>) {
    const completedAt = asString(booking.completed_at);
    if (!completedAt) continue;

    const status = asString(booking.status)?.toLowerCase();
    if (status && status !== "completed") continue;

    const metadata = asObject(booking.metadata);
    const coachingType =
      asString(metadata.coaching_type)?.toLowerCase() ??
      asString(metadata.session_type)?.toLowerCase() ??
      "one_on_one";

    if (coachingType.includes("group")) {
      pushEvent("group_coaching_completed", completedAt, { source: "booking" });
    } else {
      pushEvent("one_on_one_completed", completedAt, { source: "booking" });
    }
  }

  for (const certificate of (certificatesResult.data ?? []) as Array<{ issued_at: unknown }>) {
    pushEvent("certificate_issued", certificate.issued_at, { source: "certificate" });
  }

  const metadataActivityEvents = Array.isArray(customerMetadata.activity_events)
    ? customerMetadata.activity_events
    : [];

  for (const activityEvent of metadataActivityEvents) {
    if (!activityEvent || typeof activityEvent !== "object" || Array.isArray(activityEvent)) continue;
    const eventRecord = activityEvent as Record<string, unknown>;
    const eventName = asString(eventRecord.event);
    const occurredAt = asString(eventRecord.occurred_at ?? eventRecord.occurredAt);
    if (!eventName || !occurredAt) continue;

    pushEvent(eventName, occurredAt, asObject(eventRecord.properties));
  }

  events.sort((a, b) => {
    const left = parseDate(a.occurredAt)?.getTime() ?? 0;
    const right = parseDate(b.occurredAt)?.getTime() ?? 0;
    return left - right;
  });

  const profile: CustomerOfferProfile = {
    segments: asStringArray(customerMetadata.segments),
    referralCount: asNumber(customerMetadata.referral_count) ?? 0,
    lastActiveAt: asString(customerMetadata.last_active_at),
  };

  return {
    customerId: resolvedCustomerId,
    brandId: resolvedBrandId,
    events,
    profile,
  };
};
