import { asViewerAuthError, requireInstructor, resolveViewerFromHeaders } from "@/lib/courses/auth";
import {
  archiveModule,
  getCourseById,
  getEnrollmentForCourse,
  getModuleById,
  getVisibleCourseIds,
  updateModule,
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

type ModuleGetRouteDeps = {
  resolveViewerFromHeaders: typeof resolveViewerFromHeaders;
  getCourseById: typeof getCourseById;
  getModuleById: typeof getModuleById;
  getVisibleCourseIds: typeof getVisibleCourseIds;
  getEnrollmentForCourse: typeof getEnrollmentForCourse;
};

const moduleGetRouteDeps: ModuleGetRouteDeps = {
  resolveViewerFromHeaders,
  getCourseById,
  getModuleById,
  getVisibleCourseIds,
  getEnrollmentForCourse,
};

export async function GET(
  request: Request,
  { params }: RouteParams,
  deps: ModuleGetRouteDeps = moduleGetRouteDeps,
) {
  try {
    const viewer = await deps.resolveViewerFromHeaders(new Headers(request.headers));
    const course = await deps.getCourseById(viewer.brandId, params.courseId);
    if (!course) return jsonError("Course not found.", 404);

    const courseModule = await deps.getModuleById(viewer.brandId, params.courseId, params.moduleId);
    if (!courseModule) return jsonError("Module not found.", 404);

    if (!viewer.isInstructor) {
      const visibleSet = await deps.getVisibleCourseIds(viewer.brandId);
      if (!visibleSet.has(params.courseId)) {
        return jsonError("Module not found.", 404);
      }

      if (!viewer.customerId) {
        return jsonError("Enrollment required.", 403);
      }

      const enrollment = await deps.getEnrollmentForCourse(viewer.brandId, viewer.customerId, params.courseId);
      if (!enrollment) {
        return jsonError("Enrollment required.", 403);
      }
    }

    return jsonOk({ module: courseModule });
  } catch (error) {
    const authError = asViewerAuthError(error);
    return jsonError(authError.message, authError.status);
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const viewer = await resolveViewerFromHeaders(new Headers(request.headers));
    requireInstructor(viewer);

    const courseModule = await getModuleById(viewer.brandId, params.courseId, params.moduleId);
    if (!courseModule) return jsonError("Module not found.", 404);

    const body = await parseRequestBody(request);
    const patch: {
      title?: string;
      position?: number;
      metadata?: Record<string, unknown>;
    } = {};

    if (Object.hasOwn(body, "title")) {
      const title = normalizeText(body.title);
      if (!title) return jsonError("`title` cannot be empty.", 400);
      patch.title = title;
    }
    if (Object.hasOwn(body, "position")) {
      patch.position = normalizeInteger(body.position) ?? 0;
    }
    if (Object.hasOwn(body, "metadata")) {
      patch.metadata = asJsonObject(body.metadata);
    }

    const updated =
      Object.keys(patch).length > 0
        ? await updateModule({
            brandId: viewer.brandId,
            courseId: params.courseId,
            moduleId: params.moduleId,
            patch,
          })
        : courseModule;

    return jsonOk({ module: updated });
  } catch (error) {
    const authError = asViewerAuthError(error);
    return jsonError(toResponseError(error, authError.message), authError.status);
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const viewer = await resolveViewerFromHeaders(new Headers(request.headers));
    requireInstructor(viewer);

    const courseModule = await getModuleById(viewer.brandId, params.courseId, params.moduleId);
    if (!courseModule) return jsonError("Module not found.", 404);

    await archiveModule(viewer.brandId, params.courseId, params.moduleId);
    return jsonOk({ archived: true });
  } catch (error) {
    const authError = asViewerAuthError(error);
    return jsonError(toResponseError(error, authError.message), authError.status);
  }
}
