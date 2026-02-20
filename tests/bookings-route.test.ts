import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { GET, POST } from "../app/api/bookings/route";

const testDependencyKey = "__PCC_BOOKINGS_ROUTE_DEPS__";

const createSessionClient = (authUserId: string | null) => {
  return {
    auth: {
      getUser: async () => ({
        data: { user: authUserId ? { id: authUserId } : null },
        error: null,
      }),
    },
  } as any;
};

afterEach(() => {
  delete (globalThis as Record<string, unknown>)[testDependencyKey];
});

test("GET /api/bookings returns 403 when user lacks brand access", async () => {
  (globalThis as Record<string, unknown>)[testDependencyKey] = {
    createSessionClient: () => createSessionClient("user_1"),
    createAdminClient: () => ({} as any),
    userHasBrandAccess: async () => false,
  };

  const response = await GET(new Request("http://localhost:3000/api/bookings?brand_id=brand_1"));
  assert.equal(response.status, 403);

  const json = (await response.json()) as { ok: boolean; error: string };
  assert.equal(json.ok, false);
  assert.equal(json.error, "Forbidden");
});

test("POST /api/bookings returns 500 when conflict check throws", async () => {
  const startAt = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000));
  startAt.setUTCHours(10, 0, 0, 0);

  (globalThis as Record<string, unknown>)[testDependencyKey] = {
    createSessionClient: () => createSessionClient("user_1"),
    createAdminClient: () => ({} as any),
    ensureCustomerOwnership: async () => ({
      id: "cust_1",
      brand_id: "brand_1",
      auth_user_id: "user_1",
      first_name: "Test",
      last_name: "Student",
      email: "student@example.com",
      phone: "+15555550123",
    }),
    getInstructorForBrand: async () => ({
      id: "inst_1",
      brand_id: "brand_1",
      auth_user_id: "inst_user",
      first_name: "Coach",
      last_name: "One",
      email: "coach@example.com",
    }),
    getSchedulingSettings: async () => ({
      timezone: "UTC",
      session_duration_minutes: 60,
      buffer_minutes: 15,
      advance_booking_days: 90,
      cancellation_cutoff_hours: 24,
    }),
    getAvailabilityForDate: async () => ({
      rules: [
        {
          weekday: startAt.getUTCDay(),
          start_time: "09:00",
          end_time: "17:00",
          is_active: true,
        },
      ],
      overrides: [],
    }),
    hasInstructorBookingConflict: async () => {
      throw new Error("conflict check failed");
    },
  };

  const request = new Request("http://localhost:3000/api/bookings", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      brand_id: "brand_1",
      customer_id: "cust_1",
      instructor_id: "inst_1",
      start_at: startAt.toISOString(),
    }),
  });

  const response = await POST(request);
  assert.equal(response.status, 500);

  const json = (await response.json()) as { ok: boolean; error: string };
  assert.equal(json.ok, false);
  assert.match(json.error, /conflict check failed/);
});
