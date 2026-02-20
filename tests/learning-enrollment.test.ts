import assert from "node:assert/strict";
import { test } from "node:test";

import { loadEnrollment } from "../lib/courses/learning";

type QueryCall = {
  method: string;
  args: unknown[];
};

const createSupabaseStub = (response: { data: unknown; error: { message: string } | null }) => {
  const calls: QueryCall[] = [];

  const query = {
    select: (...args: unknown[]) => {
      calls.push({ method: "select", args });
      return query;
    },
    eq: (...args: unknown[]) => {
      calls.push({ method: "eq", args });
      return query;
    },
    is: (...args: unknown[]) => {
      calls.push({ method: "is", args });
      return query;
    },
    in: (...args: unknown[]) => {
      calls.push({ method: "in", args });
      return query;
    },
    order: (...args: unknown[]) => {
      calls.push({ method: "order", args });
      return query;
    },
    limit: (...args: unknown[]) => {
      calls.push({ method: "limit", args });
      return query;
    },
    maybeSingle: async () => {
      calls.push({ method: "maybeSingle", args: [] });
      return response;
    },
  };

  const supabase = {
    from: (table: string) => {
      calls.push({ method: "from", args: [table] });
      return query;
    },
  };

  return {
    supabase: supabase as Parameters<typeof loadEnrollment>[0],
    calls,
  };
};

test("loadEnrollment constrains to active/completed and limits to one row", async () => {
  const { supabase, calls } = createSupabaseStub({
    data: {
      id: "enrollment-1",
      brand_id: "brand-1",
      customer_id: "customer-1",
      course_id: "course-1",
      status: "active",
      enrolled_at: "2026-02-20T00:00:00.000Z",
      completed_at: null,
      metadata: {},
      created_at: "2026-02-20T00:00:00.000Z",
      updated_at: "2026-02-20T00:00:00.000Z",
      deleted_at: null,
    },
    error: null,
  });

  const enrollment = await loadEnrollment(supabase, "brand-1", "customer-1", "course-1");

  assert.equal(enrollment?.id, "enrollment-1");
  assert.deepEqual(
    calls.find((call) => call.method === "in")?.args,
    ["status", ["active", "completed"]],
  );
  assert.deepEqual(calls.find((call) => call.method === "limit")?.args, [1]);
});

test("loadEnrollment throws a CourseApiError when Supabase returns an error", async () => {
  const { supabase } = createSupabaseStub({
    data: null,
    error: {
      message: "multiple rows returned",
    },
  });

  await assert.rejects(
    () => loadEnrollment(supabase, "brand-1", "customer-1", "course-1"),
    /Could not load enrollment: multiple rows returned/,
  );
});
