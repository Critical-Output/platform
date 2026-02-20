import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canCancelBooking,
  getBookingStatusTransitionError,
  hasBufferedOverlap,
  isValidBookingStatusTransition,
  isValidIanaTimeZone,
  withinAdvanceBookingLimit,
} from "@/lib/bookings/utils";

test("booking status transition validation", () => {
  assert.equal(isValidBookingStatusTransition("pending", "confirmed"), true);
  assert.equal(isValidBookingStatusTransition("confirmed", "completed"), true);
  assert.equal(isValidBookingStatusTransition("confirmed", "confirmed"), false);
  assert.equal(isValidBookingStatusTransition("pending", "completed"), false);

  assert.equal(getBookingStatusTransitionError("pending", "cancelled"), null);
  assert.match(
    getBookingStatusTransitionError("completed", "confirmed") ?? "",
    /Invalid booking status transition/,
  );
});

test("buffer overlap detection", () => {
  const overlaps = hasBufferedOverlap(
    "2026-03-01T10:00:00.000Z",
    "2026-03-01T11:00:00.000Z",
    "2026-03-01T11:10:00.000Z",
    "2026-03-01T12:10:00.000Z",
    15,
  );

  const doesNotOverlap = hasBufferedOverlap(
    "2026-03-01T10:00:00.000Z",
    "2026-03-01T11:00:00.000Z",
    "2026-03-01T11:16:00.000Z",
    "2026-03-01T12:16:00.000Z",
    15,
  );

  assert.equal(overlaps, true);
  assert.equal(doesNotOverlap, false);
});

test("advance booking and cancellation cutoff", () => {
  const now = new Date("2026-02-20T00:00:00.000Z");

  assert.equal(withinAdvanceBookingLimit("2026-05-20T00:00:00.000Z", 90, now), true);
  assert.equal(withinAdvanceBookingLimit("2026-05-22T00:00:00.000Z", 90, now), false);

  assert.equal(canCancelBooking("2026-02-22T00:00:00.000Z", 24, now), true);
  assert.equal(canCancelBooking("2026-02-20T12:00:00.000Z", 24, now), false);
});

test("timezone validator checks IANA zone names", () => {
  assert.equal(isValidIanaTimeZone("America/New_York"), true);
  assert.equal(isValidIanaTimeZone("Not/AZone"), false);
});
