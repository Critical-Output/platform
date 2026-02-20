import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createBookingAvailabilityGetHandler,
  createBookingAvailabilityPutHandler,
  createBookingInstructorsGetHandler,
  createBookingPatchHandler,
  createBookingRemindersPostHandler,
  createBookingsPostHandler,
} from "../lib/bookings/route-handlers";

type QueryResult = {
  data: unknown;
  error: { message: string; code?: string } | null;
};

const createQueryBuilder = (
  result: QueryResult,
  hooks?: {
    onInsert?: (payload: unknown) => void;
    onUpdate?: (payload: unknown) => void;
  },
) => {
  const chain: {
    select: (...args: unknown[]) => typeof chain;
    eq: (...args: unknown[]) => typeof chain;
    is: (...args: unknown[]) => typeof chain;
    in: (...args: unknown[]) => typeof chain;
    order: (...args: unknown[]) => typeof chain;
    lt: (...args: unknown[]) => typeof chain;
    gt: (...args: unknown[]) => Promise<QueryResult>;
    maybeSingle: () => Promise<QueryResult>;
    single: () => Promise<QueryResult>;
    insert: (payload: unknown) => typeof chain;
    update: (payload: unknown) => typeof chain;
    then: PromiseLike<QueryResult>["then"];
  } = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    in: () => chain,
    order: () => chain,
    lt: () => chain,
    gt: async () => result,
    maybeSingle: async () => result,
    single: async () => result,
    insert: (payload: unknown) => {
      hooks?.onInsert?.(payload);
      return chain;
    },
    update: (payload: unknown) => {
      hooks?.onUpdate?.(payload);
      return chain;
    },
    then: (onfulfilled, onrejected) => Promise.resolve(result).then(onfulfilled, onrejected),
  };

  return chain;
};

const createReminderBookingsQueryBuilder = (result: QueryResult) => {
  const chain: {
    select: (...args: unknown[]) => typeof chain;
    eq: (...args: unknown[]) => typeof chain;
    is: (...args: unknown[]) => typeof chain;
    gte: (...args: unknown[]) => typeof chain;
    lte: (...args: unknown[]) => Promise<QueryResult>;
  } = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    gte: () => chain,
    lte: async () => result,
  };

  return chain;
};

type ReminderBookingState = {
  id: string;
  brand_id: string;
  customer_id: string;
  instructor_id: string | null;
  start_at: string;
  student_timezone: string | null;
  status: string;
  reminder_sent_at: string | null;
  deleted_at: string | null;
};

const createInQueryBuilder = (result: QueryResult) => {
  const chain: {
    select: (...args: unknown[]) => typeof chain;
    in: (...args: unknown[]) => Promise<QueryResult>;
  } = {
    select: () => chain,
    in: async () => result,
  };

  return chain;
};

