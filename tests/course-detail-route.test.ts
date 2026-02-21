import assert from "node:assert/strict";
import { test } from "node:test";

import { runCourseDetailsGet } from "../app/api/courses/[courseId]/course-details-get";
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

const createLesson = (params: {
  id: string;
  title: string;
  visibility?: "free_preview" | "members_only" | "specific_tier";
  requiredTier?: string | null;
  content?: string | null;
  videoUrl?: string | null;
}): LessonRecord => ({
  id: params.id,
  brand_id: "brand-1",
  module_id: "module-1",
  title: params.title,
  content: params.content ?? `${params.title} content`,
  video_url: params.videoUrl ?? `${params.id}.mp4`,
  duration_minutes: null,
  position: 0,
  metadata: {
    visibility: params.visibility ?? "members_only",
    required_tier: params.requiredTier ?? null,
  },
  created_at: "2026-02-01T00:00:00.000Z",
  updated_at: "2026-02-01T00:00:00.000Z",
  deleted_at: null,
});

const createStructure = (lessons: LessonRecord[]): CourseStructure => ({
  course,
  modules,
  lessons,
  moduleOrderById: new Map([["module-1", 0]]),
});

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

test("GET /api/courses/:courseId resolves learner customer and returns enrolled content", async () => {
  const structure = createStructure([
    createLesson({
      id: "lesson-1",
      title: "Lesson",
      visibility: "members_only",
    }),
  ]);

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
      async loadActiveSubscriptionTiers() {
        return new Set<string>();
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
        return [{ lessonId: "lesson-1", unlocked: true, reason: "ok", releaseAt: null }];
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
    modules?: Array<{ id: string; lessons: Array<{ id: string; unlock?: { unlocked: boolean; reason: string } }> }>;
  };

  assert.equal(json.ok, true);
  assert.deepEqual(enrollmentCustomerIds, ["customer-1"]);
  assert.equal(json.enrollment?.id, "enrollment-1");
  assert.equal(json.requires_enrollment, undefined);
  assert.equal(json.modules?.length, 1);
  assert.equal(json.modules?.[0]?.id, "module-1");
  assert.equal(json.modules?.[0]?.lessons.length, 1);
  assert.equal(json.modules?.[0]?.lessons[0]?.id, "lesson-1");
  assert.equal(json.modules?.[0]?.lessons[0]?.unlock?.unlocked, true);
});

test("GET /api/courses/:courseId exposes free preview while locking members-only and specific-tier lessons", async () => {
  const structure = createStructure([
    createLesson({ id: "lesson-free", title: "Free Lesson", visibility: "free_preview" }),
    createLesson({ id: "lesson-members", title: "Members Lesson", visibility: "members_only" }),
    createLesson({
      id: "lesson-gold",
      title: "Gold Lesson",
      visibility: "specific_tier",
      requiredTier: "gold",
    }),
  ]);

  const supabase = createCertificateSupabaseStub();

  const response = await runCourseDetailsGet(
    new Request("http://localhost:3000/api/courses/course-1"),
    { courseId: "course-1" },
    {
      async getCourseRequestContext() {
        return {
          supabase,
          userId: "user-1",
          brand: {
            id: "brand-1",
            slug: "brand-1",
            name: "Brand 1",
          },
          isBrandAdmin: false,
          customerId: "customer-1",
        };
      },
      async loadCourseById() {
        return null;
      },
      async loadVisibleCourseById() {
        return course;
      },
      async loadEnrollment() {
        return null;
      },
      async loadActiveSubscriptionTiers() {
        return new Set<string>();
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
        return "lesson-free";
      },
    },
  );

  assert.equal(response.status, 200);

  const json = (await response.json()) as {
    ok: boolean;
    requires_enrollment?: boolean;
    modules: Array<{
      lessons: Array<{
        id: string;
        content: string | null;
        video_url: string | null;
        unlock: { unlocked: boolean; reason: string };
      }>;
    }>;
  };

  assert.equal(json.ok, true);
  assert.equal(json.requires_enrollment, true);

  const lessons = json.modules[0]?.lessons ?? [];
  const freeLesson = lessons.find((lesson) => lesson.id === "lesson-free");
  const membersLesson = lessons.find((lesson) => lesson.id === "lesson-members");
  const tierLesson = lessons.find((lesson) => lesson.id === "lesson-gold");

  assert.equal(freeLesson?.content, "Free Lesson content");
  assert.equal(freeLesson?.video_url, "lesson-free.mp4");
  assert.equal(freeLesson?.unlock.unlocked, true);
  assert.equal(freeLesson?.unlock.reason, "available");

  assert.equal(membersLesson?.content, null);
  assert.equal(membersLesson?.video_url, null);
  assert.equal(membersLesson?.unlock.unlocked, false);
  assert.equal(membersLesson?.unlock.reason, "requires_enrollment");

  assert.equal(tierLesson?.content, null);
  assert.equal(tierLesson?.video_url, null);
  assert.equal(tierLesson?.unlock.unlocked, false);
  assert.equal(tierLesson?.unlock.reason, "requires_tier");
});

