import { asViewerAuthError, ensureCustomerForViewer, resolveViewerFromHeaders } from "@/lib/courses/auth";
import {
  getCourseById,
  getEnrollmentForCourse,
  getProgressForLesson,
  insertProgress,
  listOrderedLessonsForCourse,
  listProgressForEnrollment,
  markEnrollmentCompletionState,
  updateProgress,
} from "@/lib/courses/data";
import { calculateLessonUnlockStates } from "@/lib/courses/drip";
import { jsonError, jsonOk, parseRequestBody } from "@/lib/courses/http";
import {
  calculateCoursePercent,
  getCompletedLessonIds,
  mergeProgressMetadata,
  normalizeProgressInput,
  shouldMarkLessonCompleted,
} from "@/lib/courses/progress";
import { toResponseError } from "@/lib/courses/utils";

export const runtime = "nodejs";

type RouteParams = {
  params: {
    courseId: string;
    lessonId: string;
  };
};

const lessonLockedMessage = "Lesson is locked by drip schedule.";

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const viewer = await resolveViewerFromHeaders(new Headers(request.headers));
    const customerId = await ensureCustomerForViewer(viewer);

    const enrollment = await getEnrollmentForCourse(viewer.brandId, customerId, params.courseId);
    if (!enrollment) {
      return jsonError("Enrollment required.", 403);
    }

    const progress = await getProgressForLesson(enrollment.id, params.lessonId);
    return jsonOk({ progress });
  } catch (error) {
    const authError = asViewerAuthError(error);
    return jsonError(toResponseError(error, authError.message), authError.status);
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const viewer = await resolveViewerFromHeaders(new Headers(request.headers));
    const customerId = await ensureCustomerForViewer(viewer);

    const [course, enrollment, body] = await Promise.all([
      getCourseById(viewer.brandId, params.courseId),
      getEnrollmentForCourse(viewer.brandId, customerId, params.courseId),
      parseRequestBody(request),
    ]);

    if (!course || !enrollment) {
      return jsonError("Enrollment required.", 403);
    }

    const lessons = await listOrderedLessonsForCourse(viewer.brandId, params.courseId);
    const targetLesson = lessons.find((lesson) => lesson.id === params.lessonId);
    if (!targetLesson) {
      return jsonError("Lesson not found in this course.", 404);
    }

    const existingProgressRows = await listProgressForEnrollment(enrollment.id);
    const unlockStates = calculateLessonUnlockStates({
      lessons: lessons.map((lesson) => ({
        id: lesson.id,
        module_position: lesson.module_position,
        lesson_position: lesson.position,
        metadata: lesson.metadata,
      })),
      progressRows: existingProgressRows,
      enrollmentDate: enrollment.enrolled_at,
      courseMetadata: course.metadata,
    });

    const unlock = unlockStates.find((state) => state.lessonId === params.lessonId);
    if (!unlock?.isUnlocked) {
      return jsonError(lessonLockedMessage, 423);
    }

    const parsed = normalizeProgressInput(body);
    const existing = await getProgressForLesson(enrollment.id, params.lessonId);
    const metadata = mergeProgressMetadata(existing?.metadata ?? {}, {
      lastPositionSeconds: parsed.lastPositionSeconds,
      watchTimeSeconds: parsed.watchTimeSeconds,
      completionSource: parsed.completionSource,
    });

    const alreadyComplete = Boolean(existing?.completed_at || (existing?.percent_complete ?? 0) >= 100);
    const nextIsComplete =
      alreadyComplete ||
      shouldMarkLessonCompleted(parsed.percentComplete, parsed.completionSource, parsed.markComplete);

    const completedAt = nextIsComplete ? existing?.completed_at ?? new Date().toISOString() : null;

    const progress = existing
      ? await updateProgress({
          progressId: existing.id,
          percentComplete: Math.max(parsed.percentComplete, existing.percent_complete),
          completedAt,
          metadata,
        })
      : await insertProgress({
          brandId: viewer.brandId,
          enrollmentId: enrollment.id,
          lessonId: params.lessonId,
          percentComplete: parsed.percentComplete,
          completedAt,
          metadata,
        });

    const nextProgressRows = await listProgressForEnrollment(enrollment.id);
    const lessonIds = lessons.map((lesson) => lesson.id);
    const completedLessonIds = getCompletedLessonIds(nextProgressRows);
    const coursePercent = calculateCoursePercent(lessonIds, nextProgressRows);
    const isCourseCompleted = lessonIds.length > 0 && completedLessonIds.size >= lessonIds.length;

    await markEnrollmentCompletionState({
      enrollmentId: enrollment.id,
      isCompleted: isCourseCompleted,
    });

    return jsonOk({
      progress,
      course_progress_percent: coursePercent,
      completed_lessons: completedLessonIds.size,
      total_lessons: lessonIds.length,
      course_completed: isCourseCompleted,
    });
  } catch (error) {
    const authError = asViewerAuthError(error);
    return jsonError(toResponseError(error, authError.message), authError.status);
  }
}
