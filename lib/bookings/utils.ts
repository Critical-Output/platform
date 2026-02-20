import {
  BOOKING_STATUSES,
  type BookingStatus,
  DEFAULT_ADVANCE_BOOKING_DAYS,
  DEFAULT_CANCELLATION_CUTOFF_HOURS,
} from "@/lib/bookings/constants";

const STATUS_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["completed", "cancelled", "no_show"],
  completed: [],
  cancelled: [],
  no_show: [],
};

export const isValidBookingStatus = (value: unknown): value is BookingStatus => {
  if (typeof value !== "string") return false;
  return (BOOKING_STATUSES as readonly string[]).includes(value);
};

export const isValidBookingStatusTransition = (
  from: BookingStatus,
  to: BookingStatus,
): boolean => {
  if (from === to) return false;
  return STATUS_TRANSITIONS[from].includes(to);
};

export const getBookingStatusTransitionError = (
  from: BookingStatus,
  to: BookingStatus,
): string | null => {
  if (isValidBookingStatusTransition(from, to)) return null;
  return `Invalid booking status transition: ${from} -> ${to}`;
};

export const isValidIanaTimeZone = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const tz = value.trim();
  if (!tz) return false;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
};

export const formatDateInTimeZone = (timestamp: Date | string, timeZone: string): string => {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(date);
};

export const hasBufferedOverlap = (
  candidateStartIso: string,
  candidateEndIso: string,
  existingStartIso: string,
  existingEndIso: string,
  bufferMinutes: number,
): boolean => {
  const candidateStart = new Date(candidateStartIso).getTime();
  const candidateEnd = new Date(candidateEndIso).getTime();
  const existingStart = new Date(existingStartIso).getTime();
  const existingEnd = new Date(existingEndIso).getTime();
  const bufferMs = Math.max(bufferMinutes, 0) * 60_000;

  if (!Number.isFinite(candidateStart) || !Number.isFinite(candidateEnd)) return true;
  if (!Number.isFinite(existingStart) || !Number.isFinite(existingEnd)) return true;

  const bufferedStart = existingStart - bufferMs;
  const bufferedEnd = existingEnd + bufferMs;

  return candidateStart < bufferedEnd && bufferedStart < candidateEnd;
};

export const withinAdvanceBookingLimit = (
  startAtIso: string,
  advanceDays = DEFAULT_ADVANCE_BOOKING_DAYS,
  now = new Date(),
): boolean => {
  const startAt = new Date(startAtIso).getTime();
  if (!Number.isFinite(startAt)) return false;

  const maxAllowed = now.getTime() + Math.max(advanceDays, 1) * 24 * 60 * 60 * 1000;
  return startAt <= maxAllowed;
};

export const canCancelBooking = (
  startAtIso: string,
  cutoffHours = DEFAULT_CANCELLATION_CUTOFF_HOURS,
  now = new Date(),
): boolean => {
  const startAt = new Date(startAtIso).getTime();
  if (!Number.isFinite(startAt)) return false;

  const cutoffMs = Math.max(cutoffHours, 0) * 60 * 60 * 1000;
  return startAt - now.getTime() >= cutoffMs;
};
