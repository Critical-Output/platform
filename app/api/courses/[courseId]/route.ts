import { asViewerAuthError, requireInstructor, resolveViewerFromHeaders } from "@/lib/courses/auth";
import {
  archiveCourse,
  getEnrollmentForCourse,
  getCourseById,
  getVisibleCourseIds,
  listLessonsByModule,
  listModulesByCourse,
  setCourseVisibility,
  updateCourse,
} from "@/lib/courses/data";
import { jsonError, jsonOk, parseRequestBody } from "@/lib/courses/http";
import { asJsonObject, normalizeInteger, normalizeText, toResponseError } from "@/lib/courses/utils";

export const runtime = "nodejs";

type RouteParams = {
  params: {
    courseId: string;
  };
};

type CourseGetRouteDeps = {
  resolveViewerFromHeaders: typeof resolveViewerFromHeaders;
  getCourseById: typeof getCourseById;
  getVisibleCourseIds: typeof getVisibleCourseIds;
  getEnrollmentForCourse: typeof getEnrollmentForCourse;
  listModulesByCourse: typeof listModulesByCourse;
  listLessonsByModule: typeof listLessonsByModule;
};

const courseGetRouteDeps: CourseGetRouteDeps = {
  resolveViewerFromHeaders,
  getCourseById,
  getVisibleCourseIds,
  getEnrollmentForCourse,
  listModulesByCourse,
  listLessonsByModule,
};

const toCatalogSafeLesson = (lesson: Awaited<ReturnType<typeof listLessonsByModule>>[number]) => ({
  ...lesson,
  content: null,
  video_url: null,
  metadata: {},
});

export async function GET(
  request: Request,
  { params }: RouteParams,
  deps: CourseGetRouteDeps = courseGetRouteDeps,
) {
  try {
    const viewer = await deps.resolveViewerFromHeaders(new Headers(request.headers));
    const requestUrl = new URL(request.url);
    const includeArchived = requestUrl.searchParams.get("include_archived") === "true" && viewer.isInstructor;

    const [course, visibleSet] = await Promise.all([
      deps.getCourseById(viewer.brandId, params.courseId, { includeArchived }),
      deps.getVisibleCourseIds(viewer.brandId),
    ]);

    if (!course) {
      return jsonError("Course not found.", 404);
    }

    const isVisible = visibleSet.has(course.id);
    if (!viewer.isInstructor && !isVisible) {
      return jsonError("Course not found.", 404);
    }

    let canViewLessonContent = viewer.isInstructor;
    if (!canViewLessonContent && viewer.customerId) {
      const enrollment = await deps.getEnrollmentForCourse(viewer.brandId, viewer.customerId, course.id);
      canViewLessonContent = Boolean(enrollment);
    }

    const modules = await deps.listModulesByCourse(viewer.brandId, course.id);
    const lessonsByModule = new Map<string, Awaited<ReturnType<typeof listLessonsByModule>>>();

    await Promise.all(
      modules.map(async (module) => {
        const lessons = await deps.listLessonsByModule(viewer.brandId, module.id);
        lessonsByModule.set(module.id, canViewLessonContent ? lessons : lessons.map(toCatalogSafeLesson));
      }),
    );

    return jsonOk({
      course: {
        ...course,
        is_visible: isVisible,
        modules: modules.map((module) => ({
          ...module,
          lessons: lessonsByModule.get(module.id) ?? [],
        })),
      },
    });
  } catch (error) {
    const authError = asViewerAuthError(error);
    return jsonError(authError.message, authError.status);
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const viewer = await resolveViewerFromHeaders(new Headers(request.headers));
    requireInstructor(viewer);

    const existing = await getCourseById(viewer.brandId, params.courseId);
    if (!existing) return jsonError("Course not found.", 404);

    const body = await parseRequestBody(request);
    const patch: {
      title?: string;
      description?: string | null;
      level?: string | null;
      duration_minutes?: number | null;
      metadata?: Record<string, unknown>;
    } = {};

    if (Object.hasOwn(body, "title")) {
      const title = normalizeText(body.title);
      if (!title) return jsonError("`title` cannot be empty.", 400);
      patch.title = title;
    }
    if (Object.hasOwn(body, "description")) patch.description = normalizeText(body.description);
    if (Object.hasOwn(body, "level")) patch.level = normalizeText(body.level);
    if (Object.hasOwn(body, "duration_minutes")) {
      patch.duration_minutes = normalizeInteger(body.duration_minutes);
    }
    if (Object.hasOwn(body, "metadata")) {
      patch.metadata = asJsonObject(body.metadata);
    }

    const course =
      Object.keys(patch).length > 0
        ? await updateCourse({
            brandId: viewer.brandId,
            courseId: params.courseId,
            patch,
          })
        : existing;

    if (Object.hasOwn(body, "is_visible")) {
      await setCourseVisibility(
        viewer.brandId,
        params.courseId,
        body.is_visible === true || body.is_visible === "true" || body.is_visible === 1,
      );
    }

    const visibleSet = await getVisibleCourseIds(viewer.brandId);
    return jsonOk({
      course: {
        ...course,
        is_visible: visibleSet.has(course.id),
      },
    });
  } catch (error) {
    const authError = asViewerAuthError(error);
    return jsonError(toResponseError(error, authError.message), authError.status);
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const viewer = await resolveViewerFromHeaders(new Headers(request.headers));
    requireInstructor(viewer);

    const existing = await getCourseById(viewer.brandId, params.courseId);
    if (!existing) return jsonError("Course not found.", 404);

    await archiveCourse(viewer.brandId, params.courseId);
    return jsonOk({ archived: true });
  } catch (error) {
    const authError = asViewerAuthError(error);
    return jsonError(toResponseError(error, authError.message), authError.status);
  }
}
