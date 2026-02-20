export const DEFAULT_SESSION_DURATION_MINUTES = 60;
export const DEFAULT_BUFFER_MINUTES = 15;
export const DEFAULT_ADVANCE_BOOKING_DAYS = 90;
export const DEFAULT_CANCELLATION_CUTOFF_HOURS = 24;
export const DEFAULT_TIMEZONE = "UTC";

export const BOOKING_ACTIVE_STATUSES = ["pending", "confirmed"] as const;

export const BOOKING_STATUSES = [
  "pending",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export type SchedulingSettings = {
  timezone: string;
  session_duration_minutes: number;
  buffer_minutes: number;
  advance_booking_days: number;
  cancellation_cutoff_hours: number;
};

export type AvailabilityRule = {
  weekday: number;
  start_time: string;
  end_time: string;
  is_active?: boolean | null;
};

export type AvailabilityOverride = {
  override_date: string;
  is_available: boolean;
  start_time: string | null;
  end_time: string | null;
};

export const defaultSchedulingSettings = (): SchedulingSettings => ({
  timezone: DEFAULT_TIMEZONE,
  session_duration_minutes: DEFAULT_SESSION_DURATION_MINUTES,
  buffer_minutes: DEFAULT_BUFFER_MINUTES,
  advance_booking_days: DEFAULT_ADVANCE_BOOKING_DAYS,
  cancellation_cutoff_hours: DEFAULT_CANCELLATION_CUTOFF_HOURS,
});

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const asFiniteNumber = (value: unknown, fallback: number): number => {
  if (typeof value !== "number") return fallback;
  if (!Number.isFinite(value)) return fallback;
  return value;
};

export const isValidTimeZone = (value: string): boolean => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
};

export const normalizeTimeZone = (value: string | null | undefined, fallback = DEFAULT_TIMEZONE): string => {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return isValidTimeZone(trimmed) ? trimmed : fallback;
};

export const coerceSchedulingSettings = (value: Partial<SchedulingSettings> | null | undefined): SchedulingSettings => {
  const defaults = defaultSchedulingSettings();
  return {
    timezone: normalizeTimeZone(value?.timezone, defaults.timezone),
    session_duration_minutes: Math.max(15, Math.floor(asFiniteNumber(value?.session_duration_minutes, defaults.session_duration_minutes))),
    buffer_minutes: Math.max(0, Math.floor(asFiniteNumber(value?.buffer_minutes, defaults.buffer_minutes))),
    advance_booking_days: Math.max(1, Math.floor(asFiniteNumber(value?.advance_booking_days, defaults.advance_booking_days))),
    cancellation_cutoff_hours: Math.max(0, Math.floor(asFiniteNumber(value?.cancellation_cutoff_hours, defaults.cancellation_cutoff_hours))),
  };
};

export const parseTimeToMinutes = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const match = value.trim().match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;

  const hours = Number.parseInt(match[1] ?? "", 10);
  const minutes = Number.parseInt(match[2] ?? "", 10);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  return (hours * 60) + minutes;
};

type ZonedDateParts = {
  dateIso: string;
  weekday: number;
  minutesOfDay: number;
};

const getZonedDateParts = (date: Date, timeZone: string): ZonedDateParts => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(date);
  const map = new Map(parts.map((part) => [part.type, part.value]));

  const year = map.get("year") ?? "1970";
  const month = map.get("month") ?? "01";
  const day = map.get("day") ?? "01";
  const weekdayLabel = map.get("weekday") ?? "Sun";
  const hour = Number.parseInt(map.get("hour") ?? "0", 10);
  const minute = Number.parseInt(map.get("minute") ?? "0", 10);

  const weekday = WEEKDAY_MAP[weekdayLabel] ?? 0;

  return {
    dateIso: `${year}-${month}-${day}`,
    weekday,
    minutesOfDay: (hour * 60) + minute,
  };
};

const slotFitsWindow = (
  startMinutes: number,
  endMinutes: number,
  windowStart: string | null | undefined,
  windowEnd: string | null | undefined,
): boolean => {
  const start = parseTimeToMinutes(windowStart);
  const end = parseTimeToMinutes(windowEnd);
  if (start === null || end === null) return false;
  return startMinutes >= start && endMinutes <= end;
};

export const isSlotWithinAvailability = (params: {
  startAt: Date;
  endAt: Date;
  instructorTimeZone: string;
  weeklyRules: AvailabilityRule[];
  overrides: AvailabilityOverride[];
}): boolean => {
  const zone = normalizeTimeZone(params.instructorTimeZone);
  const startParts = getZonedDateParts(params.startAt, zone);
  const endParts = getZonedDateParts(params.endAt, zone);

  // Sessions crossing a local date boundary are out of scope for v1 scheduling.
  if (startParts.dateIso !== endParts.dateIso) return false;

  const dayOverrides = params.overrides.filter((entry) => entry.override_date === startParts.dateIso);

  if (dayOverrides.length > 0) {
    const availabilityWindows = dayOverrides.filter((entry) => entry.is_available);
    if (availabilityWindows.length === 0) return false;

    return availabilityWindows.some((entry) =>
      slotFitsWindow(startParts.minutesOfDay, endParts.minutesOfDay, entry.start_time, entry.end_time),
    );
  }

  const dayRules = params.weeklyRules.filter(
    (rule) => rule.weekday === startParts.weekday && (rule.is_active ?? true),
  );

  return dayRules.some((rule) =>
    slotFitsWindow(startParts.minutesOfDay, endParts.minutesOfDay, rule.start_time, rule.end_time),
  );
};

export const isWithinAdvanceBookingLimit = (
  startAt: Date,
  now: Date,
  advanceBookingDays: number,
): boolean => {
  if (startAt.getTime() <= now.getTime()) return false;

  const latestAllowedStart = new Date(now);
  latestAllowedStart.setUTCDate(latestAllowedStart.getUTCDate() + Math.max(1, Math.floor(advanceBookingDays)));

  return startAt.getTime() <= latestAllowedStart.getTime();
};

export const isCancellationAllowed = (
  startAt: Date,
  now: Date,
  cancellationCutoffHours: number,
): boolean => {
  const cutoffMs = Math.max(0, cancellationCutoffHours) * 60 * 60 * 1000;
  return (startAt.getTime() - now.getTime()) >= cutoffMs;
};

const TRANSITIONS: Record<BookingStatus, Set<BookingStatus>> = {
  pending: new Set<BookingStatus>(["confirmed", "cancelled"]),
  confirmed: new Set<BookingStatus>(["completed", "cancelled", "no_show"]),
  completed: new Set<BookingStatus>(),
  cancelled: new Set<BookingStatus>(),
  no_show: new Set<BookingStatus>(),
};

export const canTransitionBookingStatus = (from: BookingStatus, to: BookingStatus): boolean => {
  if (from === to) return true;
  return TRANSITIONS[from].has(to);
};

export const buildStatusTimestampPatch = (status: BookingStatus, nowIso: string): Record<string, string | null> => {
  switch (status) {
    case "confirmed":
      return { confirmed_at: nowIso };
    case "completed":
      return { completed_at: nowIso };
    case "cancelled":
      return { cancelled_at: nowIso };
    case "no_show":
      return { no_show_at: nowIso };
    default:
      return {};
  }
};

export const formatDateTimeForZone = (date: Date, timeZone: string): string => {
  const zone = normalizeTimeZone(timeZone);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};