const createStatefulReminderAdmin = (
  bookingState: ReminderBookingState,
  options?: { listAlwaysReturnsBooking?: boolean },
) => {
  const state = bookingState;
  const listAlwaysReturnsBooking = options?.listAlwaysReturnsBooking ?? false;

  const admin = {
    from: (table: string) => {
      if (table === "bookings") {
        let updatePayload: { reminder_sent_at?: string | null } | null = null;
        let statusEq: string | null = null;
        let idEq: string | null = null;
        let brandIdEq: string | null = null;
        let reminderEq: string | null = null;
        let deletedAtMustBeNull = false;
        let reminderMustBeNull = false;
        let startAtGte: string | null = null;
        let startAtLte: string | null = null;

        const matchesBaseFilters = () => {
          if (statusEq && state.status !== statusEq) return false;
          if (idEq && state.id !== idEq) return false;
          if (brandIdEq && state.brand_id !== brandIdEq) return false;
          if (deletedAtMustBeNull && state.deleted_at !== null) return false;
          return true;
        };

        const matchesReminderFilter = () => {
          if (reminderMustBeNull && state.reminder_sent_at !== null) return false;
          if (reminderEq !== null && state.reminder_sent_at !== reminderEq) return false;
          return true;
        };

        const listResult = (): QueryResult => {
          const passesWindow =
            (!startAtGte || state.start_at >= startAtGte) && (!startAtLte || state.start_at <= startAtLte);

          if (!passesWindow || !matchesBaseFilters()) {
            return { data: [], error: null };
          }

          if (!listAlwaysReturnsBooking && !matchesReminderFilter()) {
            return { data: [], error: null };
          }

          return {
            data: [
              {
                id: state.id,
                brand_id: state.brand_id,
                customer_id: state.customer_id,
                instructor_id: state.instructor_id,
                start_at: state.start_at,
                student_timezone: state.student_timezone,
              },
            ],
            error: null,
          };
        };

        const maybeSingleResult = (): QueryResult => {
          if (!updatePayload) {
            return { data: null, error: null };
          }

          if (!matchesBaseFilters() || !matchesReminderFilter()) {
            return { data: null, error: null };
          }

          if (!Object.prototype.hasOwnProperty.call(updatePayload, "reminder_sent_at")) {
            return { data: null, error: null };
          }

          state.reminder_sent_at = updatePayload.reminder_sent_at ?? null;

          return {
            data: {
              id: state.id,
            },
            error: null,
          };
        };

        const chain: {
          select: (...args: unknown[]) => typeof chain;
          update: (payload: unknown) => typeof chain;
          eq: (column: string, value: unknown) => typeof chain;
          is: (column: string, value: unknown) => typeof chain;
          gte: (column: string, value: unknown) => typeof chain;
          lte: (column: string, value: unknown) => Promise<QueryResult>;
          maybeSingle: () => Promise<QueryResult>;
        } = {
          select: () => chain,
          update: (payload: unknown) => {
            updatePayload = payload as { reminder_sent_at?: string | null };
            return chain;
          },
          eq: (column: string, value: unknown) => {
            if (column === "status" && typeof value === "string") statusEq = value;
            if (column === "id" && typeof value === "string") idEq = value;
            if (column === "brand_id" && typeof value === "string") brandIdEq = value;
            if (column === "reminder_sent_at" && typeof value === "string") reminderEq = value;
            return chain;
          },
          is: (column: string, value: unknown) => {
            if (column === "deleted_at" && value === null) deletedAtMustBeNull = true;
            if (column === "reminder_sent_at" && value === null) reminderMustBeNull = true;
            return chain;
          },
          gte: (column: string, value: unknown) => {
            if (column === "start_at" && typeof value === "string") startAtGte = value;
            return chain;
          },
          lte: async (column: string, value: unknown) => {
            if (column === "start_at" && typeof value === "string") startAtLte = value;
            return listResult();
          },
          maybeSingle: async () => maybeSingleResult(),
        };

        return chain;
      }

      if (table === "brands") {
        return createInQueryBuilder({
          data: [{ id: state.brand_id, name: "CTI" }],
          error: null,
        });
      }

      if (table === "customers") {
        return createInQueryBuilder({
          data: [
            {
              id: state.customer_id,
              first_name: "Student",
              last_name: "One",
              phone: "+15550000001",
            },
          ],
          error: null,
        });
      }

      if (table === "instructors") {
        if (!state.instructor_id) {
          return createInQueryBuilder({ data: [], error: null });
        }

        return createInQueryBuilder({
          data: [{ id: state.instructor_id, first_name: "Alex", last_name: "Coach" }],
          error: null,
        });
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return { admin, state };
};

test("POST /api/bookings rejects a slot outside instructor availability windows", async () => {
  const now = Date.now();
  const startAt = new Date(now + 24 * 60 * 60 * 1000).toISOString();
  const endAt = new Date(now + 25 * 60 * 60 * 1000).toISOString();

  let bookingsTouched = false;
  let adminRpcCalls = 0;
  let userRpcCalls = 0;

  const admin = {
    from: (table: string) => {
      if (table === "instructors") {
        return createQueryBuilder({
          data: {
            id: "inst_1",
            brand_id: "brand_1",
            first_name: "Alex",
            last_name: "Coach",
            email: "alex@example.com",
          },
          error: null,
        });
      }

      if (table === "instructor_scheduling_settings") {
        return createQueryBuilder({
          data: {
            timezone: "UTC",
            buffer_minutes: 15,
            advance_booking_days: 90,
          },
          error: null,
        });
      }

      if (table === "bookings") {
        bookingsTouched = true;
        return createQueryBuilder({ data: [], error: null });
      }

      throw new Error(`Unexpected table: ${table}`);
    },
    rpc: async () => {
      adminRpcCalls += 1;
      throw new Error("Availability RPC must use user-authenticated client");
    },
  };
  const userClient = {
    rpc: async (name: string) => {
      userRpcCalls += 1;
      assert.equal(name, "get_instructor_available_slots");
      return {
        data: [
          {
            start_at: new Date(now + 24 * 60 * 60 * 1000 + 15 * 60 * 1000).toISOString(),
            end_at: new Date(now + 25 * 60 * 60 * 1000 + 15 * 60 * 1000).toISOString(),
          },
        ],
        error: null,
      };
    },
  };

  const handler = createBookingsPostHandler({
    resolveContext: async () => ({
      context: {
        admin: admin as never,
        userClient: userClient as never,
        brand: { id: "brand_1", slug: "cti", name: "CTI" },
        actor: {
          user: { id: "user_1", email: "student@example.com" },
          customer: {
            id: "cust_1",
            email: "student@example.com",
            phone: "+15550000001",
            first_name: "Student",
            last_name: "One",
          },
          isBrandAdmin: false,
          instructorIds: [],
        },
      },
    }),
    sendCreationNotifications: async () => ({
      emailSent: false,
      smsSent: false,
      warnings: [],
    }),
  });

  const response = await handler(
    new Request("http://localhost:3000/api/bookings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        instructorId: "inst_1",
        startAt,
        endAt,
        studentTimezone: "UTC",
      }),
    }),
  );

  assert.equal(response.status, 409);
  const body = (await response.json()) as { ok: boolean; error: string };
  assert.equal(body.ok, false);
  assert.match(body.error, /outside instructor availability/i);
  assert.equal(bookingsTouched, false);
  assert.equal(adminRpcCalls, 0);
  assert.equal(userRpcCalls, 1);
});

