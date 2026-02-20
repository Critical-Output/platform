import type { CompletionSource, JsonObject, ProgressRow } from "@/lib/courses/types";
import { asJsonObject, clamp, normalizeNumber } from "@/lib/courses/utils";

export const getCompletedLessonIds = (progressRows: ProgressRow[]): Set<string> => {
  return new Set(
    progressRows
      .filter((row) => row.completed_at || row.percent_complete >= 100)
      .map((row) => row.lesson_id),
  );
};

export const calculateCoursePercent = (lessonIds: string[], progressRows: ProgressRow[]): number => {
  if (!lessonIds.length) return 0;
  const completed = getCompletedLessonIds(progressRows);
  return Math.round((completed.size / lessonIds.length) * 100);
};

export const shouldMarkLessonCompleted = (
  percentComplete: number,
  completionSource: CompletionSource | null,
  markComplete: boolean,
): boolean => {
  if (markComplete) return true;
  if (percentComplete >= 100) return true;
  if (completionSource === "manual") return true;
  if (completionSource === "quiz-pass") return true;
  if (completionSource === "time-based" && percentComplete >= 90) return true;
  return false;
};

export const normalizeProgressInput = (body: Record<string, unknown>) => {
  const percent = normalizeNumber(body.percent_complete) ?? 0;
  const boundedPercent = clamp(percent, 0, 100);

  const completionSourceRaw = body.completion_source;
  const completionSource: CompletionSource | null =
    completionSourceRaw === "manual" ||
    completionSourceRaw === "time-based" ||
    completionSourceRaw === "quiz-pass"
      ? completionSourceRaw
      : null;

  const lastPositionSeconds = normalizeNumber(body.last_position_seconds);
  const watchTimeSeconds = normalizeNumber(body.watch_time_seconds);

  const markComplete = body.mark_complete === true || body.mark_complete === "true" || body.mark_complete === 1;

  return {
    percentComplete: boundedPercent,
    completionSource,
    lastPositionSeconds: lastPositionSeconds === null ? null : Math.max(lastPositionSeconds, 0),
    watchTimeSeconds: watchTimeSeconds === null ? null : Math.max(watchTimeSeconds, 0),
    markComplete,
  };
};

export const mergeProgressMetadata = (
  existingMetadata: unknown,
  updates: {
    lastPositionSeconds: number | null;
    watchTimeSeconds: number | null;
    completionSource: CompletionSource | null;
  },
): JsonObject => {
  const nextMetadata = asJsonObject(existingMetadata);

  if (updates.lastPositionSeconds !== null) {
    nextMetadata.last_position_seconds = updates.lastPositionSeconds;
  }
  if (updates.watchTimeSeconds !== null) {
    nextMetadata.watch_time_seconds = updates.watchTimeSeconds;
  }
  if (updates.completionSource) {
    nextMetadata.completion_source = updates.completionSource;
  }
  nextMetadata.last_progress_update_at = new Date().toISOString();

  return nextMetadata;
};
