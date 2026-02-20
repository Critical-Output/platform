import assert from "node:assert/strict";
import { test } from "node:test";

import { GET as getCourseRoute } from "../app/api/courses/[courseId]/route";
import { GET as getModuleLessonsRoute } from "../app/api/courses/[courseId]/modules/[moduleId]/lessons/route";
import { GET as getModuleRoute } from "../app/api/courses/[courseId]/modules/[moduleId]/route";
import type { ViewerContext } from "../lib/courses/auth";
import type { CourseRow, EnrollmentRow, LessonRow, ModuleRow } from "../lib/courses/types";

const baseViewer: ViewerContext = {
  userId: "user-1",
  userEmail: "student@example.com",
  brandId: "brand-1",
  brandSlug: "cti",
  brandName: "CTI",
  customerId: "customer-1",
  isInstructor: false,
  isBrandAdmin: false,
};

const baseCourse: CourseRow = {
  id: "course-1",
  brand_id: "brand-1",
  title: "Course 1",
  description: null,
  level: null,
  duration_minutes: 60,
  metadata: {},
  created_at: "2026-02-20T00:00:00.000Z",
  updated_at: "2026-02-20T00:00:00.000Z",
  deleted_at: null,
};

const baseModule: ModuleRow = {
  id: "module-1",
  brand_id: "brand-1",
  course_id: "course-1",
  title: "Module 1",
  position: 0,
  metadata: {},
  created_at: "2026-02-20T00:00:00.000Z",
  updated_at: "2026-02-20T00:00:00.000Z",
  deleted_at: null,
};

const baseLesson: LessonRow = {
  id: "lesson-1",
  brand_id: "brand-1",
  module_id: "module-1",
  title: "Lesson 1",
  content: "secret lesson content",
  video_url: "https://video.example/player.mp4",
  duration_minutes: 8,
  position: 0,
  metadata: {
    videonest_asset_id: "asset-abc",
    videonest_embed_url: "https://player.videonest.example/embed/asset-abc",
    teaser: "catalog blurb",
  },
  created_at: "2026-02-20T00:00:00.000Z",
  updated_at: "2026-02-20T00:00:00.000Z",
  deleted_at: null,
};

const activeEnrollment: EnrollmentRow = {
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
};

test("GET /api/courses/[courseId] redacts lesson metadata for unenrolled viewers", async () => {
  const response = await getCourseRoute(
    new Request("http://localhost:3000/api/courses/course-1"),
    { params: { courseId: "course-1" } },
    {
      resolveViewerFromHeaders: async () => baseViewer,
      getCourseById: async () => baseCourse,
      getVisibleCourseIds: async () => new Set(["course-1"]),
      getEnrollmentForCourse: async () => null,
      listModulesByCourse: async () => [baseModule],
      listLessonsByModule: async () => [baseLesson],
    },
  );

  assert.equal(response.status, 200);
  const payload = (await response.json()) as {
    course: { modules: Array<{ lessons: Array<LessonRow> }> };
  };

  const lesson = payload.course.modules[0]?.lessons[0];
  assert.ok(lesson);
  assert.equal(lesson.content, null);
  assert.equal(lesson.video_url, null);
  assert.deepEqual(lesson.metadata, {});
});

test("GET /api/courses/[courseId]/modules/[moduleId]/lessons redacts lesson metadata for unenrolled viewers", async () => {
  const response = await getModuleLessonsRoute(
    new Request("http://localhost:3000/api/courses/course-1/modules/module-1/lessons"),
    { params: { courseId: "course-1", moduleId: "module-1" } },
    {
      resolveViewerFromHeaders: async () => baseViewer,
      getCourseById: async () => baseCourse,
      getModuleById: async () => baseModule,
      getVisibleCourseIds: async () => new Set(["course-1"]),
      getEnrollmentForCourse: async () => null,
      listLessonsByModule: async () => [baseLesson],
    },
  );

  assert.equal(response.status, 200);
  const payload = (await response.json()) as { lessons: LessonRow[] };

  assert.equal(payload.lessons[0]?.content, null);
  assert.equal(payload.lessons[0]?.video_url, null);
  assert.deepEqual(payload.lessons[0]?.metadata, {});
});

test("GET /api/courses/[courseId]/modules/[moduleId] returns 404 when course is not visible", async () => {
  const response = await getModuleRoute(
    new Request("http://localhost:3000/api/courses/course-1/modules/module-1"),
    { params: { courseId: "course-1", moduleId: "module-1" } },
    {
      resolveViewerFromHeaders: async () => baseViewer,
      getCourseById: async () => baseCourse,
      getModuleById: async () => baseModule,
      getVisibleCourseIds: async () => new Set(),
      getEnrollmentForCourse: async () => activeEnrollment,
    },
  );

  assert.equal(response.status, 404);
});

test("GET /api/courses/[courseId]/modules/[moduleId] returns 403 when viewer is not enrolled", async () => {
  const response = await getModuleRoute(
    new Request("http://localhost:3000/api/courses/course-1/modules/module-1"),
    { params: { courseId: "course-1", moduleId: "module-1" } },
    {
      resolveViewerFromHeaders: async () => baseViewer,
      getCourseById: async () => baseCourse,
      getModuleById: async () => baseModule,
      getVisibleCourseIds: async () => new Set(["course-1"]),
      getEnrollmentForCourse: async () => null,
    },
  );

  assert.equal(response.status, 403);
});

test("GET /api/courses/[courseId]/modules/[moduleId] allows visible enrolled viewers", async () => {
  const response = await getModuleRoute(
    new Request("http://localhost:3000/api/courses/course-1/modules/module-1"),
    { params: { courseId: "course-1", moduleId: "module-1" } },
    {
      resolveViewerFromHeaders: async () => baseViewer,
      getCourseById: async () => baseCourse,
      getModuleById: async () => baseModule,
      getVisibleCourseIds: async () => new Set(["course-1"]),
      getEnrollmentForCourse: async () => activeEnrollment,
    },
  );

  assert.equal(response.status, 200);
  const payload = (await response.json()) as { module: ModuleRow };
  assert.equal(payload.module.id, "module-1");
});