test("POST /api/bookings uses user-authenticated availability RPC context", async () => {
  const now = Date.now();
  const startAt = new Date(now + 48 * 60 * 60 * 1000).toISOString();
  const endAt = new Date(now + 49 * 60 * 60 * 1000).toISOString();

  let bookingsQueryCount = 0;
  let bookingRpcPayload: unknown = null;
  let adminRpcCalls = 0;
  let userRpcCalls = 0;

  const admin = {
    from: (table: string) => {
      if (table === "instructors") {
        return createQueryBuilder({
          data: {
            id: "inst_1",
            brand_id: "brand_1",
            first_name: "Alex",
            last_name: "Coach",
            email: "alex@example.com",
          },
          error: null,
        });
      }

      if (table === "instructor_scheduling_settings") {
        return createQueryBuilder({
          data: {
            timezone: "UTC",
            buffer_minutes: 15,
            advance_booking_days: 90,
          },
          error: null,
        });
      }

      if (table === "bookings") {
        bookingsQueryCount += 1;
        return createQueryBuilder({ data: [], error: null });
      }

      throw new Error(`Unexpected table: ${table}`);
    },
    rpc: async (name: string, payload: unknown) => {
      adminRpcCalls += 1;
      assert.equal(name, "create_pending_booking_atomic");
      bookingRpcPayload = payload;
      return {
        data: [
          {
            id: "booking_created",
            status: "pending",
            payment_status: "unpaid",
            start_at: startAt,
            end_at: endAt,
            instructor_id: "inst_1",
            customer_id: "cust_1",
            course_id: null,
            location: null,
            notes: null,
            student_timezone: "UTC",
            instructor_timezone: "UTC",
            created_at: new Date(now).toISOString(),
          },
        ],
        error: null,
      };
    },
  };

  const userClient = {
    rpc: async (name: string) => {
      userRpcCalls += 1;
      assert.equal(name, "get_instructor_available_slots");
      return {
        data: [
          {
            start_at: startAt,
            end_at: endAt,
          },
        ],
        error: null,
      };
    },
  };

  const handler = createBookingsPostHandler({
    resolveContext: async () => ({
      context: {
        admin: admin as never,
        userClient: userClient as never,
        brand: { id: "brand_1", slug: "cti", name: "CTI" },
        actor: {
          user: { id: "user_1", email: "student@example.com" },
          customer: {
            id: "cust_1",
            email: "student@example.com",
            phone: "+15550000001",
            first_name: "Student",
            last_name: "One",
          },
          isBrandAdmin: false,
          instructorIds: [],
        },
      },
    }),
    sendCreationNotifications: async () => ({
      emailSent: false,
      smsSent: false,
      warnings: [],
    }),
  });

  const response = await handler(
    new Request("http://localhost:3000/api/bookings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        instructorId: "inst_1",
        startAt,
        endAt,
        studentTimezone: "UTC",
      }),
    }),
  );

  assert.equal(response.status, 200);
  const body = (await response.json()) as { ok: boolean; booking?: { id?: string } };
  assert.equal(body.ok, true);
  assert.equal(body.booking?.id, "booking_created");
  assert.deepEqual(bookingRpcPayload, {
    p_brand_id: "brand_1",
    p_customer_id: "cust_1",
    p_instructor_id: "inst_1",
    p_course_id: null,
    p_start_at: startAt,
    p_end_at: endAt,
    p_buffer_minutes: 15,
    p_location: null,
    p_notes: null,
    p_student_timezone: "UTC",
    p_instructor_timezone: "UTC",
  });
  assert.equal(bookingsQueryCount, 1);
  assert.equal(adminRpcCalls, 1);
  assert.equal(userRpcCalls, 1);
});

test("POST /api/bookings rejects malformed ISO timestamps", async () => {
  let settingsLookupCalls = 0;
  let availabilityRpcCalls = 0;
  let bookingCreateRpcCalls = 0;

  const admin = {
    from: (table: string) => {
      if (table === "instructors") {
        return createQueryBuilder({
          data: {
            id: "inst_1",
            brand_id: "brand_1",
            first_name: "Alex",
            last_name: "Coach",
            email: "alex@example.com",
          },
          error: null,
        });
      }

      if (table === "instructor_scheduling_settings") {
        settingsLookupCalls += 1;
        return createQueryBuilder({
          data: {
            timezone: "UTC",
            buffer_minutes: 15,
            advance_booking_days: 90,
          },
          error: null,
        });
      }

      if (table === "bookings") {
        throw new Error("bookings lookup should not run when timestamps are malformed");
      }

      throw new Error(`Unexpected table: ${table}`);
    },
    rpc: async (name: string) => {
      bookingCreateRpcCalls += 1;
      throw new Error(`Unexpected RPC call: ${name}`);
    },
  };

  const userClient = {
    rpc: async () => {
      availabilityRpcCalls += 1;
      throw new Error("availability RPC should not run when timestamps are malformed");
    },
  };

  const handler = createBookingsPostHandler({
    resolveContext: async () => ({
      context: {
        admin: admin as never,
        userClient: userClient as never,
        brand: { id: "brand_1", slug: "cti", name: "CTI" },
        actor: {
          user: { id: "user_1", email: "student@example.com" },
          customer: {
            id: "cust_1",
            email: "student@example.com",
            phone: "+15550000001",
            first_name: "Student",
            last_name: "One",
          },
          isBrandAdmin: false,
          instructorIds: [],
        },
      },
    }),
    sendCreationNotifications: async () => ({
      emailSent: false,
      smsSent: false,
      warnings: [],
    }),
  });

  const malformedPayloads = [
    {
      startAt: "2026-02-31T10:00:00.000Z",
      endAt: "2026-03-01T11:00:00.000Z",
    },
    {
      startAt: "2026-03-01T10:00:00",
      endAt: "2026-03-01T11:00:00Z",
    },
  ];

  for (const malformed of malformedPayloads) {
    const response = await handler(
      new Request("http://localhost:3000/api/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          instructorId: "inst_1",
          studentTimezone: "UTC",
          ...malformed,
        }),
      }),
    );

    assert.equal(response.status, 400);
    const body = (await response.json()) as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.match(body.error, /startAt\/endAt must be valid ISO timestamps/i);
  }

  assert.equal(settingsLookupCalls, 0);
  assert.equal(availabilityRpcCalls, 0);
  assert.equal(bookingCreateRpcCalls, 0);
});

