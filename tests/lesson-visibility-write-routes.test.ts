import assert from "node:assert/strict";
import { test } from "node:test";

import {
  runLessonCompletePost,
  type LessonCompletePostDependencies,
} from "../app/api/courses/[courseId]/lessons/[lessonId]/complete/complete-post";
import {
  runLessonProgressPost,
  type LessonProgressPostDependencies,
} from "../app/api/courses/[courseId]/lessons/[lessonId]/progress/progress-post";
import type { CourseRequestContext } from "../lib/courses/context";
import type { CourseStructure } from "../lib/courses/learning";
import type {
  CourseRecord,
  EnrollmentRecord,
  LessonRecord,
  ModuleRecord,
  ProgressRecord,
} from "../lib/courses/types";
import {
  hasRequiredTierAccess,
  toLessonVisibilitySettings,
} from "../lib/courses/visibility";

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

const context: CourseRequestContext = {
  supabase: {} as CourseRequestContext["supabase"],
  userId: "user-1",
  brand: {
    id: "brand-1",
    slug: "brand-1",
    name: "Brand 1",
  },
  isBrandAdmin: false,
  customerId: "customer-1",
};

const createSpecificTierLesson = (): LessonRecord => ({
  id: "lesson-gold",
  brand_id: "brand-1",
  module_id: "module-1",
  title: "Gold Lesson",
  content: "content",
  video_url: "lesson-gold.mp4",
  duration_minutes: null,
  position: 0,
  metadata: {
    visibility: "specific_tier",
    required_tier: "gold",
  },
  created_at: "2026-02-01T00:00:00.000Z",
  updated_at: "2026-02-01T00:00:00.000Z",
  deleted_at: null,
});

const createStructure = (lesson: LessonRecord): CourseStructure => ({
  course,
  modules,
  lessons: [lesson],
  moduleOrderById: new Map([["module-1", 0]]),
});

const createProgressRecord = (percentComplete: number): ProgressRecord => ({
  id: "progress-1",
  brand_id: "brand-1",
  enrollment_id: enrollment.id,
  lesson_id: "lesson-gold",
  percent_complete: percentComplete,
  completed_at: percentComplete >= 100 ? "2026-02-01T00:00:00.000Z" : null,
  metadata: {
    completion_method: "manual",
  },
  created_at: "2026-02-01T00:00:00.000Z",
  updated_at: "2026-02-01T00:00:00.000Z",
  deleted_at: null,
});

const createProgressDependencies = (options: {
  activeTiers: string[];
  onUpsert: () => void;
}): LessonProgressPostDependencies => {
  const structure = createStructure(createSpecificTierLesson());

  return {
    async getCourseRequestContext() {
      return context;
    },
    async readJsonBody() {
      return {
        completion_method: "manual",
        percent_complete: 25,
      };
    },
    async loadEnrollment() {
      return enrollment;
    },
    async loadCourseStructure() {
      return structure;
    },
    async loadProgressRows() {
      return [];
    },
    ensureLessonUnlocked() {},
    toLessonVisibilitySettings,
    async loadActiveSubscriptionTiers() {
      return new Set(options.activeTiers);
    },
    hasRequiredTierAccess,
    async upsertLessonProgress() {
      options.onUpsert();
      return createProgressRecord(25);
    },
    calculateCoursePercent() {
      return 25;
    },
    isLessonComplete(progress) {
      return (progress?.percent_complete ?? 0) >= 100;
    },
    async issueCertificateForEnrollment() {
      return "certificate-1";
    },
    generateCertificateNumber() {
      return "CERT-2026-ABC123";
    },
  };
};

const createCompleteDependencies = (options: {
  activeTiers: string[];
  onUpsert: () => void;
}): LessonCompletePostDependencies => {
  const structure = createStructure(createSpecificTierLesson());

  return {
    async getCourseRequestContext() {
      return context;
    },
    async readJsonBody() {
      return {
        method: "manual",
      };
    },
    async loadEnrollment() {
      return enrollment;
    },
    async loadCourseStructure() {
      return structure;
    },
    async loadProgressRows() {
      return [];
    },
    ensureLessonUnlocked() {},
    toLessonVisibilitySettings,
    async loadActiveSubscriptionTiers() {
      return new Set(options.activeTiers);
    },
    hasRequiredTierAccess,
    async upsertLessonProgress() {
      options.onUpsert();
      return createProgressRecord(100);
    },
    isLessonComplete(progress) {
      return (progress?.percent_complete ?? 0) >= 100;
    },
    async issueCertificateForEnrollment() {
      return "certificate-1";
    },
    generateCertificateNumber() {
      return "CERT-2026-ABC123";
    },
  };
};

test("POST /api/courses/:courseId/lessons/:lessonId/progress rejects specific-tier writes without matching tier", async () => {
  let upsertCalled = false;
  const dependencies = createProgressDependencies({
    activeTiers: ["silver"],
    onUpsert: () => {
      upsertCalled = true;
    },
  });

  const response = await runLessonProgressPost(
    new Request("http://localhost:3000/api/courses/course-1/lessons/lesson-gold/progress", { method: "POST" }),
    {
      params: {
        courseId: "course-1",
        lessonId: "lesson-gold",
      },
    },
    dependencies,
  );

  assert.equal(response.status, 403);
  assert.equal(upsertCalled, false);
});

test("POST /api/courses/:courseId/lessons/:lessonId/progress allows specific-tier writes for matching tier", async () => {
  let upsertCalled = false;
  const dependencies = createProgressDependencies({
    activeTiers: ["gold"],
    onUpsert: () => {
      upsertCalled = true;
    },
  });

  const response = await runLessonProgressPost(
    new Request("http://localhost:3000/api/courses/course-1/lessons/lesson-gold/progress", { method: "POST" }),
    {
      params: {
        courseId: "course-1",
        lessonId: "lesson-gold",
      },
    },
    dependencies,
  );

  assert.equal(response.status, 200);
  assert.equal(upsertCalled, true);
});

test("POST /api/courses/:courseId/lessons/:lessonId/complete rejects specific-tier writes without matching tier", async () => {
  let upsertCalled = false;
  const dependencies = createCompleteDependencies({
    activeTiers: ["silver"],
    onUpsert: () => {
      upsertCalled = true;
    },
  });

  const response = await runLessonCompletePost(
    new Request("http://localhost:3000/api/courses/course-1/lessons/lesson-gold/complete", { method: "POST" }),
    {
      params: {
        courseId: "course-1",
        lessonId: "lesson-gold",
      },
    },
    dependencies,
  );

  assert.equal(response.status, 403);
  assert.equal(upsertCalled, false);
});

test("POST /api/courses/:courseId/lessons/:lessonId/complete allows specific-tier writes for matching tier", async () => {
  let upsertCalled = false;
  const dependencies = createCompleteDependencies({
    activeTiers: ["gold"],
    onUpsert: () => {
      upsertCalled = true;
    },
  });

  const response = await runLessonCompletePost(
    new Request("http://localhost:3000/api/courses/course-1/lessons/lesson-gold/complete", { method: "POST" }),
    {
      params: {
        courseId: "course-1",
        lessonId: "lesson-gold",
      },
    },
    dependencies,
  );

  assert.equal(response.status, 200);
  assert.equal(upsertCalled, true);
});
