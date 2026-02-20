import assert from "node:assert/strict";
import { test } from "node:test";

import { orderDashboardLessonIds } from "../lib/courses/dashboard";
import type { ProgressRecord } from "../lib/courses/types";

const buildResumeAndProgress = (orderedLessonIds: string[], progressRows: ProgressRecord[]) => {
  const progressByLesson = new Map(progressRows.map((row) => [row.lesson_id, row]));

  const totalPercent = orderedLessonIds.reduce((sum, lessonId) => {
    const row = progressByLesson.get(lessonId);
    const raw = Number(row?.percent_complete ?? 0);
    const percent = Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : 0;
    return sum + percent;
  }, 0);

  const progressPercent =
    orderedLessonIds.length > 0
      ? Math.round((totalPercent / orderedLessonIds.length) * 100) / 100
      : 0;

  const resumeLessonId =
    orderedLessonIds.find((lessonId) => {
      const row = progressByLesson.get(lessonId);
      if (!row) return true;
      if (row.completed_at) return false;
      return Number(row.percent_complete) < 100;
    }) ?? orderedLessonIds[orderedLessonIds.length - 1] ?? null;

  return {
    progressPercent,
    resumeLessonId,
  };
};

test("GET /api/courses ordering keeps tied-position modules deterministic for resume metrics", () => {
  const orderedLessonIds = orderDashboardLessonIds(
    [
      {
        id: "module-older",
        position: 0,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "module-newer",
        position: 0,
        created_at: "2026-01-02T00:00:00.000Z",
      },
    ],
    [
      {
        id: "lesson-newer",
        module_id: "module-newer",
        position: 0,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "lesson-older",
        module_id: "module-older",
        position: 0,
        created_at: "2026-01-03T00:00:00.000Z",
      },
    ],
  );

  assert.deepEqual(orderedLessonIds, ["lesson-older", "lesson-newer"]);

  const { progressPercent, resumeLessonId } = buildResumeAndProgress(orderedLessonIds, [
    {
      id: "progress-older",
      brand_id: "brand-1",
      enrollment_id: "enrollment-1",
      lesson_id: "lesson-older",
      percent_complete: 40,
      completed_at: null,
      metadata: {},
      created_at: "2026-01-03T01:00:00.000Z",
      updated_at: "2026-01-03T01:00:00.000Z",
      deleted_at: null,
    },
  ]);

  assert.equal(progressPercent, 20);
  assert.equal(resumeLessonId, "lesson-older");
});
