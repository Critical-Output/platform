import { NextResponse } from "next/server";

import {
  ACTIVE_BOOKING_STATUSES,
  DEFAULT_ADVANCE_BOOKING_DAYS,
  DEFAULT_BUFFER_MINUTES,
  DEFAULT_CANCELLATION_CUTOFF_HOURS,
  DEFAULT_SESSION_MINUTES,
  type BookingStatus,
} from "@/lib/bookings/constants";
import { canManageInstructor, resolveBookingApiContext } from "@/lib/bookings/context";
import {
  sendBookingCreationNotifications,
  sendBookingReminderNotification,
} from "@/lib/bookings/notifications";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  canCancelBooking,
  formatDateInTimeZone,
  getBookingStatusTransitionError,
  hasBufferedOverlap,
  isValidBookingStatus,
  isValidIanaTimeZone,
  withinAdvanceBookingLimit,
} from "@/lib/bookings/utils";

type CreateBookingPayload = {
  instructorId?: unknown;
  courseId?: unknown;
  startAt?: unknown;
  endAt?: unknown;
  location?: unknown;
  notes?: unknown;
  studentTimezone?: unknown;
};

type BookingRouteDependencies = {
  resolveContext: typeof resolveBookingApiContext;
  sendCreationNotifications: typeof sendBookingCreationNotifications;
};

const bookingRouteDefaultDependencies: BookingRouteDependencies = {
  resolveContext: resolveBookingApiContext,
  sendCreationNotifications: sendBookingCreationNotifications,
};

type BookingInstructorsGetDependencies = {
  resolveContext: typeof resolveBookingApiContext;
};

const bookingInstructorsGetDefaultDependencies: BookingInstructorsGetDependencies = {
  resolveContext: resolveBookingApiContext,
};

const ISO_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(\.\d{1,3})?)?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

const parseTimezoneOffsetMinutes = (value: string): number => {
  if (value === "Z") return 0;

  const sign = value.startsWith("-") ? -1 : 1;
  const [hoursRaw, minutesRaw] = value.slice(1).split(":");
  const hours = Number.parseInt(hoursRaw ?? "", 10);
  const minutes = Number.parseInt(minutesRaw ?? "", 10);

  return sign * (hours * 60 + minutes);
};

const parseIsoDate = (value: unknown): string | null => {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  const match = ISO_TIMESTAMP_PATTERN.exec(trimmed);
  if (!match) return null;

  const [, yearRaw, monthRaw, dayRaw, hourRaw, minuteRaw, secondRaw, fractionRaw, timezoneRaw] = match;
  const year = Number.parseInt(yearRaw, 10);
  const month = Number.parseInt(monthRaw, 10);
  const day = Number.parseInt(dayRaw, 10);
  const hour = Number.parseInt(hourRaw, 10);
  const minute = Number.parseInt(minuteRaw, 10);
  const second = secondRaw ? Number.parseInt(secondRaw, 10) : 0;
  const millisecond = fractionRaw ? Number.parseInt(fractionRaw.slice(1).padEnd(3, "0"), 10) : 0;
  const timezoneOffsetMinutes = parseTimezoneOffsetMinutes(timezoneRaw);

  const utcTimestamp =
    Date.UTC(year, month - 1, day, hour, minute, second, millisecond) - timezoneOffsetMinutes * 60_000;
  const date = new Date(utcTimestamp);

  if (Number.isNaN(date.getTime())) return null;

  const roundTrippedInInputOffset = new Date(utcTimestamp + timezoneOffsetMinutes * 60_000);
  if (
    roundTrippedInInputOffset.getUTCFullYear() !== year ||
    roundTrippedInInputOffset.getUTCMonth() + 1 !== month ||
    roundTrippedInInputOffset.getUTCDate() !== day ||
    roundTrippedInInputOffset.getUTCHours() !== hour ||
    roundTrippedInInputOffset.getUTCMinutes() !== minute ||
    roundTrippedInInputOffset.getUTCSeconds() !== second ||
    roundTrippedInInputOffset.getUTCMilliseconds() !== millisecond
  ) {
    return null;
  }

  if (new Date(trimmed).getTime() !== utcTimestamp) return null;

  return date.toISOString();
};

const getDateInTimeZone = (timestamp: string, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));

  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";

  return `${year}-${month}-${day}`;
};

const ensureInstructorInBrand = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  brandId: string,
  instructorId: string,
) => {
  const { data: instructor, error: instructorError } = await admin
    .from("instructors")
    .select("id, brand_id, first_name, last_name, email")
    .eq("id", instructorId)
    .is("deleted_at", null)
    .maybeSingle();

  if (instructorError || !instructor) {
    return { error: "Instructor not found" } as const;
  }

  const instructorBrandId = (instructor as { brand_id: string }).brand_id;
  if (instructorBrandId === brandId) {
    return { instructor: instructor as Record<string, unknown> } as const;
  }

  const { data: membership, error: membershipError } = await admin
    .from("instructors_brands")
    .select("id")
    .eq("brand_id", brandId)
    .eq("instructor_id", instructorId)
    .is("deleted_at", null)
    .maybeSingle();

  if (membershipError || !membership?.id) {
    return { error: "Instructor is not assigned to this brand" } as const;
  }

  return { instructor: instructor as Record<string, unknown> } as const;
};

