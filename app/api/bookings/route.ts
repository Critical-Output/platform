import { NextResponse } from "next/server";

import {
  ensureCustomerOwnership,
  getAvailabilityForDate,
  getInstructorForBrand,
  getSchedulingSettings,
  hasInstructorBookingConflict,
  instructorWorksForBrand,
  isBrandAdmin,
  listInstructorCalendarBookings,
  recordNotificationResult,
  userHasBrandAccess,
} from "@/lib/bookings/service";
import { sendBookingCreatedNotifications } from "@/lib/bookings/notifications";
import {
  isSlotWithinAvailability,
  isWithinAdvanceBookingLimit,
  normalizeTimeZone,
} from "@/lib/bookings/scheduling";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type CreateBookingPayload = {
  brand_id?: string;
  customer_id?: string;
  instructor_id?: string;
  start_at?: string;
  duration_minutes?: number;
  student_timezone?: string;
  notes?: string;
  location?: string;
  payment?: {
    amount_cents?: number;
    currency?: string;
    provider?: string;
    reference?: string;
    status?: string;
  };
};

type BookingSummary = {
  id: string;
  brand_id: string;
  customer_id: string;
  instructor_id: string | null;
  status: string;
  start_at: string;
  end_at: string;
  notes: string | null;
  instructor_notes: string | null;
  payment_status: string | null;
  student_timezone: string | null;
  instructor_timezone: string | null;
};

const paymentStatusToBookingStatus = (statusRaw: string | undefined): "pending" | "paid" | "failed" | "refunded" => {
  const normalized = (statusRaw ?? "").trim().toLowerCase();
  if (["paid", "succeeded"].includes(normalized)) return "paid";
  if (["failed", "canceled", "cancelled"].includes(normalized)) return "failed";
  if (normalized === "refunded") return "refunded";
  return "pending";
};

const paymentStatusForPaymentsTable = (statusRaw: string | undefined): string => {
  const normalized = (statusRaw ?? "").trim().toLowerCase();
  if (["paid", "succeeded"].includes(normalized)) return "succeeded";
  if (["failed", "canceled", "cancelled"].includes(normalized)) return "failed";
  if (normalized === "refunded") return "refunded";
  return "processing";
};

const dateIsoInZone = (date: Date, timeZone: string): string => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const map = new Map(parts.map((part) => [part.type, part.value]));

  return `${map.get("year") ?? "1970"}-${map.get("month") ?? "01"}-${map.get("day") ?? "01"}`;
};

const bookingSelect =
  "id,brand_id,customer_id,instructor_id,status,start_at,end_at,notes,instructor_notes,payment_status,student_timezone,instructor_timezone";

type RouteDependencies = {
  createSessionClient: typeof createSupabaseServerClient;
  createAdminClient: typeof createSupabaseAdminClient;
  ensureCustomerOwnership: typeof ensureCustomerOwnership;
  getInstructorForBrand: typeof getInstructorForBrand;
  getSchedulingSettings: typeof getSchedulingSettings;
  getAvailabilityForDate: typeof getAvailabilityForDate;
  hasInstructorBookingConflict: typeof hasInstructorBookingConflict;
  instructorWorksForBrand: typeof instructorWorksForBrand;
  isBrandAdmin: typeof isBrandAdmin;
  listInstructorCalendarBookings: typeof listInstructorCalendarBookings;
  recordNotificationResult: typeof recordNotificationResult;
  sendBookingCreatedNotifications: typeof sendBookingCreatedNotifications;
  userHasBrandAccess: typeof userHasBrandAccess;
};

const defaultDependencies: RouteDependencies = {
  createSessionClient: createSupabaseServerClient,
  createAdminClient: createSupabaseAdminClient,
  ensureCustomerOwnership,
  getInstructorForBrand,
  getSchedulingSettings,
  getAvailabilityForDate,
  hasInstructorBookingConflict,
  instructorWorksForBrand,
  isBrandAdmin,
  listInstructorCalendarBookings,
  recordNotificationResult,
  sendBookingCreatedNotifications,
  userHasBrandAccess,
};

