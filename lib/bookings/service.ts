import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

import {
  BOOKING_ACTIVE_STATUSES,
  type BookingStatus,
  coerceSchedulingSettings,
  defaultSchedulingSettings,
  type SchedulingSettings,
} from "./scheduling";
import type { NotificationResult } from "./notifications";

export type BookingRow = {
  id: string;
  brand_id: string;
  customer_id: string;
  instructor_id: string | null;
  status: BookingStatus;
  start_at: string;
  end_at: string;
  student_timezone: string | null;
  instructor_timezone: string | null;
  notes: string | null;
  instructor_notes: string | null;
  payment_status: string | null;
  reminder_24h_sent_at: string | null;
};

export type CustomerRow = {
  id: string;
  brand_id: string;
  auth_user_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
};

export type InstructorRow = {
  id: string;
  brand_id: string;
  auth_user_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

export type AvailabilityRuleRow = {
  weekday: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
};

export type AvailabilityOverrideRow = {
  override_date: string;
  is_available: boolean;
  start_time: string | null;
  end_time: string | null;
};

export type BookingPermission = {
  isBrandAdmin: boolean;
  isInstructor: boolean;
  isCustomer: boolean;
};

const activeBookingStatuses = [...BOOKING_ACTIVE_STATUSES];

const rowExists = async (
  supabase: SupabaseClient<Database>,
  table: string,
  filters: Record<string, string>,
): Promise<boolean> => {
  let query = supabase.from(table).select("id").limit(1);
  for (const [key, value] of Object.entries(filters)) {
    query = query.eq(key, value);
  }
  query = query.is("deleted_at", null);
  const { data, error } = await query.maybeSingle();
  if (error) return false;
  return Boolean(data);
};

export const isBrandAdmin = async (
  supabase: SupabaseClient<Database>,
  brandId: string,
  authUserId: string,
): Promise<boolean> => {
  const { data, error } = await supabase
    .from("brand_members")
    .select("id")
    .eq("brand_id", brandId)
    .eq("user_id", authUserId)
    .in("role", ["owner", "admin"])
    .is("deleted_at", null)
    .limit(1);

  if (error) return false;
  return Boolean(data && data.length > 0);
};

export const isInstructorUser = async (
  supabase: SupabaseClient<Database>,
  instructorId: string,
  authUserId: string,
): Promise<boolean> => {
  return rowExists(supabase, "instructors", {
    id: instructorId,
    auth_user_id: authUserId,
  });
};

export const isCustomerUser = async (
  supabase: SupabaseClient<Database>,
  brandId: string,
  customerId: string,
  authUserId: string,
): Promise<boolean> => {
  return rowExists(supabase, "customers", {
    id: customerId,
    auth_user_id: authUserId,
    brand_id: brandId,
  });
};

export const userHasBrandAccess = async (
  supabase: SupabaseClient<Database>,
  brandId: string,
  authUserId: string,
): Promise<boolean> => {
  const [admin, customer] = await Promise.all([
    isBrandAdmin(supabase, brandId, authUserId),
    rowExists(supabase, "customers", { brand_id: brandId, auth_user_id: authUserId }),
  ]);

  if (admin || customer) return true;

  const { data: instructorRows } = await supabase
    .from("instructors")
    .select("id,brand_id")
    .eq("auth_user_id", authUserId)
    .is("deleted_at", null);

  if (!instructorRows || instructorRows.length === 0) return false;

  const typedRows = instructorRows as Array<{ id: string; brand_id: string }>;
  if (typedRows.some((row) => row.brand_id === brandId)) return true;

  const instructorIds = typedRows.map((row) => row.id);
  const { data: mappedRows, error: mappedError } = await supabase
    .from("instructors_brands")
    .select("id")
    .eq("brand_id", brandId)
    .in("instructor_id", instructorIds)
    .is("deleted_at", null)
    .limit(1);

  if (mappedError) return false;
  return Boolean(mappedRows && mappedRows.length > 0);
};

export const ensureCustomerOwnership = async (
  supabase: SupabaseClient<Database>,
  brandId: string,
  customerId: string,
  authUserId: string,
): Promise<CustomerRow | null> => {
  const { data, error } = await supabase
    .from("customers")
    .select("id,brand_id,auth_user_id,first_name,last_name,email,phone")
    .eq("id", customerId)
    .eq("brand_id", brandId)
    .eq("auth_user_id", authUserId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as CustomerRow;
};

export const getInstructorForBrand = async (
  supabase: SupabaseClient<Database>,
  brandId: string,
  instructorId: string,
): Promise<InstructorRow | null> => {
  const { data, error } = await supabase
    .from("instructors")
    .select("id,brand_id,auth_user_id,first_name,last_name,email")
    .eq("id", instructorId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) return null;

  const worksForBrand = await instructorWorksForBrand(supabase, instructorId, brandId);
  if (!worksForBrand) return null;

  return data as unknown as InstructorRow;
};

export const instructorWorksForBrand = async (
  supabase: SupabaseClient<Database>,
  instructorId: string,
  brandId: string,
): Promise<boolean> => {
  const { data, error } = await supabase.rpc("instructor_works_for_brand", {
    p_instructor_id: instructorId,
    p_brand_id: brandId,
  });

  if (error) return false;
  return Boolean(data);
};

export const getSchedulingSettings = async (
  supabase: SupabaseClient<Database>,
  brandId: string,
  instructorId: string,
): Promise<SchedulingSettings> => {
  const { data, error } = await supabase
    .from("instructor_scheduling_settings")
    .select(
      "timezone,session_duration_minutes,buffer_minutes,advance_booking_days,cancellation_cutoff_hours",
    )
    .eq("brand_id", brandId)
    .eq("instructor_id", instructorId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) return defaultSchedulingSettings();

  return coerceSchedulingSettings(data as unknown as Partial<SchedulingSettings>);
};

export const getAvailabilityForDate = async (
  supabase: SupabaseClient<Database>,
  brandId: string,
  instructorId: string,
  dateIso: string,
): Promise<{ rules: AvailabilityRuleRow[]; overrides: AvailabilityOverrideRow[] }> => {
  const [{ data: rulesData, error: rulesError }, { data: overrideData, error: overrideError }] = await Promise.all([
    supabase
      .from("instructor_availability_rules")
      .select("weekday,start_time,end_time,is_active")
      .eq("brand_id", brandId)
      .eq("instructor_id", instructorId)
      .eq("is_active", true)
      .is("deleted_at", null),
    supabase
      .from("instructor_availability_overrides")
      .select("override_date,is_available,start_time,end_time")
      .eq("brand_id", brandId)
      .eq("instructor_id", instructorId)
      .eq("override_date", dateIso)
      .is("deleted_at", null),
  ]);

  return {
    rules: rulesError ? [] : ((rulesData ?? []) as unknown as AvailabilityRuleRow[]),
    overrides: overrideError ? [] : ((overrideData ?? []) as unknown as AvailabilityOverrideRow[]),
  };
};

export const hasInstructorBookingConflict = async (
  supabase: SupabaseClient<Database>,
  params: {
    brandId: string;
    instructorId: string;
    startAt: Date;
    endAt: Date;
    bufferMinutes: number;
    excludeBookingId?: string;
  },
): Promise<boolean> => {
  const bufferedStart = new Date(params.startAt.getTime() - (Math.max(0, params.bufferMinutes) * 60 * 1000));
  const bufferedEnd = new Date(params.endAt.getTime() + (Math.max(0, params.bufferMinutes) * 60 * 1000));

  let query = supabase
    .from("bookings")
    .select("id")
    .eq("brand_id", params.brandId)
    .eq("instructor_id", params.instructorId)
    .is("deleted_at", null)
    .in("status", activeBookingStatuses)
    .lt("start_at", bufferedEnd.toISOString())
    .gt("end_at", bufferedStart.toISOString())
    .limit(1);

  if (params.excludeBookingId) {
    query = query.neq("id", params.excludeBookingId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Unable to check instructor booking conflicts: ${error.message}`);
  }
  return Boolean(data && data.length > 0);
};

export const getBookingById = async (
  supabase: SupabaseClient<Database>,
  bookingId: string,
  brandId: string,
): Promise<BookingRow | null> => {
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id,brand_id,customer_id,instructor_id,status,start_at,end_at,student_timezone,instructor_timezone,notes,instructor_notes,payment_status,reminder_24h_sent_at",
    )
    .eq("id", bookingId)
    .eq("brand_id", brandId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as BookingRow;
};

export const getBookingPermissions = async (
  supabase: SupabaseClient<Database>,
  brandId: string,
  booking: BookingRow,
  authUserId: string,
): Promise<BookingPermission> => {
  const [brandAdmin, isCustomer, isInstructor] = await Promise.all([
    isBrandAdmin(supabase, brandId, authUserId),
    isCustomerUser(supabase, brandId, booking.customer_id, authUserId),
    booking.instructor_id
      ? isInstructorUser(supabase, booking.instructor_id, authUserId)
      : Promise.resolve(false),
  ]);

  return {
    isBrandAdmin: brandAdmin,
    isCustomer,
    isInstructor,
  };
};

export const listBrandInstructors = async (
  supabase: SupabaseClient<Database>,
  brandId: string,
): Promise<InstructorRow[]> => {
  const [{ data: directRows, error: directError }, { data: mappingRows, error: mappingError }] = await Promise.all([
    supabase
      .from("instructors")
      .select("id,brand_id,auth_user_id,first_name,last_name,email")
      .eq("brand_id", brandId)
      .is("deleted_at", null),
    supabase
      .from("instructors_brands")
      .select("instructor_id")
      .eq("brand_id", brandId)
      .is("deleted_at", null),
  ]);

  const direct = directError ? [] : ((directRows ?? []) as unknown as InstructorRow[]);
  const mappedIds = mappingError
    ? []
    : ((mappingRows ?? []) as Array<{ instructor_id?: string }>).map((row) => row.instructor_id).filter(Boolean) as string[];

  const existingIds = new Set(direct.map((row) => row.id));
  const missingMappedIds = mappedIds.filter((id) => !existingIds.has(id));

  if (missingMappedIds.length === 0) return direct;

  const { data: mappedRows, error: mappedError } = await supabase
    .from("instructors")
    .select("id,brand_id,auth_user_id,first_name,last_name,email")
    .in("id", missingMappedIds)
    .is("deleted_at", null);

  if (mappedError || !mappedRows) return direct;

  return direct.concat(mappedRows as unknown as InstructorRow[]);
};

export const upsertSchedulingSettings = async (
  supabase: SupabaseClient<Database>,
  brandId: string,
  instructorId: string,
  partial: Partial<SchedulingSettings>,
): Promise<{ ok: boolean; settings: SchedulingSettings | null; error?: string }> => {
  const existingSettings = await getSchedulingSettings(supabase, brandId, instructorId);
  const definedPartial = Object.fromEntries(
    Object.entries(partial).filter(([, value]) => value !== undefined),
  ) as Partial<SchedulingSettings>;
  const mergedSettings = coerceSchedulingSettings({
    ...existingSettings,
    ...definedPartial,
  });

  const payload = {
    brand_id: brandId,
    instructor_id: instructorId,
    timezone: mergedSettings.timezone,
    session_duration_minutes: mergedSettings.session_duration_minutes,
    buffer_minutes: mergedSettings.buffer_minutes,
    advance_booking_days: mergedSettings.advance_booking_days,
    cancellation_cutoff_hours: mergedSettings.cancellation_cutoff_hours,
  };

  const { error } = await supabase
    .from("instructor_scheduling_settings")
    .upsert(payload, { onConflict: "brand_id,instructor_id" });

  if (error) {
    return { ok: false, settings: null, error: error.message };
  }

  return {
    ok: true,
    settings: mergedSettings,
  };
};

export const replaceAvailabilityRules = async (
  supabase: SupabaseClient<Database>,
  brandId: string,
  instructorId: string,
  rules: Array<{ weekday: number; start_time: string; end_time: string }>,
): Promise<{ ok: boolean; error?: string }> => {
  const deletedAt = new Date().toISOString();

  const { error: clearError } = await supabase
    .from("instructor_availability_rules")
    .update({ deleted_at: deletedAt, is_active: false })
    .eq("brand_id", brandId)
    .eq("instructor_id", instructorId)
    .is("deleted_at", null);

  if (clearError) {
    return { ok: false, error: clearError.message };
  }

  if (rules.length === 0) {
    return { ok: true };
  }

  const inserts = rules.map((rule) => ({
    brand_id: brandId,
    instructor_id: instructorId,
    weekday: rule.weekday,
    start_time: rule.start_time,
    end_time: rule.end_time,
    is_active: true,
  }));

  const { error: insertError } = await supabase.from("instructor_availability_rules").insert(inserts);
  if (insertError) {
    return { ok: false, error: insertError.message };
  }

  return { ok: true };
};

export const replaceAvailabilityOverrides = async (
  supabase: SupabaseClient<Database>,
  brandId: string,
  instructorId: string,
  overrides: Array<{
    override_date: string;
    is_available: boolean;
    start_time?: string | null;
    end_time?: string | null;
    reason?: string | null;
  }>,
): Promise<{ ok: boolean; error?: string }> => {
  if (overrides.length === 0) return { ok: true };

  const dates = Array.from(new Set(overrides.map((entry) => entry.override_date)));

  const { error: clearError } = await supabase
    .from("instructor_availability_overrides")
    .update({ deleted_at: new Date().toISOString() })
    .eq("brand_id", brandId)
    .eq("instructor_id", instructorId)
    .in("override_date", dates)
    .is("deleted_at", null);

  if (clearError) {
    return { ok: false, error: clearError.message };
  }

  const inserts = overrides.map((entry) => ({
    brand_id: brandId,
    instructor_id: instructorId,
    override_date: entry.override_date,
    is_available: entry.is_available,
    start_time: entry.is_available ? entry.start_time ?? null : null,
    end_time: entry.is_available ? entry.end_time ?? null : null,
    reason: entry.reason ?? null,
  }));

  const { error: insertError } = await supabase.from("instructor_availability_overrides").insert(inserts);
  if (insertError) {
    return { ok: false, error: insertError.message };
  }

  return { ok: true };
};

export const listInstructorCalendarBookings = async (
  supabase: SupabaseClient<Database>,
  params: {
    brandId: string;
    instructorId: string;
    startAt: string;
    endAt: string;
  },
): Promise<Array<BookingRow & { customer?: Pick<CustomerRow, "first_name" | "last_name" | "email"> }>> => {
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id,brand_id,customer_id,instructor_id,status,start_at,end_at,student_timezone,instructor_timezone,notes,instructor_notes,payment_status,reminder_24h_sent_at",
    )
    .eq("brand_id", params.brandId)
    .eq("instructor_id", params.instructorId)
    .is("deleted_at", null)
    .gte("start_at", params.startAt)
    .lte("start_at", params.endAt)
    .order("start_at", { ascending: true });

  if (error || !data || data.length === 0) return [];

  const bookings = data as unknown as BookingRow[];
  const customerIds = Array.from(new Set(bookings.map((booking) => booking.customer_id)));

  const { data: customerRows } = await supabase
    .from("customers")
    .select("id,first_name,last_name,email")
    .in("id", customerIds)
    .is("deleted_at", null);

  const customerMap = new Map(
    ((customerRows ?? []) as Array<CustomerRow>).map((customer) => [
      customer.id,
      {
        first_name: customer.first_name,
        last_name: customer.last_name,
        email: customer.email,
      },
    ]),
  );

  return bookings.map((booking) => ({
    ...booking,
    customer: customerMap.get(booking.customer_id),
  }));
};

export const recordNotificationResult = async (
  supabase: SupabaseClient<Database>,
  params: {
    bookingId: string;
    brandId: string;
    template: "booking_created" | "booking_reminder_24h";
    recipient: string;
    result: NotificationResult;
  },
): Promise<void> => {
  await supabase.from("booking_notifications").insert({
    booking_id: params.bookingId,
    brand_id: params.brandId,
    template: params.template,
    channel: params.result.channel,
    provider: params.result.provider,
    recipient: params.recipient,
    status: params.result.status,
    provider_message_id: params.result.providerMessageId ?? null,
    error_message: params.result.error ?? null,
    sent_at: params.result.status === "sent" ? new Date().toISOString() : null,
    metadata: {},
  });
};