export const createBookingInstructorsGetHandler = (
  dependencies: BookingInstructorsGetDependencies = bookingInstructorsGetDefaultDependencies,
) =>
  async function GET(request: Request) {
    const resolved = await dependencies.resolveContext(request);
    if ("error" in resolved) {
      return NextResponse.json({ ok: false, error: resolved.error.message }, { status: resolved.error.status });
    }

    const { admin, brand } = resolved.context;

    const { data: linkedRows, error: linkedError } = await admin
      .from("instructors_brands")
      .select("instructor_id")
      .eq("brand_id", brand.id)
      .is("deleted_at", null);

    if (linkedError) {
      return NextResponse.json({ ok: false, error: linkedError.message }, { status: 400 });
    }

    const linkedIds = Array.from(
      new Set(
        (linkedRows ?? [])
          .map((row) => {
            const id = (row as { instructor_id?: unknown }).instructor_id;
            return typeof id === "string" ? id : null;
          })
          .filter((value): value is string => Boolean(value)),
      ),
    );

    const { data: homeBrandInstructors, error: homeBrandError } = await admin
      .from("instructors")
      .select("id, first_name, last_name, email, bio")
      .eq("brand_id", brand.id)
      .is("deleted_at", null)
      .order("last_name", { ascending: true });

    if (homeBrandError) {
      return NextResponse.json({ ok: false, error: homeBrandError.message }, { status: 400 });
    }

    const instructorsById = new Map<
      string,
      {
        id: string;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        bio: string | null;
      }
    >();

    for (const row of homeBrandInstructors ?? []) {
      const typed = row as {
        id: string;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        bio: string | null;
      };
      instructorsById.set(typed.id, typed);
    }

    const linkedOnlyIds = linkedIds.filter((id) => !instructorsById.has(id));
    if (linkedOnlyIds.length > 0) {
      const { data: linkedInstructors, error: linkedInstructorsError } = await admin
        .from("instructors")
        .select("id, first_name, last_name, email, bio")
        .in("id", linkedOnlyIds)
        .is("deleted_at", null)
        .order("last_name", { ascending: true });

      if (linkedInstructorsError) {
        return NextResponse.json({ ok: false, error: linkedInstructorsError.message }, { status: 400 });
      }

      for (const row of linkedInstructors ?? []) {
        const typed = row as {
          id: string;
          first_name: string | null;
          last_name: string | null;
          email: string | null;
          bio: string | null;
        };
        instructorsById.set(typed.id, typed);
      }
    }

    const instructorIds = Array.from(instructorsById.keys());
    if (instructorIds.length === 0) {
      return NextResponse.json({ ok: true, instructors: [] });
    }

    const { data: settingsRows, error: settingsError } = await admin
      .from("instructor_scheduling_settings")
      .select("instructor_id, timezone, buffer_minutes, advance_booking_days, cancellation_cutoff_hours")
      .eq("brand_id", brand.id)
      .in("instructor_id", instructorIds)
      .is("deleted_at", null);

    if (settingsError) {
      return NextResponse.json({ ok: false, error: settingsError.message }, { status: 400 });
    }

    const settingsByInstructor = new Map(
      (settingsRows ?? []).map((row) => {
        const typedRow = row as {
          instructor_id: string;
          timezone: string;
          buffer_minutes: number;
          advance_booking_days: number;
          cancellation_cutoff_hours: number;
        };

        return [typedRow.instructor_id, typedRow] as const;
      }),
    );

    const sortedInstructors = Array.from(instructorsById.values()).sort((left, right) => {
      const leftLast = (left.last_name ?? "").toLowerCase();
      const rightLast = (right.last_name ?? "").toLowerCase();
      if (leftLast !== rightLast) {
        return leftLast.localeCompare(rightLast);
      }

      const leftFirst = (left.first_name ?? "").toLowerCase();
      const rightFirst = (right.first_name ?? "").toLowerCase();
      if (leftFirst !== rightFirst) {
        return leftFirst.localeCompare(rightFirst);
      }

      return left.id.localeCompare(right.id);
    });

    const payload = sortedInstructors.map((instructor) => {
      const settings = settingsByInstructor.get(instructor.id);

      return {
        id: instructor.id,
        firstName: instructor.first_name,
        lastName: instructor.last_name,
        email: instructor.email,
        bio: instructor.bio,
        settings: {
          timezone: settings?.timezone ?? "UTC",
          bufferMinutes: settings?.buffer_minutes ?? DEFAULT_BUFFER_MINUTES,
          advanceBookingDays: settings?.advance_booking_days ?? DEFAULT_ADVANCE_BOOKING_DAYS,
          cancellationCutoffHours:
            settings?.cancellation_cutoff_hours ?? DEFAULT_CANCELLATION_CUTOFF_HOURS,
        },
      };
    });

    return NextResponse.json({ ok: true, instructors: payload });
  };

