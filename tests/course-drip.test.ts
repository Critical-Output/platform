import assert from "node:assert/strict";
import { test } from "node:test";

import { calculateLessonUnlockStates, getResumeLessonId } from "../lib/courses/drip";
import type { ProgressRow } from "../lib/courses/types";

const baseEnrollment = "2026-01-01T00:00:00.000Z";

const makeProgress = (lessonId: string, percent: number): ProgressRow => ({
  id: `progress-${lessonId}`,
  brand_id: "brand-1",
  enrollment_id: "enrollment-1",
  lesson_id: lessonId,
  percent_complete: percent,
  completed_at: percent >= 100 ? "2026-01-02T00:00:00.000Z" : null,
  metadata: {},
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  deleted_at: null,
});

test("sequential drip unlocks first lesson and blocks next until completion", () => {
  const lessons = [
    { id: "l1", module_position: 0, lesson_position: 0, metadata: {} },
    { id: "l2", module_position: 0, lesson_position: 1, metadata: {} },
  ];

  const statesWithoutCompletion = calculateLessonUnlockStates({
    lessons,
    progressRows: [],
    enrollmentDate: baseEnrollment,
    courseMetadata: { drip_mode: "sequential" },
    now: new Date("2026-01-03T00:00:00.000Z"),
  });

  assert.equal(statesWithoutCompletion[0]?.isUnlocked, true);
  assert.equal(statesWithoutCompletion[1]?.isUnlocked, false);

  const statesWithCompletion = calculateLessonUnlockStates({
    lessons,
    progressRows: [makeProgress("l1", 100)],
    enrollmentDate: baseEnrollment,
    courseMetadata: { drip_mode: "sequential" },
    now: new Date("2026-01-03T00:00:00.000Z"),
  });

  assert.equal(statesWithCompletion[1]?.isUnlocked, true);
});

test("date-based drip unlocks lesson after release days", () => {
  const lessons = [
    { id: "l1", module_position: 0, lesson_position: 0, metadata: { release_days_after_enrollment: 2 } },
  ];

  const locked = calculateLessonUnlockStates({
    lessons,
    progressRows: [],
    enrollmentDate: baseEnrollment,
    courseMetadata: { drip_mode: "date" },
    now: new Date("2026-01-02T00:00:00.000Z"),
  });
  assert.equal(locked[0]?.isUnlocked, false);

  const unlocked = calculateLessonUnlockStates({
    lessons,
    progressRows: [],
    enrollmentDate: baseEnrollment,
    courseMetadata: { drip_mode: "date" },
    now: new Date("2026-01-04T00:00:00.000Z"),
  });
  assert.equal(unlocked[0]?.isUnlocked, true);
});

test("resume lesson picks first unlocked incomplete lesson", () => {
  const lessons = [
    { id: "l1", module_position: 0, lesson_position: 0, metadata: {} },
    { id: "l2", module_position: 0, lesson_position: 1, metadata: {} },
  ];

  const progressRows = [makeProgress("l1", 100)];
  const unlockStates = calculateLessonUnlockStates({
    lessons,
    progressRows,
    enrollmentDate: baseEnrollment,
    courseMetadata: { drip_mode: "sequential" },
    now: new Date("2026-01-03T00:00:00.000Z"),
  });

  const resumeLessonId = getResumeLessonId(lessons, unlockStates, progressRows);
  assert.equal(resumeLessonId, "l2");
});
