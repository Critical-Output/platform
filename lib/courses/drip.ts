import type {
  EnrollmentRecord,
  JsonObject,
  LessonRecord,
  ModuleRecord,
  ProgressRecord,
} from "./types";

export type LessonUnlockState = {
  lessonId: string;
  unlocked: boolean;
  reason: "ok" | "waiting_for_schedule" | "waiting_for_previous_lesson";
  releaseAt: string | null;
};

type ModuleOrderRow = Pick<ModuleRecord, "id" | "position" | "created_at">;
type LessonOrderRow = Pick<LessonRecord, "id" | "module_id" | "position" | "created_at">;

export const buildModuleOrderById = <TModule extends ModuleOrderRow>(
  modules: TModule[],
): Map<string, number> => {
  const orderedModules = [...modules].sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;

    const createdAtCompare = a.created_at.localeCompare(b.created_at);
    if (createdAtCompare !== 0) return createdAtCompare;

    return a.id.localeCompare(b.id);
  });

  return new Map(orderedModules.map((module, index) => [module.id, index]));
};

const getObjectValue = (value: unknown): JsonObject | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonObject;
};

const getNumberFromUnknown = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const getBooleanFromUnknown = (value: unknown): boolean | null => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return null;
};

const getDaysAfterEnrollment = (metadata: JsonObject | null): number => {
  if (!metadata) return 0;

  const direct = getNumberFromUnknown(metadata.drip_days_after_enrollment);
  if (direct && direct > 0) return direct;

  const drip = getObjectValue(metadata.drip);
  if (!drip) return 0;

  const nested = getNumberFromUnknown(drip.days_after_enrollment);
  return nested && nested > 0 ? nested : 0;
};

const isSequentialRequired = (courseMetadata: JsonObject | null, lessonMetadata: JsonObject | null): boolean => {
  const lessonSequential = lessonMetadata
    ? getBooleanFromUnknown(getObjectValue(lessonMetadata.drip)?.sequential)
    : null;

  if (lessonSequential !== null) return lessonSequential;

  const courseMode = courseMetadata?.drip_mode;
  if (courseMode === "none") return false;
  return true;
};

const isLessonComplete = (lessonId: string, progressByLesson: Map<string, ProgressRecord>): boolean => {
  const row = progressByLesson.get(lessonId);
  if (!row) return false;
  if (row.completed_at) return true;
  return Number(row.percent_complete) >= 100;
};

export const sortLessonsForUnlock = <TLesson extends LessonOrderRow>(
  lessons: TLesson[],
  moduleOrderById: Map<string, number>,
): TLesson[] => {
  return [...lessons].sort((a, b) => {
    const moduleA = moduleOrderById.get(a.module_id) ?? Number.MAX_SAFE_INTEGER;
    const moduleB = moduleOrderById.get(b.module_id) ?? Number.MAX_SAFE_INTEGER;

    if (moduleA !== moduleB) return moduleA - moduleB;
    if (a.position !== b.position) return a.position - b.position;

    const createdAtCompare = a.created_at.localeCompare(b.created_at);
    if (createdAtCompare !== 0) return createdAtCompare;

    return a.id.localeCompare(b.id);
  });
};

export const buildLessonUnlockStates = (params: {
  lessons: LessonRecord[];
  moduleOrderById: Map<string, number>;
  enrollment: EnrollmentRecord | null;
  progressRows: ProgressRecord[];
  courseMetadata: JsonObject | null;
  now?: Date;
}): LessonUnlockState[] => {
  const {
    lessons,
    moduleOrderById,
    enrollment,
    progressRows,
    courseMetadata,
    now = new Date(),
  } = params;

  const orderedLessons = sortLessonsForUnlock(lessons, moduleOrderById);
  const progressByLesson = new Map(progressRows.map((row) => [row.lesson_id, row]));
  const unlocked: LessonUnlockState[] = [];

  for (const lesson of orderedLessons) {
    const lessonMetadata = getObjectValue(lesson.metadata);
    const daysAfterEnrollment = getDaysAfterEnrollment(lessonMetadata);

    let releaseAt: Date | null = null;
    if (enrollment && daysAfterEnrollment > 0) {
      const enrolledAt = new Date(enrollment.enrolled_at);
      if (!Number.isNaN(enrolledAt.getTime())) {
        releaseAt = new Date(enrolledAt.getTime() + daysAfterEnrollment * 24 * 60 * 60 * 1000);
      }
    }

    if (!enrollment) {
      unlocked.push({
        lessonId: lesson.id,
        unlocked: false,
        reason: "waiting_for_schedule",
        releaseAt: releaseAt ? releaseAt.toISOString() : null,
      });
      continue;
    }

    if (releaseAt && releaseAt.getTime() > now.getTime()) {
      unlocked.push({
        lessonId: lesson.id,
        unlocked: false,
        reason: "waiting_for_schedule",
        releaseAt: releaseAt.toISOString(),
      });
      continue;
    }

    const sequentialRequired = isSequentialRequired(courseMetadata, lessonMetadata);
    if (!sequentialRequired || unlocked.length === 0) {
      unlocked.push({
        lessonId: lesson.id,
        unlocked: true,
        reason: "ok",
        releaseAt: releaseAt ? releaseAt.toISOString() : null,
      });
      continue;
    }

    const previousLessonId = unlocked[unlocked.length - 1]?.lessonId;
    if (previousLessonId && !isLessonComplete(previousLessonId, progressByLesson)) {
      unlocked.push({
        lessonId: lesson.id,
        unlocked: false,
        reason: "waiting_for_previous_lesson",
        releaseAt: releaseAt ? releaseAt.toISOString() : null,
      });
      continue;
    }

    unlocked.push({
      lessonId: lesson.id,
      unlocked: true,
      reason: "ok",
      releaseAt: releaseAt ? releaseAt.toISOString() : null,
    });
  }

  return unlocked;
};
