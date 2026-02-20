import assert from "node:assert/strict";
import { test } from "node:test";

import {
  hasInstructorBookingConflict,
  upsertSchedulingSettings,
} from "../lib/bookings/service";

test("upsertSchedulingSettings merges partial updates with persisted settings", async () => {
  const existingSettings = {
    timezone: "America/Chicago",
    session_duration_minutes: 50,
    buffer_minutes: 20,
    advance_booking_days: 120,
    cancellation_cutoff_hours: 30,
  };

  let upsertPayload: Record<string, unknown> | null = null;

  const supabase = {
    from: (table: string) => {
      assert.equal(table, "instructor_scheduling_settings");

      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        is() {
          return this;
        },
        maybeSingle: async () => ({ data: existingSettings, error: null }),
        upsert: async (payload: Record<string, unknown>) => {
          upsertPayload = payload;
          return { error: null };
        },
      };
    },
  } as any;

  const result = await upsertSchedulingSettings(supabase, "brand_1", "inst_1", {
    buffer_minutes: 35,
  });

  assert.equal(result.ok, true);
  assert.equal(result.settings?.timezone, "America/Chicago");
  assert.equal(result.settings?.session_duration_minutes, 50);
  assert.equal(result.settings?.buffer_minutes, 35);
  assert.equal(result.settings?.advance_booking_days, 120);
  assert.equal(result.settings?.cancellation_cutoff_hours, 30);

  assert.equal(upsertPayload?.timezone, "America/Chicago");
  assert.equal(upsertPayload?.session_duration_minutes, 50);
  assert.equal(upsertPayload?.buffer_minutes, 35);
  assert.equal(upsertPayload?.advance_booking_days, 120);
  assert.equal(upsertPayload?.cancellation_cutoff_hours, 30);
});

test("hasInstructorBookingConflict throws when database lookup fails", async () => {
  const supabase = {
    from: (table: string) => {
      assert.equal(table, "bookings");

      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        is() {
          return this;
        },
        in() {
          return this;
        },
        lt() {
          return this;
        },
        gt() {
          return this;
        },
        limit: async () => ({
          data: null,
          error: { message: "read failed" },
        }),
      };
    },
  } as any;

  await assert.rejects(
    () => hasInstructorBookingConflict(supabase, {
      brandId: "brand_1",
      instructorId: "inst_1",
      startAt: new Date("2026-03-10T10:00:00.000Z"),
      endAt: new Date("2026-03-10T11:00:00.000Z"),
      bufferMinutes: 15,
    }),
    /Unable to check instructor booking conflicts: read failed/,
  );
});
