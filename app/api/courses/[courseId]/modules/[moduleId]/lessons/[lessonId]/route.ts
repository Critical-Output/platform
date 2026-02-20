import { asViewerAuthError, requireInstructor, resolveViewerFromHeaders } from "@/lib/courses/auth";
import {
  archiveLesson,
  getCourseById,
  getEnrollmentForCourse,
  getLessonById,
  getModuleById,
  listOrderedLessonsForCourse,
  listProgressForEnrollment,
  updateLesson,
} from "@/lib/courses/data";
import { calculateLessonUnlockStates } from "@/lib/courses/drip";
import { jsonError, jsonOk, parseRequestBody } from "@/lib/courses/http";
import { asJsonObject, normalizeInteger, normalizeText, toResponseError } from "@/lib/courses/utils";

export const runtime = "nodejs";

type RouteParams = {
  params: {
    courseId: string;
    moduleId: string;
    lessonId: string;
  };
};

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const viewer = await resolveViewerFromHeaders(new Headers(request.headers));
    const [course, module, lesson] = await Promise.all([
      getCourseById(viewer.brandId, params.courseId),
      getModuleById(viewer.brandId, params.courseId, params.moduleId),
      getLessonById(viewer.brandId, params.moduleId, params.lessonId),
    ]);

    if (!course || !module || !lesson) {
      return jsonError("Lesson not found.", 404);
    }

    if (viewer.isInstructor) {
      return jsonOk({ lesson });
    }

    if (!viewer.customerId) {
      return jsonError("Enrollment required.", 403);
    }

    const enrollment = await getEnrollmentForCourse(viewer.brandId, viewer.customerId, params.courseId);
    if (!enrollment) {
      return jsonError("Enrollment required.", 403);
    }

    const [lessons, progressRows] = await Promise.all([
      listOrderedLessonsForCourse(viewer.brandId, params.courseId),
      listProgressForEnrollment(enrollment.id),
    ]);

    const unlockStates = calculateLessonUnlockStates({
      lessons: lessons.map((row) => ({
        id: row.id,
        module_position: row.module_position,
        lesson_position: row.position,
        metadata: row.metadata,
      })),
      progressRows,
      enrollmentDate: enrollment.enrolled_at,
      courseMetadata: course.metadata,
    });

    const unlock = unlockStates.find((state) => state.lessonId === params.lessonId);
    if (!unlock?.isUnlocked) {
      return jsonError("Lesson is locked by drip schedule.", 423);
    }

    const progress = progressRows.find((row) => row.lesson_id === params.lessonId) ?? null;
    return jsonOk({ lesson, unlock, progress });
  } catch (error) {
    const authError = asViewerAuthError(error);
    return jsonError(authError.message, authError.status);
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const viewer = await resolveViewerFromHeaders(new Headers(request.headers));
    requireInstructor(viewer);

    const [course, module, lesson] = await Promise.all([
      getCourseById(viewer.brandId, params.courseId),
      getModuleById(viewer.brandId, params.courseId, params.moduleId),
      getLessonById(viewer.brandId, params.moduleId, params.lessonId),
    ]);

    if (!course || !module || !lesson) return jsonError("Lesson not found.", 404);

    const body = await parseRequestBody(request);
    const patch: {
      title?: string;
      content?: string | null;
      video_url?: string | null;
      duration_minutes?: number | null;
      position?: number;
      metadata?: Record<string, unknown>;
    } = {};

    if (Object.hasOwn(body, "title")) {
      const title = normalizeText(body.title);
      if (!title) return jsonError("`title` cannot be empty.", 400);
      patch.title = title;
    }
    if (Object.hasOwn(body, "content")) patch.content = normalizeText(body.content);
    if (Object.hasOwn(body, "video_url")) patch.video_url = normalizeText(body.video_url);
    if (Object.hasOwn(body, "duration_minutes")) {
      patch.duration_minutes = normalizeInteger(body.duration_minutes);
    }
    if (Object.hasOwn(body, "position")) patch.position = normalizeInteger(body.position) ?? 0;
    if (Object.hasOwn(body, "metadata")) patch.metadata = asJsonObject(body.metadata);

    const updated =
      Object.keys(patch).length > 0
        ? await updateLesson({
            brandId: viewer.brandId,
            moduleId: params.moduleId,
            lessonId: params.lessonId,
            patch,
          })
        : lesson;

    return jsonOk({ lesson: updated });
  } catch (error) {
    const authError = asViewerAuthError(error);
    return jsonError(toResponseError(error, authError.message), authError.status);
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const viewer = await resolveViewerFromHeaders(new Headers(request.headers));
    requireInstructor(viewer);

    const [course, module, lesson] = await Promise.all([
      getCourseById(viewer.brandId, params.courseId),
      getModuleById(viewer.brandId, params.courseId, params.moduleId),
      getLessonById(viewer.brandId, params.moduleId, params.lessonId),
    ]);

    if (!course || !module || !lesson) return jsonError("Lesson not found.", 404);

    await archiveLesson(viewer.brandId, params.moduleId, params.lessonId);
    return jsonOk({ archived: true });
  } catch (error) {
    const authError = asViewerAuthError(error);
    return jsonError(toResponseError(error, authError.message), authError.status);
  }
}