export const createBookingsPostHandler = (dependencies: BookingRouteDependencies = bookingRouteDefaultDependencies) =>
  async function POST(request: Request) {
    const resolved = await dependencies.resolveContext(request);
    if ("error" in resolved) {
      return NextResponse.json({ ok: false, error: resolved.error.message }, { status: resolved.error.status });
    }

    const { admin, userClient, brand, actor } = resolved.context;
    if (!actor.customer) {
      return NextResponse.json({ ok: false, error: "Only students can create bookings" }, { status: 403 });
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const body = (payload ?? {}) as CreateBookingPayload;

    const instructorId = typeof body.instructorId === "string" ? body.instructorId.trim() : "";
    if (!instructorId) {
      return NextResponse.json({ ok: false, error: "instructorId is required" }, { status: 400 });
    }

    const instructorLookup = await ensureInstructorInBrand(admin, brand.id, instructorId);
    if ("error" in instructorLookup) {
      return NextResponse.json({ ok: false, error: instructorLookup.error }, { status: 400 });
    }

    const startAt = parseIsoDate(body.startAt);
    const endAt = parseIsoDate(body.endAt);
    if (!startAt || !endAt) {
      return NextResponse.json({ ok: false, error: "startAt/endAt must be valid ISO timestamps" }, { status: 400 });
    }

    if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
      return NextResponse.json({ ok: false, error: "endAt must be after startAt" }, { status: 400 });
    }

    if (new Date(startAt).getTime() <= Date.now()) {
      return NextResponse.json({ ok: false, error: "startAt must be in the future" }, { status: 400 });
    }

    const { data: settings } = await admin
      .from("instructor_scheduling_settings")
      .select("timezone, buffer_minutes, advance_booking_days")
      .eq("brand_id", brand.id)
      .eq("instructor_id", instructorId)
      .is("deleted_at", null)
      .maybeSingle();

    const instructorTimezoneRaw = (settings as { timezone?: string } | null)?.timezone ?? "UTC";
    const instructorTimezone = isValidIanaTimeZone(instructorTimezoneRaw) ? instructorTimezoneRaw : "UTC";
    const studentTimezoneRaw = typeof body.studentTimezone === "string" ? body.studentTimezone.trim() : "UTC";
    const studentTimezone = isValidIanaTimeZone(studentTimezoneRaw) ? studentTimezoneRaw : "UTC";

    const bufferMinutes =
      (settings as { buffer_minutes?: number } | null)?.buffer_minutes ?? DEFAULT_BUFFER_MINUTES;
    const advanceBookingDays =
      (settings as { advance_booking_days?: number } | null)?.advance_booking_days ??
      DEFAULT_ADVANCE_BOOKING_DAYS;

    if (!withinAdvanceBookingLimit(startAt, advanceBookingDays)) {
      return NextResponse.json(
        {
          ok: false,
          error: `Booking exceeds advance booking limit of ${advanceBookingDays} days`,
        },
        { status: 400 },
      );
    }

    const requestedDurationMinutes = Math.max(
      15,
      Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60_000),
    );

    const { data: availableSlots, error: availabilityError } = await userClient.rpc("get_instructor_available_slots", {
      p_brand_id: brand.id,
      p_instructor_id: instructorId,
      p_start_date: getDateInTimeZone(startAt, instructorTimezone),
      p_days: 1,
      p_session_minutes: requestedDurationMinutes,
    });

    if (availabilityError) {
      return NextResponse.json({ ok: false, error: availabilityError.message }, { status: 400 });
    }

    const requestedStartMs = new Date(startAt).getTime();
    const requestedEndMs = new Date(endAt).getTime();
    const isWithinAvailability = (Array.isArray(availableSlots) ? availableSlots : []).some((slot) => {
      const typedSlot = slot as { start_at?: string; end_at?: string };
      const slotStart = new Date(String(typedSlot.start_at ?? "")).getTime();
      const slotEnd = new Date(String(typedSlot.end_at ?? "")).getTime();
      return slotStart === requestedStartMs && slotEnd === requestedEndMs;
    });

    if (!isWithinAvailability) {
      return NextResponse.json(
        { ok: false, error: "Selected slot is outside instructor availability" },
        { status: 409 },
      );
    }

    const bufferedWindowStart = new Date(new Date(startAt).getTime() - bufferMinutes * 60_000).toISOString();
    const bufferedWindowEnd = new Date(new Date(endAt).getTime() + bufferMinutes * 60_000).toISOString();

    const { data: existingBookings, error: existingBookingsError } = await admin
      .from("bookings")
      .select("id, start_at, end_at")
      .eq("brand_id", brand.id)
      .eq("instructor_id", instructorId)
      .in("status", ACTIVE_BOOKING_STATUSES as unknown as string[])
      .is("deleted_at", null)
      .lt("start_at", bufferedWindowEnd)
      .gt("end_at", bufferedWindowStart);

    if (existingBookingsError) {
      return NextResponse.json({ ok: false, error: existingBookingsError.message }, { status: 400 });
    }

    const overlaps = (existingBookings ?? []).some((booking) => {
      const existing = booking as { start_at: string; end_at: string };
      return hasBufferedOverlap(startAt, endAt, existing.start_at, existing.end_at, bufferMinutes);
    });

    if (overlaps) {
      return NextResponse.json(
        { ok: false, error: "Selected slot is unavailable due to an existing booking/buffer window" },
        { status: 409 },
      );
    }

    const courseId = typeof body.courseId === "string" && body.courseId.trim() ? body.courseId.trim() : null;
    const location = typeof body.location === "string" && body.location.trim() ? body.location.trim() : null;
    const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;

    const { data: bookingResult, error: bookingError } = await admin.rpc("create_pending_booking_atomic", {
      p_brand_id: brand.id,
      p_customer_id: actor.customer.id,
      p_instructor_id: instructorId,
      p_course_id: courseId,
      p_start_at: startAt,
      p_end_at: endAt,
      p_buffer_minutes: bufferMinutes,
      p_location: location,
      p_notes: notes,
      p_student_timezone: studentTimezone,
      p_instructor_timezone: instructorTimezone,
    });

    if (bookingError) {
      const isConflict =
        bookingError.code === "23P01" ||
        /unavailable due to an existing booking\/buffer window/i.test(bookingError.message);
      return NextResponse.json({ ok: false, error: bookingError.message }, { status: isConflict ? 409 : 400 });
    }

    const booking = Array.isArray(bookingResult)
      ? (bookingResult[0] as Record<string, unknown> | undefined)
      : ((bookingResult as Record<string, unknown> | null) ?? undefined);

    const bookingId = typeof booking?.id === "string" ? booking.id : null;
    if (!booking || !bookingId) {
      return NextResponse.json({ ok: false, error: "Booking creation failed: empty result" }, { status: 500 });
    }

    const instructor = instructorLookup.instructor as {
      first_name?: string | null;
      last_name?: string | null;
    };

    const instructorName = `${instructor.first_name ?? ""} ${instructor.last_name ?? ""}`.trim() || "Instructor";
    const studentName = `${actor.customer.first_name ?? ""} ${actor.customer.last_name ?? ""}`.trim() || "Student";

    const notifications = await dependencies.sendCreationNotifications({
      brandName: brand.name,
      instructorName,
      studentName,
      startAt,
      studentTimezone,
      studentEmail: actor.customer.email,
      studentPhone: actor.customer.phone,
    });

    return NextResponse.json({
      ok: true,
      booking,
      notifications,
      nextStep: {
        action: "confirm_and_pay",
        endpoint: `/api/bookings/${bookingId}`,
        method: "PATCH",
      },
    });
  };

