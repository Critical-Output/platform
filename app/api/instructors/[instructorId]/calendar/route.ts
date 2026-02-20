import { NextResponse } from "next/server";

import {
  getSchedulingSettings,
  instructorWorksForBrand,
  isBrandAdmin,
  isInstructorUser,
  listInstructorCalendarBookings,
} from "@/lib/bookings/service";
import { formatDateTimeForZone } from "@/lib/bookings/scheduling";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const resolveCalendarRange = (requestUrl: URL) => {
  const fromRaw = requestUrl.searchParams.get("from")?.trim();
  const toRaw = requestUrl.searchParams.get("to")?.trim();
  const upcomingDaysRaw = requestUrl.searchParams.get("upcoming_days")?.trim();

  const now = new Date();
  const fromDate = fromRaw ? new Date(fromRaw) : now;
  const fallbackDays = 30;
  const upcomingDays = upcomingDaysRaw ? Number.parseInt(upcomingDaysRaw, 10) : fallbackDays;

  const safeDays = Number.isInteger(upcomingDays) && upcomingDays > 0 && upcomingDays <= 365
    ? upcomingDays
    : fallbackDays;

  const toDate = toRaw ? new Date(toRaw) : new Date(fromDate.getTime() + (safeDays * 24 * 60 * 60 * 1000));

  const from = Number.isNaN(fromDate.getTime()) ? now : fromDate;
  const to = Number.isNaN(toDate.getTime()) ? new Date(now.getTime() + (fallbackDays * 24 * 60 * 60 * 1000)) : toDate;

  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
};

export async function GET(
  request: Request,
  context: { params: { instructorId: string } },
) {
  const requestUrl = new URL(request.url);
  const brandId = requestUrl.searchParams.get("brand_id")?.trim();

  if (!brandId) {
    return NextResponse.json(
      { ok: false, error: "brand_id is required" },
      { status: 400 },
    );
  }

  try {
    const sessionClient = createSupabaseServerClient();
    const adminClient = createSupabaseAdminClient();

    const { data: userData, error: userError } = await sessionClient.auth.getUser();
    if (userError || !userData.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const instructorId = context.params.instructorId;
    const [worksForBrand, brandAdmin, instructorSelf] = await Promise.all([
      instructorWorksForBrand(adminClient, instructorId, brandId),
      isBrandAdmin(adminClient, brandId, userData.user.id),
      isInstructorUser(adminClient, instructorId, userData.user.id),
    ]);

    if (!worksForBrand) {
      return NextResponse.json(
        { ok: false, error: "Instructor is not linked to this brand" },
        { status: 404 },
      );
    }

    if (!brandAdmin && !instructorSelf) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const range = resolveCalendarRange(requestUrl);
    const [settings, bookings] = await Promise.all([
      getSchedulingSettings(adminClient, brandId, instructorId),
      listInstructorCalendarBookings(adminClient, {
        brandId,
        instructorId,
        startAt: range.from,
        endAt: range.to,
      }),
    ]);

    return NextResponse.json({
      ok: true,
      brand_id: brandId,
      instructor_id: instructorId,
      timezone: settings.timezone,
      range,
      bookings: bookings.map((booking) => ({
        ...booking,
        instructor_local_start: formatDateTimeForZone(new Date(booking.start_at), settings.timezone),
        instructor_local_end: formatDateTimeForZone(new Date(booking.end_at), settings.timezone),
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to load instructor calendar",
      },
      { status: 500 },
    );
  }
}