test("GET /api/courses/:courseId keeps specific-tier lessons locked without matching subscription tier", async () => {
  const structure = createStructure([
    createLesson({
      id: "lesson-gold",
      title: "Gold Lesson",
      visibility: "specific_tier",
      requiredTier: "gold",
    }),
  ]);

  const supabase = createCertificateSupabaseStub();

  const response = await runCourseDetailsGet(
    new Request("http://localhost:3000/api/courses/course-1"),
    { courseId: "course-1" },
    {
      async getCourseRequestContext() {
        return {
          supabase,
          userId: "user-1",
          brand: {
            id: "brand-1",
            slug: "brand-1",
            name: "Brand 1",
          },
          isBrandAdmin: false,
          customerId: "customer-1",
        };
      },
      async loadCourseById() {
        return null;
      },
      async loadVisibleCourseById() {
        return course;
      },
      async loadEnrollment() {
        return enrollment;
      },
      async loadActiveSubscriptionTiers() {
        return new Set(["silver"]);
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
        return [{ lessonId: "lesson-gold", unlocked: true, reason: "ok", releaseAt: null }];
      },
      calculateCoursePercent() {
        return 0;
      },
      findFirstIncompleteLessonId() {
        return "lesson-gold";
      },
    },
  );

  assert.equal(response.status, 200);

  const json = (await response.json()) as {
    ok: boolean;
    modules: Array<{
      lessons: Array<{
        id: string;
        content: string | null;
        video_url: string | null;
        unlock: { unlocked: boolean; reason: string };
      }>;
    }>;
  };

  assert.equal(json.ok, true);

  const tierLesson = json.modules[0]?.lessons[0];
  assert.equal(tierLesson?.id, "lesson-gold");
  assert.equal(tierLesson?.content, null);
  assert.equal(tierLesson?.video_url, null);
  assert.equal(tierLesson?.unlock.unlocked, false);
  assert.equal(tierLesson?.unlock.reason, "requires_tier");
});

test("GET /api/courses/:courseId unlocks specific-tier lessons for matching subscription tier", async () => {
  const structure = createStructure([
    createLesson({
      id: "lesson-gold",
      title: "Gold Lesson",
      visibility: "specific_tier",
      requiredTier: "gold",
    }),
  ]);

  const supabase = createCertificateSupabaseStub();

  const response = await runCourseDetailsGet(
    new Request("http://localhost:3000/api/courses/course-1"),
    { courseId: "course-1" },
    {
      async getCourseRequestContext() {
        return {
          supabase,
          userId: "user-1",
          brand: {
            id: "brand-1",
            slug: "brand-1",
            name: "Brand 1",
          },
          isBrandAdmin: false,
          customerId: "customer-1",
        };
      },
      async loadCourseById() {
        return null;
      },
      async loadVisibleCourseById() {
        return course;
      },
      async loadEnrollment() {
        return enrollment;
      },
      async loadActiveSubscriptionTiers() {
        return new Set(["gold"]);
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
        return [{ lessonId: "lesson-gold", unlocked: true, reason: "ok", releaseAt: null }];
      },
      calculateCoursePercent() {
        return 0;
      },
      findFirstIncompleteLessonId() {
        return "lesson-gold";
      },
    },
  );

  assert.equal(response.status, 200);

  const json = (await response.json()) as {
    ok: boolean;
    modules: Array<{
      lessons: Array<{
        id: string;
        content: string | null;
        video_url: string | null;
        unlock: { unlocked: boolean; reason: string };
      }>;
    }>;
  };

  assert.equal(json.ok, true);

  const tierLesson = json.modules[0]?.lessons[0];
  assert.equal(tierLesson?.id, "lesson-gold");
  assert.equal(tierLesson?.content, "Gold Lesson content");
  assert.equal(tierLesson?.video_url, "lesson-gold.mp4");
  assert.equal(tierLesson?.unlock.unlocked, true);
  assert.equal(tierLesson?.unlock.reason, "available");
});
