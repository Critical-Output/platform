import assert from "node:assert/strict";
import { test } from "node:test";

import { buildLessonUnlockStates, buildModuleOrderById } from "../lib/courses/drip";
import type {
  EnrollmentRecord,
  LessonRecord,
  ModuleRecord,
  ProgressRecord,
} from "../lib/courses/types";

const lesson = (id: string, position: number, metadata: Record<string, unknown> = {}): LessonRecord => ({
  id,
  brand_id: "brand-1",
  module_id: "module-1",
  title: id,
  content: null,
  video_url: null,
  duration_minutes: 5,
  position,
  metadata,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  deleted_at: null,
});

const crossModuleLesson = (params: {
  id: string;
  moduleId: string;
  createdAt: string;
}): LessonRecord => ({
  id: params.id,
  brand_id: "brand-1",
  module_id: params.moduleId,
  title: params.id,
  content: null,
  video_url: null,
  duration_minutes: 5,
  position: 0,
  metadata: {},
  created_at: params.createdAt,
  updated_at: params.createdAt,
  deleted_at: null,
});

const moduleRecord = (params: {
  id: string;
  createdAt: string;
}): ModuleRecord => ({
  id: params.id,
  brand_id: "brand-1",
  course_id: "course-1",
  title: params.id,
  position: 0,
  metadata: {},
  created_at: params.createdAt,
  updated_at: params.createdAt,
  deleted_at: null,
});

const enrollment: EnrollmentRecord = {
  id: "enrollment-1",
  brand_id: "brand-1",
  customer_id: "customer-1",
  course_id: "course-1",
  status: "active",
  enrolled_at: "2026-01-01T00:00:00.000Z",
  completed_at: null,
  metadata: {},
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  deleted_at: null,
};

test("buildLessonUnlockStates enforces sequential unlock", () => {
  const lessons = [lesson("l1", 1), lesson("l2", 2), lesson("l3", 3)];
  const modulePos = new Map([["module-1", 1]]);

  const states = buildLessonUnlockStates({
    lessons,
    moduleOrderById: modulePos,
    enrollment,
    progressRows: [],
    courseMetadata: {},
    now: new Date("2026-01-01T01:00:00.000Z"),
  });

  assert.equal(states[0]?.unlocked, true);
  assert.equal(states[1]?.unlocked, false);
  assert.equal(states[1]?.reason, "waiting_for_previous_lesson");
});

test("buildLessonUnlockStates handles enrollment-date drip settings", () => {
  const lessons = [
    lesson("l1", 1),
    lesson("l2", 2, { drip: { days_after_enrollment: 2 } }),
  ];

  const progressRows: ProgressRecord[] = [
    {
      id: "p1",
      brand_id: "brand-1",
      enrollment_id: enrollment.id,
      lesson_id: "l1",
      percent_complete: 100,
      completed_at: "2026-01-01T02:00:00.000Z",
      metadata: {},
      created_at: "2026-01-01T02:00:00.000Z",
      updated_at: "2026-01-01T02:00:00.000Z",
      deleted_at: null,
    },
  ];

  const locked = buildLessonUnlockStates({
    lessons,
    moduleOrderById: new Map([["module-1", 1]]),
    enrollment,
    progressRows,
    courseMetadata: {},
    now: new Date("2026-01-02T00:00:00.000Z"),
  });

  assert.equal(locked[1]?.unlocked, false);
  assert.equal(locked[1]?.reason, "waiting_for_schedule");

  const unlocked = buildLessonUnlockStates({
    lessons,
    moduleOrderById: new Map([["module-1", 1]]),
    enrollment,
    progressRows,
    courseMetadata: {},
    now: new Date("2026-01-04T00:00:00.000Z"),
  });

  assert.equal(unlocked[1]?.unlocked, true);
});

test("buildLessonUnlockStates uses module creation order when module positions tie", () => {
  const modules = [
    moduleRecord({ id: "module-older", createdAt: "2026-01-01T00:00:00.000Z" }),
    moduleRecord({ id: "module-newer", createdAt: "2026-01-02T00:00:00.000Z" }),
  ];
  const lessons = [
    crossModuleLesson({
      id: "newer-lesson",
      moduleId: "module-newer",
      createdAt: "2026-01-01T00:00:00.000Z",
    }),
    crossModuleLesson({
      id: "older-lesson",
      moduleId: "module-older",
      createdAt: "2026-01-03T00:00:00.000Z",
    }),
  ];
  const moduleOrderById = buildModuleOrderById(modules);

  const locked = buildLessonUnlockStates({
    lessons,
    moduleOrderById,
    enrollment,
    progressRows: [],
    courseMetadata: {},
    now: new Date("2026-01-03T01:00:00.000Z"),
  });

  assert.deepEqual(
    locked.map((state) => state.lessonId),
    ["older-lesson", "newer-lesson"],
  );
  assert.equal(locked[0]?.unlocked, true);
  assert.equal(locked[1]?.reason, "waiting_for_previous_lesson");

  const unlocked = buildLessonUnlockStates({
    lessons,
    moduleOrderById,
    enrollment,
    progressRows: [
      {
        id: "progress-older",
        brand_id: "brand-1",
        enrollment_id: enrollment.id,
        lesson_id: "older-lesson",
        percent_complete: 100,
        completed_at: "2026-01-03T02:00:00.000Z",
        metadata: {},
        created_at: "2026-01-03T02:00:00.000Z",
        updated_at: "2026-01-03T02:00:00.000Z",
        deleted_at: null,
      },
    ],
    courseMetadata: {},
    now: new Date("2026-01-03T03:00:00.000Z"),
  });

  assert.equal(unlocked[1]?.unlocked, true);
});
