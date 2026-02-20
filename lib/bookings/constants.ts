export const DEFAULT_BUFFER_MINUTES = 15;
export const DEFAULT_ADVANCE_BOOKING_DAYS = 90;
export const DEFAULT_CANCELLATION_CUTOFF_HOURS = 24;
export const DEFAULT_SESSION_MINUTES = 60;

export const BOOKING_STATUSES = [
  "pending",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
] as const;

export const ACTIVE_BOOKING_STATUSES = ["pending", "confirmed"] as const;

export const BOOKING_PAYMENT_STATUSES = ["unpaid", "paid", "failed", "refunded"] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export type BookingPaymentStatus = (typeof BOOKING_PAYMENT_STATUSES)[number];