type PaymentPayload = {
  amountCents?: unknown;
  currency?: unknown;
  provider?: unknown;
  providerPaymentId?: unknown;
};

type UpdatePayload = {
  status?: unknown;
  notes?: unknown;
  instructorNotes?: unknown;
  payment?: unknown;
};

type BookingPatchDependencies = {
  resolveContext: typeof resolveBookingApiContext;
};

const bookingPatchDefaultDependencies: BookingPatchDependencies = {
  resolveContext: resolveBookingApiContext,
};

const normalizeText = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const parsePositiveInteger = (value: unknown): number | null => {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value <= 0) return null;
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) return null;

    const parsed = Number(trimmed);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;
    return parsed;
  }

  return null;
};

const parsePaymentPayload = (value: unknown): {
  amountCents: number;
  currency: string;
  provider: string;
  providerPaymentId: string | null;
} | null => {
  if (!value || typeof value !== "object") return null;

  const payment = value as PaymentPayload;
  const amountCents = parsePositiveInteger(payment.amountCents);
  if (!amountCents) return null;

  const currencyRaw = typeof payment.currency === "string" ? payment.currency.trim() : "USD";
  if (!currencyRaw || currencyRaw.length > 8) return null;

  const providerRaw = typeof payment.provider === "string" ? payment.provider.trim() : "manual";
  if (!providerRaw || providerRaw.length > 60) return null;

  const providerPaymentIdRaw =
    typeof payment.providerPaymentId === "string" ? payment.providerPaymentId.trim() : "";

  return {
    amountCents,
    currency: currencyRaw.toUpperCase(),
    provider: providerRaw,
    providerPaymentId: providerPaymentIdRaw || null,
  };
};

