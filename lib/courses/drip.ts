import type { JsonObject, ProgressRow } from "@/lib/courses/types";
import { asJsonObject, normalizeInteger } from "@/lib/courses/utils";

export type LessonWithOrder = {
  id: string;
  module_position: number;
  lesson_position: number;
  metadata: JsonObject;
};

export type LessonUnlockState = {
  lessonId: string;
  isUnlocked: boolean;
  availableAt: string | null;
  reason: "drip_date_locked" | "sequential_locked" | null;
};

const toDate = (value: string): Date => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const asCompletedSet = (progressRows: ProgressRow[]): Set<string> => {
  const completedLessonIds = progressRows
    .filter((row) => row.completed_at || row.percent_complete >= 100)
    .map((row) => row.lesson_id);

  return new Set(completedLessonIds);
};

const getReleaseDays = (metadata: JsonObject): number | null => {
  const release = normalizeInteger(
    metadata.release_days_after_enrollment ?? metadata.drip_days ?? metadata.unlock_days,
  );
  if (release === null || release < 0) return null;
  return release;
};

const getDripMode = (courseMetadata: JsonObject): "sequential" | "date" | "none" => {
  const raw = courseMetadata.drip_mode;
  if (raw === "none") return "none";
  if (raw === "date") return "date";
  return "sequential";
};

export const sortLessonsForDelivery = (lessons: LessonWithOrder[]): LessonWithOrder[] => {
  return [...lessons].sort((a, b) => {
    if (a.module_position !== b.module_position) return a.module_position - b.module_position;
    if (a.lesson_position !== b.lesson_position) return a.lesson_position - b.lesson_position;
    return a.id.localeCompare(b.id);
  });
};

export const calculateLessonUnlockStates = (params: {
  lessons: LessonWithOrder[];
  progressRows: ProgressRow[];
  enrollmentDate: string;
  courseMetadata: JsonObject;
  now?: Date;
}): LessonUnlockState[] => {
  const { lessons, progressRows, enrollmentDate, courseMetadata } = params;
  const now = params.now ?? new Date();

  const sorted = sortLessonsForDelivery(lessons);
  const completedSet = asCompletedSet(progressRows);
  const dripMode = getDripMode(asJsonObject(courseMetadata));
  const enrollmentAt = toDate(enrollmentDate);

  const states: LessonUnlockState[] = [];
  let previousLessonId: string | null = null;

  for (const lesson of sorted) {
    const metadata = asJsonObject(lesson.metadata);
    const releaseDays = getReleaseDays(metadata);
    const availableAtDate =
      releaseDays === null
        ? null
        : new Date(enrollmentAt.getTime() + releaseDays * 24 * 60 * 60 * 1000);

    const dateUnlocked =
      dripMode === "none" || !availableAtDate || now.getTime() >= availableAtDate.getTime();

    const sequentialUnlocked =
      dripMode !== "sequential" || !previousLessonId || completedSet.has(previousLessonId);

    const isUnlocked = dateUnlocked && sequentialUnlocked;
    const reason = !dateUnlocked ? "drip_date_locked" : !sequentialUnlocked ? "sequential_locked" : null;

    states.push({
      lessonId: lesson.id,
      isUnlocked,
      availableAt: availableAtDate ? availableAtDate.toISOString() : null,
      reason,
    });

    previousLessonId = lesson.id;
  }

  return states;
};

export const getResumeLessonId = (
  lessons: LessonWithOrder[],
  unlockStates: LessonUnlockState[],
  progressRows: ProgressRow[],
): string | null => {
  const ordered = sortLessonsForDelivery(lessons);
  const unlockedMap = new Map(unlockStates.map((state) => [state.lessonId, state.isUnlocked]));
  const progressMap = new Map(
    progressRows.map((row) => [row.lesson_id, row.completed_at || row.percent_complete >= 100]),
  );

  for (const lesson of ordered) {
    if (!unlockedMap.get(lesson.id)) continue;
    if (!progressMap.get(lesson.id)) return lesson.id;
  }

  return ordered[0]?.id ?? null;
};
