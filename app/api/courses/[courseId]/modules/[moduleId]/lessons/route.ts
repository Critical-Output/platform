import { asViewerAuthError, requireInstructor, resolveViewerFromHeaders } from "@/lib/courses/auth";
import {
  createLesson,
  getCourseById,
  getEnrollmentForCourse,
  getModuleById,
  getVisibleCourseIds,
  listLessonsByModule,
} from "@/lib/courses/data";
import { jsonError, jsonOk, parseRequestBody } from "@/lib/courses/http";
import { asJsonObject, normalizeInteger, normalizeText, toResponseError } from "@/lib/courses/utils";

export const runtime = "nodejs";

type RouteParams = {
  params: {
    courseId: string;
    moduleId: string;
  };
};

type ModuleLessonsGetRouteDeps = {
  resolveViewerFromHeaders: typeof resolveViewerFromHeaders;
  getCourseById: typeof getCourseById;
  getModuleById: typeof getModuleById;
  getVisibleCourseIds: typeof getVisibleCourseIds;
  getEnrollmentForCourse: typeof getEnrollmentForCourse;
  listLessonsByModule: typeof listLessonsByModule;
};

const moduleLessonsGetRouteDeps: ModuleLessonsGetRouteDeps = {
  resolveViewerFromHeaders,
  getCourseById,
  getModuleById,
  getVisibleCourseIds,
  getEnrollmentForCourse,
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
  deps: ModuleLessonsGetRouteDeps = moduleLessonsGetRouteDeps,
) {
  try {
    const viewer = await deps.resolveViewerFromHeaders(new Headers(request.headers));
    const [course, module, visibleSet] = await Promise.all([
      deps.getCourseById(viewer.brandId, params.courseId),
      deps.getModuleById(viewer.brandId, params.courseId, params.moduleId),
      deps.getVisibleCourseIds(viewer.brandId),
    ]);

    if (!course || !module) return jsonError("Course module not found.", 404);
    if (!viewer.isInstructor && !visibleSet.has(params.courseId)) {
      return jsonError("Course module not found.", 404);
    }

    let canViewLessonContent = viewer.isInstructor;
    if (!canViewLessonContent && viewer.customerId) {
      const enrollment = await deps.getEnrollmentForCourse(viewer.brandId, viewer.customerId, params.courseId);
      canViewLessonContent = Boolean(enrollment);
    }

    const lessons = await deps.listLessonsByModule(viewer.brandId, module.id);
    return jsonOk({
      lessons: canViewLessonContent ? lessons : lessons.map(toCatalogSafeLesson),
    });
  } catch (error) {
    const authError = asViewerAuthError(error);
    return jsonError(authError.message, authError.status);
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const viewer = await resolveViewerFromHeaders(new Headers(request.headers));
    requireInstructor(viewer);

    const [course, module] = await Promise.all([
      getCourseById(viewer.brandId, params.courseId),
      getModuleById(viewer.brandId, params.courseId, params.moduleId),
    ]);

    if (!course || !module) return jsonError("Course module not found.", 404);

    const body = await parseRequestBody(request);
    const title = normalizeText(body.title);
    if (!title) return jsonError("`title` is required.", 400);

    const lesson = await createLesson({
      brandId: viewer.brandId,
      moduleId: params.moduleId,
      title,
      content: normalizeText(body.content),
      video_url: normalizeText(body.video_url),
      duration_minutes: normalizeInteger(body.duration_minutes),
      position: normalizeInteger(body.position) ?? 0,
      metadata: asJsonObject(body.metadata),
    });

    return jsonOk({ lesson }, 201);
  } catch (error) {
    const authError = asViewerAuthError(error);
    return jsonError(toResponseError(error, authError.message), authError.status);
  }
}