export const createBookingPatchHandler =
  (dependencies: BookingPatchDependencies = bookingPatchDefaultDependencies) =>
  async function PATCH(
    request: Request,
    { params }: { params: { bookingId: string } },
  ) {
    const resolved = await dependencies.resolveContext(request);
    if ("error" in resolved) {
      return NextResponse.json({ ok: false, error: resolved.error.message }, { status: resolved.error.status });
    }

    const { admin, brand, actor } = resolved.context;
    const bookingId = params.bookingId?.trim();
    if (!bookingId) {
      return NextResponse.json({ ok: false, error: "bookingId is required" }, { status: 400 });
    }

    const { data: booking, error: bookingError } = await admin
      .from("bookings")
      .select(
        "id, brand_id, customer_id, instructor_id, status, start_at, payment_status, instructor_notes, notes",
      )
      .eq("id", bookingId)
      .eq("brand_id", brand.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (bookingError || !booking) {
      return NextResponse.json({ ok: false, error: "Booking not found" }, { status: 404 });
    }

    const typedBooking = booking as {
      id: string;
      customer_id: string;
      instructor_id: string | null;
      status: BookingStatus;
      start_at: string;
    };

    const isBookingOwner = Boolean(actor.customer?.id && actor.customer.id === typedBooking.customer_id);
    const isInstructorForBooking = Boolean(
      typedBooking.instructor_id && actor.instructorIds.includes(typedBooking.instructor_id),
    );
    const canManageBooking = actor.isBrandAdmin || isInstructorForBooking;

    if (!isBookingOwner && !canManageBooking) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const body = (payload ?? {}) as UpdatePayload;

    const nextStatus = body.status;
    const notes = normalizeText(body.notes);
    const instructorNotes = normalizeText(body.instructorNotes);
    const payment = parsePaymentPayload(body.payment);

    if (nextStatus !== undefined && !isValidBookingStatus(nextStatus)) {
      return NextResponse.json({ ok: false, error: "Invalid status" }, { status: 400 });
    }

    if (!nextStatus && notes === null && instructorNotes === null) {
      return NextResponse.json({ ok: false, error: "No updates provided" }, { status: 400 });
    }

    const status = (nextStatus as BookingStatus | undefined) ?? typedBooking.status;

    if (nextStatus) {
      if (nextStatus === "confirmed" && typedBooking.status !== "pending") {
        return NextResponse.json(
          { ok: false, error: "Only pending bookings can be confirmed" },
          { status: 409 },
        );
      }

      const transitionError = getBookingStatusTransitionError(typedBooking.status, nextStatus);
      if (transitionError) {
        return NextResponse.json({ ok: false, error: transitionError }, { status: 400 });
      }

      if ((nextStatus === "completed" || nextStatus === "no_show") && !canManageBooking) {
        return NextResponse.json(
          { ok: false, error: "Only instructors/admins can mark bookings as completed/no-show" },
          { status: 403 },
        );
      }

      if (nextStatus === "cancelled" && isBookingOwner) {
        let cutoffHours = DEFAULT_CANCELLATION_CUTOFF_HOURS;

        if (typedBooking.instructor_id) {
          const { data: settings } = await admin
            .from("instructor_scheduling_settings")
            .select("cancellation_cutoff_hours")
            .eq("brand_id", brand.id)
            .eq("instructor_id", typedBooking.instructor_id)
            .is("deleted_at", null)
            .maybeSingle();

          cutoffHours =
            (settings as { cancellation_cutoff_hours?: number } | null)?.cancellation_cutoff_hours ??
            DEFAULT_CANCELLATION_CUTOFF_HOURS;
        }

        if (!canCancelBooking(typedBooking.start_at, cutoffHours)) {
          return NextResponse.json(
            { ok: false, error: `Cancellation cutoff (${cutoffHours}h) has passed` },
            { status: 400 },
          );
        }
      }

      if (nextStatus === "confirmed") {
        if (!payment) {
          return NextResponse.json(
            { ok: false, error: "payment is required to confirm a booking" },
            { status: 400 },
          );
        }
      }
    }

    if (instructorNotes && !canManageBooking) {
      return NextResponse.json(
        { ok: false, error: "Only instructors/admins can add instructorNotes" },
        { status: 403 },
      );
    }

    if (instructorNotes) {
      const finalStatus = status;
      if (!(finalStatus === "completed" || finalStatus === "no_show" || finalStatus === "cancelled")) {
        return NextResponse.json(
          { ok: false, error: "instructorNotes can only be added post-session" },
          { status: 400 },
        );
      }
    }

    if (nextStatus === "confirmed" && payment) {
      const { data: confirmResult, error: confirmError } = await admin.rpc("confirm_booking_with_payment", {
        p_brand_id: brand.id,
        p_booking_id: bookingId,
        p_provider: payment.provider,
        p_provider_payment_id: payment.providerPaymentId,
        p_amount_cents: payment.amountCents,
        p_currency: payment.currency,
        p_notes: notes,
        p_instructor_notes: instructorNotes,
      });

      if (confirmError) {
        return NextResponse.json(
          {
            ok: false,
            error: `Unable to confirm booking with payment: ${confirmError.message}`,
          },
          { status: 500 },
        );
      }

      const confirmedBooking = Array.isArray(confirmResult)
        ? (confirmResult[0] as Record<string, unknown> | undefined)
        : ((confirmResult as Record<string, unknown> | null) ?? undefined);

      if (!confirmedBooking) {
        return NextResponse.json(
          { ok: false, error: "Unable to confirm booking with payment: empty result" },
          { status: 500 },
        );
      }

      return NextResponse.json({ ok: true, booking: confirmedBooking });
    }

    const updates: Record<string, unknown> = {};
    if (nextStatus) updates.status = nextStatus;
    if (notes !== null) updates.notes = notes;
    if (instructorNotes !== null) updates.instructor_notes = instructorNotes;

    const { data: updatedBooking, error: updateError } = await admin
      .from("bookings")
      .update(updates)
      .eq("id", bookingId)
      .eq("brand_id", brand.id)
      .select(
        "id, status, payment_status, payment_reference, start_at, end_at, notes, instructor_notes, confirmed_at, completed_at, cancelled_at, updated_at",
      )
      .single();

    if (updateError) {
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, booking: updatedBooking });
  };

type AvailabilityRouteDependencies = {
  resolveContext: typeof resolveBookingApiContext;
};

const availabilityRouteDefaultDependencies: AvailabilityRouteDependencies = {
  resolveContext: resolveBookingApiContext,
};

type WeeklySlotInput = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

type DateOverrideInput = {
  date: string;
  isAvailable: boolean;
  startTime?: string;
  endTime?: string;
};

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

