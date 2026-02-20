import type { LessonRecord, ProgressRecord } from "./types";

export type CompletionMethod = "manual" | "time-based" | "quiz-pass";

export const clampPercent = (value: unknown): number => {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return 0;
  if (num < 0) return 0;
  if (num > 100) return 100;
  return Math.round(num * 100) / 100;
};

export const normalizeSeconds = (value: unknown): number => {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.round(num * 100) / 100;
};

export const isLessonComplete = (progress: ProgressRecord | null | undefined): boolean => {
  if (!progress) return false;
  if (progress.completed_at) return true;
  return Number(progress.percent_complete) >= 100;
};

export const calculateCoursePercent = (
  lessons: LessonRecord[],
  progressRows: ProgressRecord[],
): number => {
  if (lessons.length === 0) return 0;

  const byLesson = new Map(progressRows.map((row) => [row.lesson_id, row]));
  const total = lessons.reduce((sum, lesson) => {
    const row = byLesson.get(lesson.id);
    return sum + clampPercent(row?.percent_complete ?? 0);
  }, 0);

  return Math.round((total / lessons.length) * 100) / 100;
};

export const findFirstIncompleteLessonId = (
  lessons: LessonRecord[],
  progressRows: ProgressRecord[],
): string | null => {
  const byLesson = new Map(progressRows.map((row) => [row.lesson_id, row]));

  for (const lesson of lessons) {
    const row = byLesson.get(lesson.id);
    if (!isLessonComplete(row)) return lesson.id;
  }

  return lessons[lessons.length - 1]?.id ?? null;
};