test("POST /api/bookings prevents double booking when atomic create RPC reports a race conflict", async () => {
  const now = Date.now();
  const startAt = new Date(now + 72 * 60 * 60 * 1000).toISOString();
  const endAt = new Date(now + 73 * 60 * 60 * 1000).toISOString();

  let createCallCount = 0;
  let notificationsCallCount = 0;

  const admin = {
    from: (table: string) => {
      if (table === "instructors") {
        return createQueryBuilder({
          data: {
            id: "inst_1",
            brand_id: "brand_1",
            first_name: "Alex",
            last_name: "Coach",
            email: "alex@example.com",
          },
          error: null,
        });
      }

      if (table === "instructor_scheduling_settings") {
        return createQueryBuilder({
          data: {
            timezone: "UTC",
            buffer_minutes: 15,
            advance_booking_days: 90,
          },
          error: null,
        });
      }

      if (table === "bookings") {
        return createQueryBuilder({ data: [], error: null });
      }

      throw new Error(`Unexpected table: ${table}`);
    },
    rpc: async (name: string) => {
      assert.equal(name, "create_pending_booking_atomic");
      createCallCount += 1;

      if (createCallCount === 1) {
        return {
          data: [
            {
              id: "booking_wins_race",
              status: "pending",
              payment_status: "unpaid",
              start_at: startAt,
              end_at: endAt,
              instructor_id: "inst_1",
              customer_id: "cust_1",
              course_id: null,
              location: null,
              notes: null,
              student_timezone: "UTC",
              instructor_timezone: "UTC",
              created_at: new Date(now).toISOString(),
            },
          ],
          error: null,
        };
      }

      return {
        data: null,
        error: {
          message: "Selected slot is unavailable due to an existing booking/buffer window",
          code: "23P01",
        },
      };
    },
  };

  const userClient = {
    rpc: async (name: string) => {
      assert.equal(name, "get_instructor_available_slots");
      return {
        data: [
          {
            start_at: startAt,
            end_at: endAt,
          },
        ],
        error: null,
      };
    },
  };

  const handler = createBookingsPostHandler({
    resolveContext: async () => ({
      context: {
        admin: admin as never,
        userClient: userClient as never,
        brand: { id: "brand_1", slug: "cti", name: "CTI" },
        actor: {
          user: { id: "user_1", email: "student@example.com" },
          customer: {
            id: "cust_1",
            email: "student@example.com",
            phone: "+15550000001",
            first_name: "Student",
            last_name: "One",
          },
          isBrandAdmin: false,
          instructorIds: [],
        },
      },
    }),
    sendCreationNotifications: async () => {
      notificationsCallCount += 1;
      return {
        emailSent: false,
        smsSent: false,
        warnings: [],
      };
    },
  });

  const makeRequest = () =>
    new Request("http://localhost:3000/api/bookings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        instructorId: "inst_1",
        startAt,
        endAt,
        studentTimezone: "UTC",
      }),
    });

  const [firstResponse, secondResponse] = await Promise.all([handler(makeRequest()), handler(makeRequest())]);
  const statuses = [firstResponse.status, secondResponse.status].sort((a, b) => a - b);

  assert.deepEqual(statuses, [200, 409]);
  assert.equal(createCallCount, 2);
  assert.equal(notificationsCallCount, 1);
});

test("GET /api/bookings/instructors includes home-brand instructors without linked rows", async () => {
  let instructorsQueryCalls = 0;

  const handler = createBookingInstructorsGetHandler({
    resolveContext: async () => ({
      context: {
        admin: {
          from: (table: string) => {
            if (table === "instructors_brands") {
              return createQueryBuilder({ data: [], error: null });
            }

            if (table === "instructors") {
              instructorsQueryCalls += 1;
              return createQueryBuilder({
                data: [
                  {
                    id: "inst_home",
                    first_name: "Home",
                    last_name: "Instructor",
                    email: "home@example.com",
                    bio: "Brand instructor",
                  },
                ],
                error: null,
              });
            }

            if (table === "instructor_scheduling_settings") {
              return createQueryBuilder({
                data: [],
                error: null,
              });
            }

            throw new Error(`Unexpected table: ${table}`);
          },
        } as never,
        userClient: { rpc: async () => ({ data: [], error: null }) } as never,
        brand: { id: "brand_1", slug: "cti", name: "CTI" },
        actor: {
          user: { id: "user_1", email: "student@example.com" },
          customer: {
            id: "cust_1",
            email: "student@example.com",
            phone: "+15550000001",
            first_name: "Student",
            last_name: "One",
          },
          isBrandAdmin: false,
          instructorIds: [],
        },
      },
    }),
  });

  const response = await handler(new Request("http://localhost:3000/api/bookings/instructors"));

  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    ok: boolean;
    instructors: Array<{
      id: string;
      settings: {
        timezone: string;
        bufferMinutes: number;
        advanceBookingDays: number;
        cancellationCutoffHours: number;
      };
    }>;
  };
  assert.equal(body.ok, true);
  assert.equal(body.instructors.length, 1);
  assert.equal(body.instructors[0]?.id, "inst_home");
  assert.equal(body.instructors[0]?.settings.timezone, "UTC");
  assert.equal(instructorsQueryCalls, 1);
});