const parseInteger = (
  rawValue: string | null,
  fallback: number,
  min: number,
  max: number,
): number => {
  if (!rawValue) return fallback;
  const value = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
};

const isValidTimeRange = (startTime: string, endTime: string): boolean => {
  if (!TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime)) return false;
  return startTime < endTime;
};

const normalizeDate = (value: string): string | null => {
  if (!ISO_DATE_PATTERN.test(value)) return null;

  const [yearPart, monthPart, dayPart] = value.split("-");
  const year = Number.parseInt(yearPart, 10);
  const month = Number.parseInt(monthPart, 10);
  const day = Number.parseInt(dayPart, 10);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return null;
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    return null;
  }

  return value;
};

export const createBookingAvailabilityGetHandler = (
  dependencies: AvailabilityRouteDependencies = availabilityRouteDefaultDependencies,
) =>
  async function GET(request: Request) {
    const resolved = await dependencies.resolveContext(request);
    if ("error" in resolved) {
      return NextResponse.json({ ok: false, error: resolved.error.message }, { status: resolved.error.status });
    }

    const { admin, userClient, brand, actor } = resolved.context;

    const url = new URL(request.url);
    const instructorId = url.searchParams.get("instructorId")?.trim();
    if (!instructorId) {
      return NextResponse.json({ ok: false, error: "instructorId is required" }, { status: 400 });
    }

    const isSelf = canManageInstructor(resolved.context, instructorId);
    if (!actor.isBrandAdmin && !actor.customer && !isSelf) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const days = parseInteger(url.searchParams.get("days"), 14, 1, 60);
    const sessionMinutes = parseInteger(
      url.searchParams.get("sessionMinutes"),
      DEFAULT_SESSION_MINUTES,
      15,
      240,
    );

    const startDateRaw = url.searchParams.get("startDate");
    const startDate = startDateRaw ? normalizeDate(startDateRaw) : null;
    if (startDateRaw && !startDate) {
      return NextResponse.json({ ok: false, error: "startDate must be YYYY-MM-DD" }, { status: 400 });
    }

    const studentTimezoneRaw = url.searchParams.get("studentTimezone")?.trim() || "UTC";
    const studentTimezone = isValidIanaTimeZone(studentTimezoneRaw) ? studentTimezoneRaw : "UTC";

    const { data: settings } = await admin
      .from("instructor_scheduling_settings")
      .select("timezone, buffer_minutes, advance_booking_days, cancellation_cutoff_hours")
      .eq("brand_id", brand.id)
      .eq("instructor_id", instructorId)
      .is("deleted_at", null)
      .maybeSingle();

    const { data: slots, error: slotsError } = await userClient.rpc("get_instructor_available_slots", {
      p_brand_id: brand.id,
      p_instructor_id: instructorId,
      p_start_date: startDate ?? undefined,
      p_days: days,
      p_session_minutes: sessionMinutes,
    });

    if (slotsError) {
      return NextResponse.json({ ok: false, error: slotsError.message }, { status: 400 });
    }

    const slotRows = Array.isArray(slots) ? slots : [];
    const formattedSlots = slotRows.map((slot) => {
      const typed = slot as { start_at: string; end_at: string };

      return {
        startAt: typed.start_at,
        endAt: typed.end_at,
        studentDisplay: formatDateInTimeZone(typed.start_at, studentTimezone),
      };
    });

    const typedSettings = settings as {
      timezone?: string;
      buffer_minutes?: number;
      advance_booking_days?: number;
      cancellation_cutoff_hours?: number;
    } | null;

    return NextResponse.json({
      ok: true,
      instructorId,
      settings: {
        timezone: typedSettings?.timezone ?? "UTC",
        bufferMinutes: typedSettings?.buffer_minutes ?? DEFAULT_BUFFER_MINUTES,
        advanceBookingDays: typedSettings?.advance_booking_days ?? DEFAULT_ADVANCE_BOOKING_DAYS,
        cancellationCutoffHours:
          typedSettings?.cancellation_cutoff_hours ?? DEFAULT_CANCELLATION_CUTOFF_HOURS,
        sessionMinutes,
      },
      slots: formattedSlots,
    });
  };

