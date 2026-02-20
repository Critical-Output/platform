import { asViewerAuthError, ensureCustomerForViewer, resolveViewerFromHeaders } from "@/lib/courses/auth";
import { createEnrollment, getCourseById, getVisibleCourseIds } from "@/lib/courses/data";
import { jsonError, jsonOk, parseRequestBody } from "@/lib/courses/http";
import { asJsonObject, toResponseError } from "@/lib/courses/utils";

export const runtime = "nodejs";

type RouteParams = {
  params: {
    courseId: string;
  };
};

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const viewer = await resolveViewerFromHeaders(new Headers(request.headers));
    const [course, visibleSet] = await Promise.all([
      getCourseById(viewer.brandId, params.courseId),
      getVisibleCourseIds(viewer.brandId),
    ]);

    if (!course || !visibleSet.has(params.courseId)) {
      return jsonError("Course not available for enrollment.", 404);
    }

    const body = await parseRequestBody(request);
    const customerId = await ensureCustomerForViewer(viewer);

    const enrollment = await createEnrollment({
      brandId: viewer.brandId,
      customerId,
      courseId: params.courseId,
      metadata: asJsonObject(body.metadata),
    });

    return jsonOk({ enrollment }, 201);
  } catch (error) {
    const authError = asViewerAuthError(error);
    return jsonError(toResponseError(error, authError.message), authError.status);
  }
}
