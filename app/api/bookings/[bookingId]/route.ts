import { NextResponse } from "next/server";

import {
  getBookingById,
  getBookingPermissions,
  getSchedulingSettings,
} from "@/lib/bookings/service";
import {
  BOOKING_STATUSES,
  buildStatusTimestampPatch,
  canTransitionBookingStatus,
  isCancellationAllowed,
  type BookingStatus,
} from "@/lib/bookings/scheduling";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type BookingPatchPayload = {
  brand_id?: string;
  status?: string;
  cancellation_reason?: string | null;
  instructor_notes?: string | null;
  notes?: string | null;
};

const bookingSelect =
  "id,brand_id,customer_id,instructor_id,status,start_at,end_at,notes,instructor_notes,payment_status,student_timezone,instructor_timezone";

export async function PATCH(
  request: Request,
  context: { params: { bookingId: string } },
) {
  let payload: BookingPatchPayload;

  try {
    payload = (await request.json()) as BookingPatchPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const brandId = payload.brand_id?.trim();
  if (!brandId) {
    return NextResponse.json({ ok: false, error: "brand_id is required" }, { status: 400 });
  }

  try {
    const sessionClient = createSupabaseServerClient();
    const adminClient = createSupabaseAdminClient();

    const { data: userData, error: userError } = await sessionClient.auth.getUser();
    if (userError || !userData.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const bookingId = context.params.bookingId;
    const booking = await getBookingById(adminClient, bookingId, brandId);
    if (!booking) {
      return NextResponse.json({ ok: false, error: "Booking not found" }, { status: 404 });
    }

    const permissions = await getBookingPermissions(adminClient, brandId, booking, userData.user.id);
    if (!permissions.isBrandAdmin && !permissions.isInstructor && !permissions.isCustomer) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const updates: Record<string, unknown> = {};
    const nowIso = new Date().toISOString();

    if (typeof payload.status === "string" && payload.status.trim()) {
      const nextStatus = payload.status.trim() as BookingStatus;

      if (!BOOKING_STATUSES.includes(nextStatus)) {
        return NextResponse.json({ ok: false, error: "Invalid booking status" }, { status: 400 });
      }

      const currentStatus = booking.status as BookingStatus;
      if (!canTransitionBookingStatus(currentStatus, nextStatus)) {
        return NextResponse.json(
          { ok: false, error: `Invalid status transition: ${currentStatus} -> ${nextStatus}` },
          { status: 400 },
        );
      }

      // Customers can only cancel their own booking.
      if (permissions.isCustomer && !permissions.isBrandAdmin && !permissions.isInstructor && nextStatus !== "cancelled") {
        return NextResponse.json(
          { ok: false, error: "Customers can only cancel bookings" },
          { status: 403 },
        );
      }

      if (nextStatus === "cancelled" && permissions.isCustomer && !permissions.isBrandAdmin && !permissions.isInstructor) {
        if (!booking.instructor_id) {
          return NextResponse.json(
            { ok: false, error: "Booking has no instructor assigned" },
            { status: 400 },
          );
        }

        const settings = await getSchedulingSettings(adminClient, brandId, booking.instructor_id);
        const allowed = isCancellationAllowed(
          new Date(booking.start_at),
          new Date(),
          settings.cancellation_cutoff_hours,
        );

        if (!allowed) {
          return NextResponse.json(
            {
              ok: false,
              error: `Cancellations must be made at least ${settings.cancellation_cutoff_hours} hours before start time`,
            },
            { status: 409 },
          );
        }
      }

      updates.status = nextStatus;
      Object.assign(updates, buildStatusTimestampPatch(nextStatus, nowIso));

      if (nextStatus === "cancelled") {
        updates.cancellation_reason = payload.cancellation_reason ?? null;
      }
    }

    if (payload.instructor_notes !== undefined) {
      if (!permissions.isBrandAdmin && !permissions.isInstructor) {
        return NextResponse.json(
          { ok: false, error: "Only instructors or brand admins can edit instructor notes" },
          { status: 403 },
        );
      }

      updates.instructor_notes = payload.instructor_notes;
    }

    if (payload.notes !== undefined) {
      updates.notes = payload.notes;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { ok: false, error: "No updatable fields provided" },
        { status: 400 },
      );
    }

    const { data: updatedBooking, error: updateError } = await adminClient
      .from("bookings")
      .update(updates)
      .eq("id", booking.id)
      .eq("brand_id", brandId)
      .select(bookingSelect)
      .single();

    if (updateError || !updatedBooking) {
      return NextResponse.json(
        { ok: false, error: updateError?.message ?? "Failed to update booking" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, booking: updatedBooking });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to update booking",
      },
      { status: 500 },
    );
  }
}