test("GET /api/bookings/availability uses user-authenticated availability RPC context", async () => {
  let adminRpcCalls = 0;
  let userRpcCalls = 0;

  const admin = {
    from: (table: string) => {
      if (table !== "instructor_scheduling_settings") {
        throw new Error(`Unexpected table: ${table}`);
      }

      return createQueryBuilder({
        data: {
          timezone: "UTC",
          buffer_minutes: 15,
          advance_booking_days: 90,
          cancellation_cutoff_hours: 24,
        },
        error: null,
      });
    },
    rpc: async () => {
      adminRpcCalls += 1;
      return { data: [], error: null };
    },
  };

  const userClient = {
    rpc: async (name: string) => {
      userRpcCalls += 1;
      assert.equal(name, "get_instructor_available_slots");
      return {
        data: [
          {
            start_at: "2026-03-01T15:00:00.000Z",
            end_at: "2026-03-01T16:00:00.000Z",
          },
        ],
        error: null,
      };
    },
  };

  const handler = createBookingAvailabilityGetHandler({
    resolveContext: async () => ({
      context: {
        admin: admin as never,
        userClient: userClient as never,
        brand: { id: "brand_1", slug: "cti", name: "CTI" },
        actor: {
          user: { id: "user_1", email: "student@example.com" },
          customer: {
            id: "cust_1",
            email: "student@example.com",
            phone: "+15550000001",
            first_name: "Student",
            last_name: "One",
          },
          isBrandAdmin: false,
          instructorIds: [],
        },
      },
    }),
  });

  const response = await handler(
    new Request("http://localhost:3000/api/bookings/availability?instructorId=inst_1&studentTimezone=UTC"),
  );

  assert.equal(response.status, 200);
  const body = (await response.json()) as { ok: boolean; slots?: Array<{ startAt: string }> };
  assert.equal(body.ok, true);
  assert.equal(body.slots?.[0]?.startAt, "2026-03-01T15:00:00.000Z");
  assert.equal(adminRpcCalls, 0);
  assert.equal(userRpcCalls, 1);
});

test("GET /api/bookings/availability rejects overflowed startDate values", async () => {
  let userRpcCalls = 0;

  const handler = createBookingAvailabilityGetHandler({
    resolveContext: async () => ({
      context: {
        admin: {
          from: () => {
            throw new Error("settings lookup should not run when startDate is invalid");
          },
        } as never,
        userClient: {
          rpc: async () => {
            userRpcCalls += 1;
            return { data: [], error: null };
          },
        } as never,
        brand: { id: "brand_1", slug: "cti", name: "CTI" },
        actor: {
          user: { id: "user_1", email: "student@example.com" },
          customer: {
            id: "cust_1",
            email: "student@example.com",
            phone: "+15550000001",
            first_name: "Student",
            last_name: "One",
          },
          isBrandAdmin: false,
          instructorIds: [],
        },
      },
    }),
  });

  const response = await handler(
    new Request(
      "http://localhost:3000/api/bookings/availability?instructorId=inst_1&startDate=2026-02-31&studentTimezone=UTC",
    ),
  );

  assert.equal(response.status, 400);
  const body = (await response.json()) as { ok: boolean; error: string };
  assert.equal(body.ok, false);
  assert.match(body.error, /startDate must be YYYY-MM-DD/i);
  assert.equal(userRpcCalls, 0);
});

test("PUT /api/bookings/availability rejects overflowed dateOverrides.date values", async () => {
  let availabilityRpcCalls = 0;

  const handler = createBookingAvailabilityPutHandler({
    resolveContext: async () => ({
      context: {
        admin: {
          rpc: async () => {
            availabilityRpcCalls += 1;
            return { data: null, error: null };
          },
        } as never,
        userClient: { rpc: async () => ({ data: [], error: null }) } as never,
        brand: { id: "brand_1", slug: "cti", name: "CTI" },
        actor: {
          user: { id: "user_1", email: "instructor@example.com" },
          customer: null,
          isBrandAdmin: false,
          instructorIds: ["inst_1"],
        },
      },
    }),
  });

  const response = await handler(
    new Request("http://localhost:3000/api/bookings/availability", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        instructorId: "inst_1",
        timezone: "UTC",
        weeklySlots: [],
        dateOverrides: [
          {
            date: "2026-02-31",
            isAvailable: false,
          },
        ],
      }),
    }),
  );

  assert.equal(response.status, 400);
  const body = (await response.json()) as { ok: boolean; error: string };
  assert.equal(body.ok, false);
  assert.match(body.error, /dateOverrides\.date must be YYYY-MM-DD/i);
  assert.equal(availabilityRpcCalls, 0);
});

