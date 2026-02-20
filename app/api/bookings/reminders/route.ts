import { NextResponse } from "next/server";

import { sendBookingReminder24hNotification } from "@/lib/bookings/notifications";
import { recordNotificationResult } from "@/lib/bookings/service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type ReminderCandidate = {
  id: string;
  brand_id: string;
  customer_id: string;
  instructor_id: string | null;
  start_at: string;
  student_timezone: string | null;
};

export async function POST(request: Request) {
  const configuredKey = process.env.BOOKING_REMINDER_API_KEY?.trim();
  const providedKey = request.headers.get("x-booking-reminder-key")?.trim();

  if (!configuredKey && process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { ok: false, error: "Server misconfigured: BOOKING_REMINDER_API_KEY is required" },
      { status: 500 },
    );
  }

  if (configuredKey && configuredKey !== providedKey) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const adminClient = createSupabaseAdminClient();

    const now = new Date();
    const windowStart = new Date(now.getTime() + (23 * 60 * 60 * 1000)).toISOString();
    const windowEnd = new Date(now.getTime() + (25 * 60 * 60 * 1000)).toISOString();

    const { data: bookingsData, error: bookingsError } = await adminClient
      .from("bookings")
      .select("id,brand_id,customer_id,instructor_id,start_at,student_timezone")
      .eq("status", "confirmed")
      .is("deleted_at", null)
      .is("reminder_24h_sent_at", null)
      .gte("start_at", windowStart)
      .lte("start_at", windowEnd)
      .order("start_at", { ascending: true })
      .limit(500);

    if (bookingsError) {
      return NextResponse.json({ ok: false, error: bookingsError.message }, { status: 500 });
    }

    const candidates = (bookingsData ?? []) as ReminderCandidate[];
    if (candidates.length === 0) {
      return NextResponse.json({ ok: true, scanned: 0, sent: 0, failed: 0, sms_blockers: [] });
    }

    const customerIds = Array.from(new Set(candidates.map((row) => row.customer_id)));
    const instructorIds = Array.from(new Set(candidates.map((row) => row.instructor_id).filter(Boolean))) as string[];

    const [{ data: customerRows }, { data: instructorRows }] = await Promise.all([
      adminClient
        .from("customers")
        .select("id,email,phone")
        .in("id", customerIds)
        .is("deleted_at", null),
      instructorIds.length
        ? adminClient
          .from("instructors")
          .select("id,first_name,last_name")
          .in("id", instructorIds)
          .is("deleted_at", null)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const customerMap = new Map(
      ((customerRows ?? []) as Array<{ id: string; email?: string | null; phone?: string | null }>).map((row) => [
        row.id,
        row,
      ]),
    );

    const instructorMap = new Map(
      ((instructorRows ?? []) as Array<{ id: string; first_name?: string | null; last_name?: string | null }>).map((row) => [
        row.id,
        [row.first_name, row.last_name].filter(Boolean).join(" ") || null,
      ]),
    );

    let sentCount = 0;
    let failedCount = 0;
    const smsBlockers = new Set<string>();

    for (const booking of candidates) {
      const customer = customerMap.get(booking.customer_id);
      if (!customer) {
        failedCount += 1;
        continue;
      }

      const reminderResult = await sendBookingReminder24hNotification({
        studentEmail: customer.email ?? null,
        studentPhone: customer.phone ?? null,
        instructorName: booking.instructor_id ? instructorMap.get(booking.instructor_id) ?? null : null,
        startAt: new Date(booking.start_at),
        studentTimeZone: booking.student_timezone ?? "UTC",
      });

      if (reminderResult.sms && customer.phone) {
        await recordNotificationResult(adminClient, {
          bookingId: booking.id,
          brandId: booking.brand_id,
          template: "booking_reminder_24h",
          recipient: customer.phone,
          result: reminderResult.sms,
        });
      }

      if (reminderResult.emailFallback && customer.email) {
        await recordNotificationResult(adminClient, {
          bookingId: booking.id,
          brandId: booking.brand_id,
          template: "booking_reminder_24h",
          recipient: customer.email,
          result: reminderResult.emailFallback,
        });
      }

      if (reminderResult.smsBlocker) {
        smsBlockers.add(reminderResult.smsBlocker);
      }

      const reminderDelivered =
        reminderResult.sms?.status === "sent" || reminderResult.emailFallback?.status === "sent";

      if (reminderDelivered) {
        sentCount += 1;
        await adminClient
          .from("bookings")
          .update({ reminder_24h_sent_at: new Date().toISOString() })
          .eq("id", booking.id)
          .eq("brand_id", booking.brand_id);
      } else {
        failedCount += 1;
      }
    }

    return NextResponse.json({
      ok: true,
      scanned: candidates.length,
      sent: sentCount,
      failed: failedCount,
      sms_blockers: Array.from(smsBlockers),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to process reminders",
      },
      { status: 500 },
    );
  }
}
