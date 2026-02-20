import { asViewerAuthError, requireInstructor, resolveViewerFromHeaders } from "@/lib/courses/auth";
import { createModule, getCourseById, getVisibleCourseIds, listModulesByCourse } from "@/lib/courses/data";
import { jsonError, jsonOk, parseRequestBody } from "@/lib/courses/http";
import { asJsonObject, normalizeInteger, normalizeText, toResponseError } from "@/lib/courses/utils";

export const runtime = "nodejs";

type RouteParams = {
  params: {
    courseId: string;
  };
};

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const viewer = await resolveViewerFromHeaders(new Headers(request.headers));

    const [course, visibleSet] = await Promise.all([
      getCourseById(viewer.brandId, params.courseId),
      getVisibleCourseIds(viewer.brandId),
    ]);

    if (!course) return jsonError("Course not found.", 404);
    if (!viewer.isInstructor && !visibleSet.has(params.courseId)) {
      return jsonError("Course not found.", 404);
    }

    const modules = await listModulesByCourse(viewer.brandId, params.courseId);
    return jsonOk({ modules });
  } catch (error) {
    const authError = asViewerAuthError(error);
    return jsonError(authError.message, authError.status);
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const viewer = await resolveViewerFromHeaders(new Headers(request.headers));
    requireInstructor(viewer);

    const course = await getCourseById(viewer.brandId, params.courseId);
    if (!course) return jsonError("Course not found.", 404);

    const body = await parseRequestBody(request);
    const title = normalizeText(body.title);
    if (!title) return jsonError("`title` is required.", 400);

    const courseModule = await createModule({
      brandId: viewer.brandId,
      courseId: params.courseId,
      title,
      position: normalizeInteger(body.position) ?? 0,
      metadata: asJsonObject(body.metadata),
    });

    return jsonOk({ module: courseModule }, 201);
  } catch (error) {
    const authError = asViewerAuthError(error);
    return jsonError(toResponseError(error, authError.message), authError.status);
  }
}