const testDependencyKey = "__PCC_BOOKINGS_ROUTE_DEPS__";
const resolveDependencies = (): RouteDependencies => {
  const overrides = (globalThis as Record<string, unknown>)[testDependencyKey] as Partial<RouteDependencies> | undefined;
  if (!overrides) return defaultDependencies;

  return {
    ...defaultDependencies,
    ...overrides,
  };
};

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const brandId = requestUrl.searchParams.get("brand_id")?.trim();

  if (!brandId) {
    return NextResponse.json(
      { ok: false, error: "brand_id is required" },
      { status: 400 },
    );
  }

  try {
    const dependencies = resolveDependencies();
    const sessionClient = dependencies.createSessionClient();
    const adminClient = dependencies.createAdminClient();

    const { data: userData, error: userError } = await sessionClient.auth.getUser();
    if (userError || !userData.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const authUserId = userData.user.id;
    const canAccessBrand = await dependencies.userHasBrandAccess(adminClient, brandId, authUserId);
    if (!canAccessBrand) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const [brandAdmin, customerResult, instructorRowsResult] = await Promise.all([
      dependencies.isBrandAdmin(adminClient, brandId, authUserId),
      adminClient
        .from("customers")
        .select("id")
        .eq("brand_id", brandId)
        .eq("auth_user_id", authUserId)
        .is("deleted_at", null)
        .maybeSingle(),
      adminClient
        .from("instructors")
        .select("id")
        .eq("auth_user_id", authUserId)
        .is("deleted_at", null),
    ]);

    if (brandAdmin) {
      const { data, error } = await adminClient
        .from("bookings")
        .select(bookingSelect)
        .eq("brand_id", brandId)
        .is("deleted_at", null)
        .order("start_at", { ascending: true })
        .limit(200);

      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, bookings: (data ?? []) as BookingSummary[] });
    }

    const bookingsById = new Map<string, BookingSummary>();

    if (customerResult.data?.id) {
      const { data } = await adminClient
        .from("bookings")
        .select(bookingSelect)
        .eq("brand_id", brandId)
        .eq("customer_id", customerResult.data.id)
        .is("deleted_at", null)
        .order("start_at", { ascending: true })
        .limit(200);

      for (const row of (data ?? []) as BookingSummary[]) {
        bookingsById.set(row.id, row);
      }
    }

    const instructorIds = (instructorRowsResult.data ?? []).map((row) => row.id as string);
    for (const instructorId of instructorIds) {
      const worksForBrand = await dependencies.instructorWorksForBrand(adminClient, instructorId, brandId);
      if (!worksForBrand) continue;

      const instructorBookings = await dependencies.listInstructorCalendarBookings(adminClient, {
        brandId,
        instructorId,
        startAt: new Date(0).toISOString(),
        endAt: new Date(Date.now() + (365 * 24 * 60 * 60 * 1000)).toISOString(),
      });

      for (const row of instructorBookings) {
        bookingsById.set(row.id, row);
      }
    }

    return NextResponse.json({
      ok: true,
      bookings: Array.from(bookingsById.values()).sort((a, b) => a.start_at.localeCompare(b.start_at)),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to load bookings",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  let payload: CreateBookingPayload;

  try {
    payload = (await request.json()) as CreateBookingPayload;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const brandId = payload.brand_id?.trim();
  const customerId = payload.customer_id?.trim();
  const instructorId = payload.instructor_id?.trim();
  const startAtRaw = payload.start_at?.trim();

  if (!brandId || !customerId || !instructorId || !startAtRaw) {
    return NextResponse.json(
      { ok: false, error: "brand_id, customer_id, instructor_id, and start_at are required" },
      { status: 400 },
    );
  }

  try {
    const dependencies = resolveDependencies();
    const sessionClient = dependencies.createSessionClient();
    const adminClient = dependencies.createAdminClient();

    const { data: userData, error: userError } = await sessionClient.auth.getUser();
    if (userError || !userData.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const customer = await dependencies.ensureCustomerOwnership(adminClient, brandId, customerId, userData.user.id);
    if (!customer) {
      return NextResponse.json(
        { ok: false, error: "Customer does not belong to the authenticated user" },
        { status: 403 },
      );
    }

    const instructor = await dependencies.getInstructorForBrand(adminClient, brandId, instructorId);
    if (!instructor) {
      return NextResponse.json(
        { ok: false, error: "Instructor is not linked to this brand" },
        { status: 404 },
      );
    }

    const scheduling = await dependencies.getSchedulingSettings(adminClient, brandId, instructorId);

    const startAt = new Date(startAtRaw);
    if (Number.isNaN(startAt.getTime())) {
      return NextResponse.json({ ok: false, error: "start_at must be a valid ISO datetime" }, { status: 400 });
    }

    const durationMinutes =
      typeof payload.duration_minutes === "number" && Number.isFinite(payload.duration_minutes)
        ? Math.max(15, Math.floor(payload.duration_minutes))
        : scheduling.session_duration_minutes;

    const endAt = new Date(startAt.getTime() + (durationMinutes * 60 * 1000));
    const now = new Date();

    if (!isWithinAdvanceBookingLimit(startAt, now, scheduling.advance_booking_days)) {
      return NextResponse.json(
        {
          ok: false,
          error: `Bookings must be in the future and within ${scheduling.advance_booking_days} days`,
        },
        { status: 400 },
      );
    }

    const availabilityDate = dateIsoInZone(startAt, scheduling.timezone);
    const availability = await dependencies.getAvailabilityForDate(adminClient, brandId, instructorId, availabilityDate);
    const slotAvailable = isSlotWithinAvailability({
      startAt,
      endAt,
      instructorTimeZone: scheduling.timezone,
      weeklyRules: availability.rules,
      overrides: availability.overrides,
    });

    if (!slotAvailable) {
      return NextResponse.json(
        { ok: false, error: "Requested time is outside instructor availability" },
        { status: 409 },
      );
    }

    const hasConflict = await dependencies.hasInstructorBookingConflict(adminClient, {
      brandId,
      instructorId,
      startAt,
      endAt,
      bufferMinutes: scheduling.buffer_minutes,
    });

    if (hasConflict) {
      return NextResponse.json(
        {
          ok: false,
          error: `Requested slot conflicts with another booking (buffer: ${scheduling.buffer_minutes} minutes)`,
        },
        { status: 409 },
      );
    }

    const studentTimeZone = normalizeTimeZone(payload.student_timezone, "UTC");
    const bookingPaymentStatus = paymentStatusToBookingStatus(payload.payment?.status);
    const bookingStatus = bookingPaymentStatus === "paid" ? "confirmed" : "pending";
    const createdAt = new Date().toISOString();

    const { data: bookingData, error: bookingError } = await adminClient
      .from("bookings")
      .insert({
        brand_id: brandId,
        customer_id: customerId,
        instructor_id: instructorId,
        status: bookingStatus,
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        location: payload.location ?? null,
        notes: payload.notes ?? null,
        student_timezone: studentTimeZone,
        instructor_timezone: scheduling.timezone,
        payment_status: bookingPaymentStatus,
        payment_reference: payload.payment?.reference ?? null,
        confirmed_at: bookingStatus === "confirmed" ? createdAt : null,
      })
      .select(bookingSelect)
      .single();

    if (bookingError || !bookingData) {
      return NextResponse.json(
        { ok: false, error: bookingError?.message ?? "Failed to create booking" },
        { status: 500 },
      );
    }

    const booking = bookingData as unknown as BookingSummary;

    if (payload.payment?.amount_cents && payload.payment.amount_cents > 0) {
      await adminClient.from("payments").insert({
        brand_id: brandId,
        customer_id: customerId,
        provider: payload.payment.provider?.trim() || "stripe",
        provider_payment_id: payload.payment.reference?.trim() || null,
        amount_cents: Math.max(0, Math.floor(payload.payment.amount_cents)),
        currency: payload.payment.currency?.trim().toUpperCase() || "USD",
        status: paymentStatusForPaymentsTable(payload.payment.status),
        paid_at: bookingPaymentStatus === "paid" ? createdAt : null,
        metadata: { booking_id: booking.id },
      });
    }

    const instructorName = [instructor.first_name, instructor.last_name].filter(Boolean).join(" ") || null;
    const notificationResult = await dependencies.sendBookingCreatedNotifications({
      studentEmail: customer.email,
      studentPhone: customer.phone,
      instructorName,
      startAt,
      studentTimeZone,
    });

    if (notificationResult.email && customer.email) {
      await dependencies.recordNotificationResult(adminClient, {
        bookingId: booking.id,
        brandId,
        template: "booking_created",
        recipient: customer.email,
        result: notificationResult.email,
      });
    }

    if (notificationResult.sms && customer.phone) {
      await dependencies.recordNotificationResult(adminClient, {
        bookingId: booking.id,
        brandId,
        template: "booking_created",
        recipient: customer.phone,
        result: notificationResult.sms,
      });
    }

    return NextResponse.json({
      ok: true,
      booking,
      notifications: {
        email: notificationResult.email,
        sms: notificationResult.sms,
      },
      sms_blocker: notificationResult.smsBlocker ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to create booking",
      },
      { status: 500 },
    );
  }
}