test("PUT /api/bookings/availability uses atomic replacement RPC", async () => {
  let rpcName = "";
  let rpcPayload: unknown = null;

  const handler = createBookingAvailabilityPutHandler({
    resolveContext: async () => ({
      context: {
        admin: {
          rpc: async (name: string, payload: unknown) => {
            rpcName = name;
            rpcPayload = payload;
            return { data: null, error: null };
          },
        } as never,
        userClient: { rpc: async () => ({ data: [], error: null }) } as never,
        brand: { id: "brand_1", slug: "cti", name: "CTI" },
        actor: {
          user: { id: "user_1", email: "instructor@example.com" },
          customer: null,
          isBrandAdmin: false,
          instructorIds: ["inst_1"],
        },
      },
    }),
  });

  const response = await handler(
    new Request("http://localhost:3000/api/bookings/availability", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        instructorId: "inst_1",
        timezone: "UTC",
        bufferMinutes: 20,
        advanceBookingDays: 60,
        cancellationCutoffHours: 48,
        weeklySlots: [
          {
            dayOfWeek: 1,
            startTime: "09:00",
            endTime: "11:00",
          },
        ],
        dateOverrides: [
          {
            date: "2026-03-10",
            isAvailable: true,
            startTime: "10:00",
            endTime: "11:00",
          },
        ],
      }),
    }),
  );

  assert.equal(response.status, 200);
  const body = (await response.json()) as { ok: boolean };
  assert.equal(body.ok, true);
  assert.equal(rpcName, "replace_instructor_availability");
  assert.deepEqual(rpcPayload, {
    p_brand_id: "brand_1",
    p_instructor_id: "inst_1",
    p_timezone: "UTC",
    p_buffer_minutes: 20,
    p_advance_booking_days: 60,
    p_cancellation_cutoff_hours: 48,
    p_weekly_slots: [
      {
        day_of_week: 1,
        start_time: "09:00",
        end_time: "11:00",
      },
    ],
    p_date_overrides: [
      {
        override_date: "2026-03-10",
        is_available: true,
        start_time: "10:00",
        end_time: "11:00",
      },
    ],
  });
});

test("PATCH /api/bookings/:id rejects malformed payment.amountCents values", async () => {
  let rpcCalls = 0;

  const admin = {
    from: (table: string) => {
      if (table !== "bookings") {
        throw new Error(`Unexpected table: ${table}`);
      }

      return createQueryBuilder({
        data: {
          id: "booking_3",
          brand_id: "brand_1",
          customer_id: "cust_1",
          instructor_id: "inst_1",
          status: "pending",
          start_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          payment_status: "unpaid",
          instructor_notes: null,
          notes: null,
        },
        error: null,
      });
    },
    rpc: async () => {
      rpcCalls += 1;
      return { data: [], error: null };
    },
  };

  const handler = createBookingPatchHandler({
    resolveContext: async () => ({
      context: {
        admin: admin as never,
        userClient: { rpc: async () => ({ data: [], error: null }) } as never,
        brand: { id: "brand_1", slug: "cti", name: "CTI" },
        actor: {
          user: { id: "user_1", email: "student@example.com" },
          customer: {
            id: "cust_1",
            email: "student@example.com",
            phone: "+15550000001",
            first_name: "Student",
            last_name: "One",
          },
          isBrandAdmin: false,
          instructorIds: [],
        },
      },
    }),
  });

  for (const invalidAmount of ["1e3", "100.9"]) {
    const response = await handler(
      new Request("http://localhost:3000/api/bookings/booking_3", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: "confirmed",
          payment: {
            amountCents: invalidAmount,
            currency: "USD",
            provider: "stripe",
            providerPaymentId: "pi_invalid",
          },
        }),
      }),
      { params: { bookingId: "booking_3" } },
    );

    assert.equal(response.status, 400);
    const body = (await response.json()) as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.match(body.error, /payment is required to confirm a booking/i);
  }

  assert.equal(rpcCalls, 0);
});

test("PATCH /api/bookings/:id rejects repeated confirmation attempts", async () => {
  let rpcCalls = 0;

  const admin = {
    from: (table: string) => {
      if (table !== "bookings") {
        throw new Error(`Unexpected table: ${table}`);
      }

      return createQueryBuilder({
        data: {
          id: "booking_1",
          brand_id: "brand_1",
          customer_id: "cust_1",
          instructor_id: "inst_1",
          status: "confirmed",
          start_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          payment_status: "paid",
          instructor_notes: null,
          notes: null,
        },
        error: null,
      });
    },
    rpc: async () => {
      rpcCalls += 1;
      return { data: null, error: null };
    },
  };

  const handler = createBookingPatchHandler({
    resolveContext: async () => ({
      context: {
        admin: admin as never,
        userClient: { rpc: async () => ({ data: [], error: null }) } as never,
        brand: { id: "brand_1", slug: "cti", name: "CTI" },
        actor: {
          user: { id: "user_1", email: "student@example.com" },
          customer: {
            id: "cust_1",
            email: "student@example.com",
            phone: "+15550000001",
            first_name: "Student",
            last_name: "One",
          },
          isBrandAdmin: false,
          instructorIds: [],
        },
      },
    }),
  });

  const response = await handler(
    new Request("http://localhost:3000/api/bookings/booking_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status: "confirmed",
        payment: {
          amountCents: 12000,
          currency: "USD",
          provider: "stripe",
          providerPaymentId: "pi_repeat",
        },
      }),
    }),
    { params: { bookingId: "booking_1" } },
  );

  assert.equal(response.status, 409);
  const body = (await response.json()) as { ok: boolean; error: string };
  assert.equal(body.ok, false);
  assert.match(body.error, /only pending bookings can be confirmed/i);
  assert.equal(rpcCalls, 0);
});

