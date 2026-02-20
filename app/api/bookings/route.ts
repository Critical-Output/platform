import { NextResponse } from "next/server";

import { canManageInstructor, resolveBookingApiContext } from "@/lib/bookings/context";
import { createBookingsPostHandler } from "@/lib/bookings/route-handlers";
import { formatDateInTimeZone, isValidIanaTimeZone } from "@/lib/bookings/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const resolved = await resolveBookingApiContext(request);
  if ("error" in resolved) {
    return NextResponse.json({ ok: false, error: resolved.error.message }, { status: resolved.error.status });
  }

  const { admin, brand, actor } = resolved.context;

  const url = new URL(request.url);
  const instructorId = url.searchParams.get("instructorId")?.trim();
  const upcomingOnly = url.searchParams.get("upcomingOnly") !== "false";
  const timezoneRaw = url.searchParams.get("timezone")?.trim() || "UTC";
  const timezone = isValidIanaTimeZone(timezoneRaw) ? timezoneRaw : "UTC";

  let query = admin
    .from("bookings")
    .select(
      "id, instructor_id, customer_id, course_id, status, payment_status, payment_reference, start_at, end_at, location, notes, instructor_notes, student_timezone, instructor_timezone, confirmed_at, completed_at, cancelled_at, reminder_sent_at, created_at",
    )
    .eq("brand_id", brand.id)
    .is("deleted_at", null)
    .order("start_at", { ascending: true });

  if (instructorId) {
    if (!canManageInstructor(resolved.context, instructorId)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    query = query.eq("instructor_id", instructorId);
  } else {
    if (!actor.customer) {
      return NextResponse.json({ ok: false, error: "instructorId is required for non-student users" }, { status: 400 });
    }

    query = query.eq("customer_id", actor.customer.id);
  }

  if (upcomingOnly) {
    query = query.gte("start_at", new Date().toISOString());
  }

  const { data: bookings, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  const normalized = (bookings ?? []).map((row) => {
    const booking = row as Record<string, unknown>;
    const startAt = String(booking.start_at ?? "");

    return {
      id: booking.id,
      instructorId: booking.instructor_id,
      customerId: booking.customer_id,
      courseId: booking.course_id,
      status: booking.status,
      paymentStatus: booking.payment_status,
      paymentReference: booking.payment_reference,
      startAt,
      endAt: booking.end_at,
      studentDisplay: formatDateInTimeZone(startAt, timezone),
      location: booking.location,
      notes: booking.notes,
      instructorNotes: booking.instructor_notes,
      studentTimezone: booking.student_timezone,
      instructorTimezone: booking.instructor_timezone,
      confirmedAt: booking.confirmed_at,
      completedAt: booking.completed_at,
      cancelledAt: booking.cancelled_at,
      reminderSentAt: booking.reminder_sent_at,
      createdAt: booking.created_at,
    };
  });

  return NextResponse.json({
    ok: true,
    bookings: normalized,
    calendar: instructorId
      ? {
          instructorId,
          timezone,
          upcomingOnly,
        }
      : null,
  });
}

export const POST = createBookingsPostHandler();
