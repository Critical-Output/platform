import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildStatusTimestampPatch,
  canTransitionBookingStatus,
  isCancellationAllowed,
  isSlotWithinAvailability,
  isWithinAdvanceBookingLimit,
} from "../lib/bookings/scheduling";

test("isSlotWithinAvailability honors recurring rules", () => {
  const startAt = new Date("2026-03-10T14:00:00.000Z"); // Tuesday, 10:00 AM America/New_York
  const endAt = new Date("2026-03-10T15:00:00.000Z");

  const available = isSlotWithinAvailability({
    startAt,
    endAt,
    instructorTimeZone: "America/New_York",
    weeklyRules: [
      { weekday: 2, start_time: "09:00", end_time: "17:00", is_active: true },
    ],
    overrides: [],
  });

  assert.equal(available, true);
});

test("isSlotWithinAvailability blocks when date override marks day unavailable", () => {
  const startAt = new Date("2026-03-10T14:00:00.000Z");
  const endAt = new Date("2026-03-10T15:00:00.000Z");

  const available = isSlotWithinAvailability({
    startAt,
    endAt,
    instructorTimeZone: "America/New_York",
    weeklyRules: [
      { weekday: 2, start_time: "09:00", end_time: "17:00", is_active: true },
    ],
    overrides: [
      { override_date: "2026-03-10", is_available: false, start_time: null, end_time: null },
    ],
  });

  assert.equal(available, false);
});

test("isWithinAdvanceBookingLimit enforces future and max day window", () => {
  const now = new Date("2026-02-20T00:00:00.000Z");

  assert.equal(
    isWithinAdvanceBookingLimit(new Date("2026-03-15T00:00:00.000Z"), now, 30),
    true,
  );

  assert.equal(
    isWithinAdvanceBookingLimit(new Date("2026-04-01T00:00:00.000Z"), now, 30),
    false,
  );

  assert.equal(
    isWithinAdvanceBookingLimit(new Date("2026-02-19T23:59:59.000Z"), now, 30),
    false,
  );
});

test("isCancellationAllowed enforces cutoff hours", () => {
  const now = new Date("2026-02-20T00:00:00.000Z");

  assert.equal(
    isCancellationAllowed(new Date("2026-02-21T02:00:00.000Z"), now, 24),
    true,
  );

  assert.equal(
    isCancellationAllowed(new Date("2026-02-20T10:00:00.000Z"), now, 24),
    false,
  );
});

test("canTransitionBookingStatus enforces lifecycle", () => {
  assert.equal(canTransitionBookingStatus("pending", "confirmed"), true);
  assert.equal(canTransitionBookingStatus("pending", "completed"), false);
  assert.equal(canTransitionBookingStatus("confirmed", "no_show"), true);
  assert.equal(canTransitionBookingStatus("completed", "cancelled"), false);
});

test("buildStatusTimestampPatch assigns status timestamp fields", () => {
  const nowIso = "2026-02-20T10:00:00.000Z";
  assert.deepEqual(buildStatusTimestampPatch("confirmed", nowIso), { confirmed_at: nowIso });
  assert.deepEqual(buildStatusTimestampPatch("cancelled", nowIso), { cancelled_at: nowIso });
});