test("PATCH /api/bookings/:id keeps booking unmutated when atomic confirm RPC fails", async () => {
  let bookingsUpdateCalled = false;

  const admin = {
    from: (table: string) => {
      if (table !== "bookings") {
        throw new Error(`Unexpected table: ${table}`);
      }

      return createQueryBuilder(
        {
          data: {
            id: "booking_2",
            brand_id: "brand_1",
            customer_id: "cust_1",
            instructor_id: "inst_1",
            status: "pending",
            start_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
            payment_status: "unpaid",
            instructor_notes: null,
            notes: null,
          },
          error: null,
        },
        {
          onUpdate: () => {
            bookingsUpdateCalled = true;
          },
        },
      );
    },
    rpc: async (name: string) => {
      assert.equal(name, "confirm_booking_with_payment");
      return {
        data: null,
        error: {
          message: "duplicate key value violates unique constraint",
        },
      };
    },
  };

  const handler = createBookingPatchHandler({
    resolveContext: async () => ({
      context: {
        admin: admin as never,
        userClient: { rpc: async () => ({ data: [], error: null }) } as never,
        brand: { id: "brand_1", slug: "cti", name: "CTI" },
        actor: {
          user: { id: "user_1", email: "student@example.com" },
          customer: {
            id: "cust_1",
            email: "student@example.com",
            phone: "+15550000001",
            first_name: "Student",
            last_name: "One",
          },
          isBrandAdmin: false,
          instructorIds: [],
        },
      },
    }),
  });

  const response = await handler(
    new Request("http://localhost:3000/api/bookings/booking_2", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status: "confirmed",
        payment: {
          amountCents: 15000,
          currency: "USD",
          provider: "stripe",
          providerPaymentId: "pi_fail",
        },
      }),
    }),
    { params: { bookingId: "booking_2" } },
  );

  assert.equal(response.status, 500);
  const body = (await response.json()) as { ok: boolean; error: string };
  assert.equal(body.ok, false);
  assert.match(body.error, /unable to confirm booking with payment/i);
  assert.equal(bookingsUpdateCalled, false);
});

test("POST /api/bookings/reminders fails closed when secret config is missing", async () => {
  let adminClientCalls = 0;

  const handler = createBookingRemindersPostHandler({
    createAdminClient: () => {
      adminClientCalls += 1;
      throw new Error("admin client should not be called when auth fails");
    },
    sendReminderNotification: async () => ({
      emailSent: false,
      smsSent: false,
      warnings: [],
    }),
    now: () => Date.UTC(2026, 1, 20, 0, 0, 0),
    getCronSecret: () => undefined,
    getServiceRoleKey: () => undefined,
  });

  const response = await handler(
    new Request("http://localhost:3000/api/bookings/reminders", {
      method: "POST",
    }),
  );

  assert.equal(response.status, 401);
  const body = (await response.json()) as { ok: boolean; error: string };
  assert.equal(body.ok, false);
  assert.match(body.error, /unauthorized/i);
  assert.equal(adminClientCalls, 0);
});

test("POST /api/bookings/reminders rejects missing or invalid cron secret", async () => {
  let adminClientCalls = 0;

  const handler = createBookingRemindersPostHandler({
    createAdminClient: () => {
      adminClientCalls += 1;
      throw new Error("admin client should not be called when secret is invalid");
    },
    sendReminderNotification: async () => ({
      emailSent: false,
      smsSent: false,
      warnings: [],
    }),
    now: () => Date.UTC(2026, 1, 20, 0, 0, 0),
    getCronSecret: () => "cron_secret",
    getServiceRoleKey: () => undefined,
  });

  const requests = [
    new Request("http://localhost:3000/api/bookings/reminders", {
      method: "POST",
    }),
    new Request("http://localhost:3000/api/bookings/reminders", {
      method: "POST",
      headers: { "x-booking-cron-secret": "wrong_secret" },
    }),
  ];

  for (const request of requests) {
    const response = await handler(request);
    assert.equal(response.status, 401);

    const body = (await response.json()) as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.match(body.error, /unauthorized/i);
  }

  assert.equal(adminClientCalls, 0);
});

test("POST /api/bookings/reminders accepts a valid cron secret", async () => {
  let adminClientCalls = 0;
  let bookingsQueryCalls = 0;
  let reminderCalls = 0;

  const handler = createBookingRemindersPostHandler({
    createAdminClient: () => {
      adminClientCalls += 1;

      return {
        from: (table: string) => {
          if (table !== "bookings") {
            throw new Error(`Unexpected table: ${table}`);
          }

          bookingsQueryCalls += 1;
          return createReminderBookingsQueryBuilder({ data: [], error: null });
        },
      } as never;
    },
    sendReminderNotification: async () => {
      reminderCalls += 1;
      return {
        emailSent: false,
        smsSent: false,
        warnings: [],
      };
    },
    now: () => Date.UTC(2026, 1, 20, 0, 0, 0),
    getCronSecret: () => "cron_secret",
    getServiceRoleKey: () => undefined,
  });

  const response = await handler(
    new Request("http://localhost:3000/api/bookings/reminders", {
      method: "POST",
      headers: { "x-booking-cron-secret": "cron_secret" },
    }),
  );

  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    ok: boolean;
    attempted: number;
    sent: number;
    warnings: string[];
  };
  assert.equal(body.ok, true);
  assert.equal(body.attempted, 0);
  assert.equal(body.sent, 0);
  assert.deepEqual(body.warnings, []);
  assert.equal(adminClientCalls, 1);
  assert.equal(bookingsQueryCalls, 1);
  assert.equal(reminderCalls, 0);
});

