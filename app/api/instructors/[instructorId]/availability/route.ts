import { NextResponse } from "next/server";

import {
  getSchedulingSettings,
  instructorWorksForBrand,
  isBrandAdmin,
  isInstructorUser,
  replaceAvailabilityOverrides,
  replaceAvailabilityRules,
  upsertSchedulingSettings,
} from "@/lib/bookings/service";
import { parseTimeToMinutes } from "@/lib/bookings/scheduling";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type AvailabilityUpdatePayload = {
  brand_id?: string;
  settings?: {
    timezone?: string;
    session_duration_minutes?: number;
    buffer_minutes?: number;
    advance_booking_days?: number;
    cancellation_cutoff_hours?: number;
  };
  weekly_slots?: Array<{
    weekday: number;
    start_time: string;
    end_time: string;
  }>;
  date_overrides?: Array<{
    override_date: string;
    is_available: boolean;
    start_time?: string | null;
    end_time?: string | null;
    reason?: string | null;
  }>;
};

const loadAvailabilitySnapshot = async (
  brandId: string,
  instructorId: string,
  dateFrom: string,
  dateTo: string,
) => {
  const adminClient = createSupabaseAdminClient();

  const [settings, rulesResult, overridesResult] = await Promise.all([
    getSchedulingSettings(adminClient, brandId, instructorId),
    adminClient
      .from("instructor_availability_rules")
      .select("id,weekday,start_time,end_time,is_active")
      .eq("brand_id", brandId)
      .eq("instructor_id", instructorId)
      .is("deleted_at", null)
      .order("weekday", { ascending: true })
      .order("start_time", { ascending: true }),
    adminClient
      .from("instructor_availability_overrides")
      .select("id,override_date,is_available,start_time,end_time,reason")
      .eq("brand_id", brandId)
      .eq("instructor_id", instructorId)
      .is("deleted_at", null)
      .gte("override_date", dateFrom)
      .lte("override_date", dateTo)
      .order("override_date", { ascending: true })
      .order("start_time", { ascending: true }),
  ]);

  return {
    settings,
    weekly_slots: rulesResult.error ? [] : rulesResult.data ?? [],
    date_overrides: overridesResult.error ? [] : overridesResult.data ?? [],
  };
};

const parseDateRange = (requestUrl: URL) => {
  const from = requestUrl.searchParams.get("from")?.trim();
  const to = requestUrl.searchParams.get("to")?.trim();

  const today = new Date();
  const fallbackFrom = today.toISOString().slice(0, 10);
  const ninetyDays = new Date(today.getTime() + (90 * 24 * 60 * 60 * 1000));
  const fallbackTo = ninetyDays.toISOString().slice(0, 10);

  return {
    from: from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : fallbackFrom,
    to: to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : fallbackTo,
  };
};

const validateWeeklySlots = (slots: AvailabilityUpdatePayload["weekly_slots"]) => {
  if (!slots) return { ok: true as const };

  for (const slot of slots) {
    if (!Number.isInteger(slot.weekday) || slot.weekday < 0 || slot.weekday > 6) {
      return { ok: false as const, error: "weekly_slots.weekday must be an integer between 0 and 6" };
    }

    const startMinutes = parseTimeToMinutes(slot.start_time);
    const endMinutes = parseTimeToMinutes(slot.end_time);
    if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
      return { ok: false as const, error: "weekly_slots must use HH:MM times and end_time > start_time" };
    }
  }

  return { ok: true as const };
};

const validateDateOverrides = (overrides: AvailabilityUpdatePayload["date_overrides"]) => {
  if (!overrides) return { ok: true as const };

  for (const entry of overrides) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.override_date)) {
      return { ok: false as const, error: "date_overrides.override_date must be YYYY-MM-DD" };
    }

    if (entry.is_available) {
      const startMinutes = parseTimeToMinutes(entry.start_time ?? null);
      const endMinutes = parseTimeToMinutes(entry.end_time ?? null);
      if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
        return { ok: false as const, error: "Available overrides require valid start_time/end_time with end_time > start_time" };
      }
    }
  }

  return { ok: true as const };
};

const ensureInstructorManageAccess = async (
  brandId: string,
  instructorId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> => {
  const sessionClient = createSupabaseServerClient();
  const adminClient = createSupabaseAdminClient();

  const { data: userData, error: userError } = await sessionClient.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const [worksForBrand, brandAdmin, instructorUser] = await Promise.all([
    instructorWorksForBrand(adminClient, instructorId, brandId),
    isBrandAdmin(adminClient, brandId, userData.user.id),
    isInstructorUser(adminClient, instructorId, userData.user.id),
  ]);

  if (!worksForBrand) {
    return { ok: false, status: 404, error: "Instructor is not linked to this brand" };
  }

  if (!brandAdmin && !instructorUser) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  return { ok: true };
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

  const instructorId = context.params.instructorId;

  try {
    const access = await ensureInstructorManageAccess(brandId, instructorId);
    if (!access.ok) {
      return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
    }

    const range = parseDateRange(requestUrl);
    const snapshot = await loadAvailabilitySnapshot(brandId, instructorId, range.from, range.to);

    return NextResponse.json({
      ok: true,
      brand_id: brandId,
      instructor_id: instructorId,
      ...snapshot,
      range,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load availability" },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: Request,
  context: { params: { instructorId: string } },
) {
  const instructorId = context.params.instructorId;
  let payload: AvailabilityUpdatePayload;

  try {
    payload = (await request.json()) as AvailabilityUpdatePayload;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const brandId = payload.brand_id?.trim();
  if (!brandId) {
    return NextResponse.json(
      { ok: false, error: "brand_id is required" },
      { status: 400 },
    );
  }

  const weeklyValidation = validateWeeklySlots(payload.weekly_slots);
  if (!weeklyValidation.ok) {
    return NextResponse.json({ ok: false, error: weeklyValidation.error }, { status: 400 });
  }

  const overridesValidation = validateDateOverrides(payload.date_overrides);
  if (!overridesValidation.ok) {
    return NextResponse.json({ ok: false, error: overridesValidation.error }, { status: 400 });
  }

  try {
    const access = await ensureInstructorManageAccess(brandId, instructorId);
    if (!access.ok) {
      return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
    }

    const adminClient = createSupabaseAdminClient();

    if (payload.settings) {
      const settingsResult = await upsertSchedulingSettings(
        adminClient,
        brandId,
        instructorId,
        payload.settings,
      );
      if (!settingsResult.ok) {
        return NextResponse.json({ ok: false, error: settingsResult.error }, { status: 400 });
      }
    }

    if (payload.weekly_slots) {
      const rulesResult = await replaceAvailabilityRules(
        adminClient,
        brandId,
        instructorId,
        payload.weekly_slots,
      );
      if (!rulesResult.ok) {
        return NextResponse.json({ ok: false, error: rulesResult.error }, { status: 400 });
      }
    }

    if (payload.date_overrides) {
      const overridesResult = await replaceAvailabilityOverrides(
        adminClient,
        brandId,
        instructorId,
        payload.date_overrides,
      );
      if (!overridesResult.ok) {
        return NextResponse.json({ ok: false, error: overridesResult.error }, { status: 400 });
      }
    }

    const range = parseDateRange(new URL(request.url));
    const snapshot = await loadAvailabilitySnapshot(brandId, instructorId, range.from, range.to);

    return NextResponse.json({
      ok: true,
      brand_id: brandId,
      instructor_id: instructorId,
      ...snapshot,
      range,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to update availability" },
      { status: 500 },
    );
  }
}
