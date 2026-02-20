import assert from "node:assert/strict";
import { test } from "node:test";

import { buildModuleOrderById, sortLessonsForUnlock } from "../lib/courses/drip";
import {
  calculateCoursePercent,
  clampPercent,
  findFirstIncompleteLessonId,
  normalizeSeconds,
} from "../lib/courses/progress";
import type { LessonRecord, ModuleRecord, ProgressRecord } from "../lib/courses/types";

const lesson = (id: string, overrides: Partial<LessonRecord> = {}): LessonRecord => ({
  id,
  brand_id: "brand-1",
  module_id: "module-1",
  title: id,
  content: null,
  video_url: null,
  duration_minutes: 5,
  position: 1,
  metadata: {},
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  deleted_at: null,
  ...overrides,
});

const progress = (lessonId: string, percentComplete: number): ProgressRecord => ({
  id: `progress-${lessonId}`,
  brand_id: "brand-1",
  enrollment_id: "enrollment-1",
  lesson_id: lessonId,
  percent_complete: percentComplete,
  completed_at: percentComplete >= 100 ? "2026-01-01T00:00:00.000Z" : null,
  metadata: {},
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  deleted_at: null,
});

test("clampPercent clamps outside range", () => {
  assert.equal(clampPercent(-10), 0);
  assert.equal(clampPercent(120), 100);
  assert.equal(clampPercent(42.349), 42.35);
});

test("normalizeSeconds normalizes invalid values", () => {
  assert.equal(normalizeSeconds(-10), 0);
  assert.equal(normalizeSeconds("12.345"), 12.35);
  assert.equal(normalizeSeconds("bad"), 0);
});

test("calculateCoursePercent averages per-lesson percent", () => {
  const lessons = [lesson("l1"), lesson("l2"), lesson("l3")];
  const rows = [progress("l1", 100), progress("l2", 50)];

  assert.equal(calculateCoursePercent(lessons, rows), 50);
});

test("findFirstIncompleteLessonId returns first non-complete lesson", () => {
  const lessons = [lesson("l1"), lesson("l2"), lesson("l3")];
  const rows = [progress("l1", 100), progress("l2", 80), progress("l3", 0)];

  assert.equal(findFirstIncompleteLessonId(lessons, rows), "l2");
});

test("findFirstIncompleteLessonId follows module ordering when positions tie across modules", () => {
  const modules: ModuleRecord[] = [
    {
      id: "module-a",
      brand_id: "brand-1",
      course_id: "course-1",
      title: "Module A",
      position: 0,
      metadata: {},
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      deleted_at: null,
    },
    {
      id: "module-b",
      brand_id: "brand-1",
      course_id: "course-1",
      title: "Module B",
      position: 0,
      metadata: {},
      created_at: "2026-01-02T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z",
      deleted_at: null,
    },
  ];

  const lessons = [
    lesson("b1", {
      module_id: "module-b",
      position: 0,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    }),
    lesson("a1", {
      module_id: "module-a",
      position: 0,
      created_at: "2026-01-03T00:00:00.000Z",
      updated_at: "2026-01-03T00:00:00.000Z",
    }),
    lesson("a2", {
      module_id: "module-a",
      position: 0,
      created_at: "2026-01-04T00:00:00.000Z",
      updated_at: "2026-01-04T00:00:00.000Z",
    }),
  ];

  const orderedLessons = sortLessonsForUnlock(lessons, buildModuleOrderById(modules));
  const rows = [progress("a1", 100)];

  assert.equal(findFirstIncompleteLessonId(orderedLessons, rows), "a2");
});