test("POST /api/bookings/reminders accepts service-role bearer auth", async () => {
  let adminClientCalls = 0;
  let bookingsQueryCalls = 0;

  const handler = createBookingRemindersPostHandler({
    createAdminClient: () => {
      adminClientCalls += 1;

      return {
        from: (table: string) => {
          if (table !== "bookings") {
            throw new Error(`Unexpected table: ${table}`);
          }

          bookingsQueryCalls += 1;
          return createReminderBookingsQueryBuilder({ data: [], error: null });
        },
      } as never;
    },
    sendReminderNotification: async () => ({
      emailSent: false,
      smsSent: false,
      warnings: [],
    }),
    now: () => Date.UTC(2026, 1, 20, 0, 0, 0),
    getCronSecret: () => "cron_secret",
    getServiceRoleKey: () => "service_role_key",
  });

  const response = await handler(
    new Request("http://localhost:3000/api/bookings/reminders", {
      method: "POST",
      headers: { authorization: "Bearer service_role_key" },
    }),
  );

  assert.equal(response.status, 200);
  const body = (await response.json()) as { ok: boolean; attempted: number; sent: number };
  assert.equal(body.ok, true);
  assert.equal(body.attempted, 0);
  assert.equal(body.sent, 0);
  assert.equal(adminClientCalls, 1);
  assert.equal(bookingsQueryCalls, 1);
});

test("POST /api/bookings/reminders claims bookings atomically to avoid concurrent duplicate sends", async () => {
  const now = Date.UTC(2026, 1, 20, 0, 0, 0);
  const startAt = new Date(now + 24 * 60 * 60 * 1000).toISOString();

  const { admin, state } = createStatefulReminderAdmin(
    {
      id: "booking_1",
      brand_id: "brand_1",
      customer_id: "cust_1",
      instructor_id: "inst_1",
      start_at: startAt,
      student_timezone: "UTC",
      status: "confirmed",
      reminder_sent_at: null,
      deleted_at: null,
    },
    { listAlwaysReturnsBooking: true },
  );

  let sendCalls = 0;
  let releaseFirstSend: (() => void) | null = null;
  const firstSendGate = new Promise<void>((resolve) => {
    releaseFirstSend = resolve;
  });

  const handler = createBookingRemindersPostHandler({
    createAdminClient: () => admin as never,
    sendReminderNotification: async () => {
      sendCalls += 1;
      if (sendCalls === 1) {
        await firstSendGate;
      }

      return {
        emailSent: false,
        smsSent: true,
        warnings: [],
      };
    },
    now: () => now,
    getCronSecret: () => "cron_secret",
    getServiceRoleKey: () => undefined,
  });

  const makeRequest = () =>
    new Request("http://localhost:3000/api/bookings/reminders", {
      method: "POST",
      headers: { "x-booking-cron-secret": "cron_secret" },
    });

  const firstRun = handler(makeRequest());
  const secondRun = handler(makeRequest());

  await new Promise((resolve) => setTimeout(resolve, 0));
  releaseFirstSend?.();

  const [firstResponse, secondResponse] = await Promise.all([firstRun, secondRun]);
  const firstBody = (await firstResponse.json()) as { sent: number };
  const secondBody = (await secondResponse.json()) as { sent: number };

  assert.equal(sendCalls, 1);
  assert.equal(firstBody.sent + secondBody.sent, 1);
  assert.notEqual(state.reminder_sent_at, null);
});

test("POST /api/bookings/reminders releases claim when send fails so retries can send", async () => {
  const now = Date.UTC(2026, 1, 20, 0, 0, 0);
  const startAt = new Date(now + 24 * 60 * 60 * 1000).toISOString();

  const { admin, state } = createStatefulReminderAdmin({
    id: "booking_2",
    brand_id: "brand_1",
    customer_id: "cust_1",
    instructor_id: "inst_1",
    start_at: startAt,
    student_timezone: "UTC",
    status: "confirmed",
    reminder_sent_at: null,
    deleted_at: null,
  });

  let sendCalls = 0;

  const handler = createBookingRemindersPostHandler({
    createAdminClient: () => admin as never,
    sendReminderNotification: async () => {
      sendCalls += 1;

      if (sendCalls === 1) {
        return {
          emailSent: false,
          smsSent: false,
          warnings: ["sms provider temporarily unavailable"],
        };
      }

      return {
        emailSent: false,
        smsSent: true,
        warnings: [],
      };
    },
    now: () => now,
    getCronSecret: () => "cron_secret",
    getServiceRoleKey: () => undefined,
  });

  const makeRequest = () =>
    new Request("http://localhost:3000/api/bookings/reminders", {
      method: "POST",
      headers: { "x-booking-cron-secret": "cron_secret" },
    });

  const firstResponse = await handler(makeRequest());
  const firstBody = (await firstResponse.json()) as { sent: number; warnings: string[] };
  assert.equal(firstBody.sent, 0);
  assert.match(firstBody.warnings[0] ?? "", /temporarily unavailable/i);
  assert.equal(state.reminder_sent_at, null);

  const secondResponse = await handler(makeRequest());
  const secondBody = (await secondResponse.json()) as { sent: number };
  assert.equal(secondBody.sent, 1);
  assert.equal(sendCalls, 2);
  assert.notEqual(state.reminder_sent_at, null);
});
