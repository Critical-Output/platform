import assert from "node:assert/strict";
import { test } from "node:test";

import { runCourseDetailsGet } from "../app/api/courses/[courseId]/route";
import type { CourseRequestContext } from "../lib/courses/context";
import type { CourseStructure } from "../lib/courses/learning";
import type { CourseRecord, EnrollmentRecord, LessonRecord, ModuleRecord } from "../lib/courses/types";

const createCertificateSupabaseStub = () => {
  const query = {
    select(_columns: string) {
      return query;
    },
    eq(_column: string, _value: unknown) {
      return query;
    },
    is(_column: string, _value: unknown) {
      return query;
    },
    order(_column: string, _options: { ascending: boolean }) {
      return query;
    },
    async maybeSingle() {
      return { data: null, error: null };
    },
  };

  return {
    from(table: string) {
      assert.equal(table, "certificates");
      return query;
    },
  } as unknown as CourseRequestContext["supabase"];
};

test("GET /api/courses/:courseId resolves learner customer and returns enrolled content", async () => {
  const course: CourseRecord = {
    id: "course-1",
    brand_id: "brand-1",
    title: "Course",
    description: null,
    level: null,
    duration_minutes: null,
    metadata: {},
    created_at: "2026-02-01T00:00:00.000Z",
    updated_at: "2026-02-01T00:00:00.000Z",
    deleted_at: null,
  };

  const modules: ModuleRecord[] = [
    {
      id: "module-1",
      brand_id: "brand-1",
      course_id: "course-1",
      title: "Module",
      position: 0,
      metadata: {},
      created_at: "2026-02-01T00:00:00.000Z",
      updated_at: "2026-02-01T00:00:00.000Z",
      deleted_at: null,
    },
  ];

  const lessons: LessonRecord[] = [
    {
      id: "lesson-1",
      brand_id: "brand-1",
      module_id: "module-1",
      title: "Lesson",
      content: null,
      video_url: null,
      duration_minutes: null,
      position: 0,
      metadata: {},
      created_at: "2026-02-01T00:00:00.000Z",
      updated_at: "2026-02-01T00:00:00.000Z",
      deleted_at: null,
    },
  ];

  const structure: CourseStructure = {
    course,
    modules,
    lessons,
    moduleOrderById: new Map([["module-1", 0]]),
  };

  const enrollment: EnrollmentRecord = {
    id: "enrollment-1",
    brand_id: "brand-1",
    customer_id: "customer-1",
    course_id: "course-1",
    status: "active",
    enrolled_at: "2026-02-01T00:00:00.000Z",
    completed_at: null,
    metadata: {},
    created_at: "2026-02-01T00:00:00.000Z",
    updated_at: "2026-02-01T00:00:00.000Z",
    deleted_at: null,
  };

  const supabase = createCertificateSupabaseStub();
  const enrollmentCustomerIds: string[] = [];

  const response = await runCourseDetailsGet(
    new Request("http://localhost:3000/api/courses/course-1"),
    { courseId: "course-1" },
    {
      async getCourseRequestContext(options) {
        return {
          supabase,
          userId: "user-1",
          brand: {
            id: "brand-1",
            slug: "brand-1",
            name: "Brand 1",
          },
          isBrandAdmin: false,
          customerId: options?.requireCustomer === false ? null : "customer-1",
        };
      },
      async loadCourseById() {
        return null;
      },
      async loadVisibleCourseById() {
        return course;
      },
      async loadEnrollment(_supabase, _brandId, customerId) {
        enrollmentCustomerIds.push(customerId);
        return enrollment;
      },
      async loadCourseStructure() {
        return structure;
      },
      sortLessonsForUnlock(currentLessons) {
        return currentLessons;
      },
      async loadProgressRows() {
        return [];
      },
      buildLessonUnlockStates() {
        return [];
      },
      calculateCoursePercent() {
        return 0;
      },
      findFirstIncompleteLessonId() {
        return "lesson-1";
      },
    },
  );

  assert.equal(response.status, 200);

  const json = (await response.json()) as {
    ok: boolean;
    enrollment: EnrollmentRecord | null;
    requires_enrollment?: boolean;
    modules?: Array<{ id: string; lessons: Array<{ id: string }> }>;
  };

  assert.equal(json.ok, true);
  assert.deepEqual(enrollmentCustomerIds, ["customer-1"]);
  assert.equal(json.enrollment?.id, "enrollment-1");
  assert.equal(json.requires_enrollment, undefined);
  assert.equal(json.modules?.length, 1);
  assert.equal(json.modules?.[0]?.id, "module-1");
  assert.equal(json.modules?.[0]?.lessons.length, 1);
  assert.equal(json.modules?.[0]?.lessons[0]?.id, "lesson-1");
});