export const createBookingAvailabilityPutHandler = (
  dependencies: AvailabilityRouteDependencies = availabilityRouteDefaultDependencies,
) =>
  async function PUT(request: Request) {
    const resolved = await dependencies.resolveContext(request);
    if ("error" in resolved) {
      return NextResponse.json({ ok: false, error: resolved.error.message }, { status: resolved.error.status });
    }

    const { admin, brand } = resolved.context;

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const body = (payload ?? {}) as {
      instructorId?: unknown;
      timezone?: unknown;
      bufferMinutes?: unknown;
      advanceBookingDays?: unknown;
      cancellationCutoffHours?: unknown;
      weeklySlots?: unknown;
      dateOverrides?: unknown;
    };

    if (typeof body.instructorId !== "string" || !body.instructorId.trim()) {
      return NextResponse.json({ ok: false, error: "instructorId is required" }, { status: 400 });
    }

    const instructorId = body.instructorId.trim();
    if (!canManageInstructor(resolved.context, instructorId)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const timezoneRaw = typeof body.timezone === "string" ? body.timezone.trim() : "UTC";
    if (!isValidIanaTimeZone(timezoneRaw)) {
      return NextResponse.json({ ok: false, error: "timezone must be a valid IANA timezone" }, { status: 400 });
    }

    const bufferMinutes = parseInteger(
      String(body.bufferMinutes ?? DEFAULT_BUFFER_MINUTES),
      DEFAULT_BUFFER_MINUTES,
      0,
      120,
    );
    const advanceBookingDays = parseInteger(
      String(body.advanceBookingDays ?? DEFAULT_ADVANCE_BOOKING_DAYS),
      DEFAULT_ADVANCE_BOOKING_DAYS,
      1,
      365,
    );
    const cancellationCutoffHours = parseInteger(
      String(body.cancellationCutoffHours ?? DEFAULT_CANCELLATION_CUTOFF_HOURS),
      DEFAULT_CANCELLATION_CUTOFF_HOURS,
      0,
      720,
    );

    const weeklySlots = Array.isArray(body.weeklySlots)
      ? (body.weeklySlots as WeeklySlotInput[])
      : [];

    for (const slot of weeklySlots) {
      if (!Number.isInteger(slot.dayOfWeek) || slot.dayOfWeek < 0 || slot.dayOfWeek > 6) {
        return NextResponse.json(
          { ok: false, error: "weeklySlots.dayOfWeek must be between 0 and 6" },
          { status: 400 },
        );
      }

      if (!isValidTimeRange(slot.startTime, slot.endTime)) {
        return NextResponse.json({ ok: false, error: "weeklySlots must include valid time ranges" }, { status: 400 });
      }
    }

    const dateOverrides = Array.isArray(body.dateOverrides)
      ? (body.dateOverrides as DateOverrideInput[])
      : [];

    for (const override of dateOverrides) {
      if (!normalizeDate(override.date)) {
        return NextResponse.json({ ok: false, error: "dateOverrides.date must be YYYY-MM-DD" }, { status: 400 });
      }

      if (typeof override.isAvailable !== "boolean") {
        return NextResponse.json({ ok: false, error: "dateOverrides.isAvailable must be boolean" }, { status: 400 });
      }

      if (override.isAvailable) {
        if (!override.startTime || !override.endTime || !isValidTimeRange(override.startTime, override.endTime)) {
          return NextResponse.json(
            { ok: false, error: "available date overrides require valid startTime/endTime" },
            { status: 400 },
          );
        }
      }
    }

    const weeklyPayload = weeklySlots.map((slot) => ({
      day_of_week: slot.dayOfWeek,
      start_time: slot.startTime,
      end_time: slot.endTime,
    }));

    const overridesPayload = dateOverrides.map((override) => ({
      override_date: override.date,
      is_available: override.isAvailable,
      start_time: override.isAvailable ? override.startTime : null,
      end_time: override.isAvailable ? override.endTime : null,
    }));

    const { error: replaceError } = await admin.rpc("replace_instructor_availability", {
      p_brand_id: brand.id,
      p_instructor_id: instructorId,
      p_timezone: timezoneRaw,
      p_buffer_minutes: bufferMinutes,
      p_advance_booking_days: advanceBookingDays,
      p_cancellation_cutoff_hours: cancellationCutoffHours,
      p_weekly_slots: weeklyPayload,
      p_date_overrides: overridesPayload,
    });

    if (replaceError) {
      return NextResponse.json({ ok: false, error: replaceError.message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      instructorId,
      settings: {
        timezone: timezoneRaw,
        bufferMinutes,
        advanceBookingDays,
        cancellationCutoffHours,
      },
      weeklySlots,
      dateOverrides,
    });
  };

type ReminderRouteDependencies = {
  createAdminClient: typeof createSupabaseAdminClient;
  sendReminderNotification: typeof sendBookingReminderNotification;
  now: () => number;
  getCronSecret: () => string | undefined;
  getServiceRoleKey: () => string | undefined;
};

const reminderRouteDefaultDependencies: ReminderRouteDependencies = {
  createAdminClient: createSupabaseAdminClient,
  sendReminderNotification: sendBookingReminderNotification,
  now: () => Date.now(),
  getCronSecret: () => process.env.BOOKING_REMINDER_CRON_SECRET,
  getServiceRoleKey: () => process.env.SUPABASE_SERVICE_ROLE_KEY,
};

const getBearerToken = (authorizationHeader: string | null): string | null => {
  if (!authorizationHeader) return null;

  const trimmed = authorizationHeader.trim();
  if (!trimmed.toLowerCase().startsWith("bearer ")) return null;

  const token = trimmed.slice(7).trim();
  return token || null;
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "unknown error";
};

export const createBookingRemindersPostHandler = (
  dependencies: ReminderRouteDependencies = reminderRouteDefaultDependencies,
) =>
  async function POST(request: Request) {
    const expectedSecret = dependencies.getCronSecret()?.trim() ?? "";
    const expectedServiceRoleKey = dependencies.getServiceRoleKey()?.trim() ?? "";
    const providedSecret = request.headers.get("x-booking-cron-secret")?.trim() ?? "";
    const providedBearerToken = getBearerToken(request.headers.get("authorization"));

    const isSecretAuthValid = Boolean(expectedSecret) && providedSecret === expectedSecret;
    const isServiceAuthValid =
      Boolean(expectedServiceRoleKey) &&
      Boolean(providedBearerToken) &&
      providedBearerToken === expectedServiceRoleKey;

    if (!isSecretAuthValid && !isServiceAuthValid) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const admin = dependencies.createAdminClient();
    const now = dependencies.now();
    const windowStart = new Date(now + 23 * 60 * 60 * 1000).toISOString();
    const windowEnd = new Date(now + 25 * 60 * 60 * 1000).toISOString();

    const { data: bookings, error: bookingsError } = await admin
      .from("bookings")
      .select("id, brand_id, customer_id, instructor_id, start_at, student_timezone")
      .eq("status", "confirmed")
      .is("deleted_at", null)
      .is("reminder_sent_at", null)
      .gte("start_at", windowStart)
      .lte("start_at", windowEnd);

    if (bookingsError) {
      return NextResponse.json({ ok: false, error: bookingsError.message }, { status: 400 });
    }

    const bookingRows = (bookings ?? []) as Array<{
      id: string;
      brand_id: string;
      customer_id: string;
      instructor_id: string | null;
      start_at: string;
      student_timezone: string | null;
    }>;

    if (bookingRows.length === 0) {
      return NextResponse.json({ ok: true, attempted: 0, sent: 0, warnings: [] });
    }

    const brandIds = Array.from(new Set(bookingRows.map((booking) => booking.brand_id)));
    const customerIds = Array.from(new Set(bookingRows.map((booking) => booking.customer_id)));
    const instructorIds = Array.from(
      new Set(
        bookingRows
          .map((booking) => booking.instructor_id)
          .filter((value): value is string => Boolean(value)),
      ),
    );

    const [{ data: brands }, { data: customers }, { data: instructors }] = await Promise.all([
      admin.from("brands").select("id, name").in("id", brandIds),
      admin.from("customers").select("id, first_name, last_name, phone").in("id", customerIds),
      instructorIds.length > 0
        ? admin.from("instructors").select("id, first_name, last_name").in("id", instructorIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const brandsById = new Map(
      (brands ?? []).map((row) => {
        const typed = row as { id: string; name: string };
        return [typed.id, typed.name] as const;
      }),
    );

    const customersById = new Map(
      (customers ?? []).map((row) => {
        const typed = row as {
          id: string;
          first_name: string | null;
          last_name: string | null;
          phone: string | null;
        };
        return [typed.id, typed] as const;
      }),
    );

    const instructorsById = new Map(
      (instructors ?? []).map((row) => {
        const typed = row as { id: string; first_name: string | null; last_name: string | null };
        return [typed.id, typed] as const;
      }),
    );

    let sent = 0;
    const warnings: string[] = [];

    for (const booking of bookingRows) {
      const claimTimestamp = new Date(dependencies.now()).toISOString();
      const { data: claimedBooking, error: claimError } = await admin
        .from("bookings")
        .update({ reminder_sent_at: claimTimestamp })
        .eq("id", booking.id)
        .eq("brand_id", booking.brand_id)
        .eq("status", "confirmed")
        .is("deleted_at", null)
        .is("reminder_sent_at", null)
        .select("id")
        .maybeSingle();

      if (claimError) {
        warnings.push(`Failed to claim booking ${booking.id} for reminder dispatch: ${claimError.message}`);
        continue;
      }

      if (!claimedBooking) {
        continue;
      }

      const releaseReminderClaim = async () => {
        const { error: releaseError } = await admin
          .from("bookings")
          .update({ reminder_sent_at: null })
          .eq("id", booking.id)
          .eq("brand_id", booking.brand_id)
          .eq("reminder_sent_at", claimTimestamp)
          .select("id")
          .maybeSingle();

        if (releaseError) {
          warnings.push(`Failed to release reminder claim for booking ${booking.id}: ${releaseError.message}`);
        }
      };

      const customer = customersById.get(booking.customer_id);
      const instructor = booking.instructor_id ? instructorsById.get(booking.instructor_id) : null;

      const studentName = `${customer?.first_name ?? ""} ${customer?.last_name ?? ""}`.trim() || "Student";
      const instructorName = `${instructor?.first_name ?? ""} ${instructor?.last_name ?? ""}`.trim() || "Instructor";
      const brandName = brandsById.get(booking.brand_id) ?? "Brand";

      let result:
        | {
            smsSent: boolean;
            warnings: string[];
          }
        | undefined;

      try {
        result = await dependencies.sendReminderNotification({
          brandName,
          instructorName,
          studentName,
          startAt: booking.start_at,
          studentTimezone: booking.student_timezone ?? "UTC",
          studentPhone: customer?.phone ?? null,
        });
      } catch (error) {
        await releaseReminderClaim();
        warnings.push(`booking ${booking.id}: failed to dispatch reminder: ${getErrorMessage(error)}`);
        continue;
      }

      if (!result.smsSent) {
        await releaseReminderClaim();
      }

      if (result.smsSent) {
        sent += 1;
      }

      warnings.push(
        ...result.warnings.map((warning) => `booking ${booking.id}: ${warning}`),
      );
    }

    return NextResponse.json({
      ok: true,
      attempted: bookingRows.length,
      sent,
      warnings,
    });
  };
