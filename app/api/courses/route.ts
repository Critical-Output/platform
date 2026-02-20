import { asViewerAuthError, requireInstructor, resolveViewerFromHeaders } from "@/lib/courses/auth";
import { createCourse, getVisibleCourseIds, listCoursesByBrand } from "@/lib/courses/data";
import { jsonError, jsonOk, parseRequestBody } from "@/lib/courses/http";
import { asJsonObject, normalizeInteger, normalizeText, toResponseError } from "@/lib/courses/utils";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const viewer = await resolveViewerFromHeaders(new Headers(request.headers));
    const requestUrl = new URL(request.url);
    const includeArchived = requestUrl.searchParams.get("include_archived") === "true" && viewer.isInstructor;
    const visibleOnly = requestUrl.searchParams.get("visible_only") !== "false";

    const [courses, visibleSet] = await Promise.all([
      listCoursesByBrand(viewer.brandId, { includeArchived }),
      getVisibleCourseIds(viewer.brandId),
    ]);

    const filtered = courses.filter((course) => {
      if (!viewer.isInstructor || visibleOnly) return visibleSet.has(course.id);
      return true;
    });

    return jsonOk({
      courses: filtered.map((course) => ({
        ...course,
        is_visible: visibleSet.has(course.id),
      })),
    });
  } catch (error) {
    const authError = asViewerAuthError(error);
    return jsonError(authError.message, authError.status);
  }
}

export async function POST(request: Request) {
  try {
    const viewer = await resolveViewerFromHeaders(new Headers(request.headers));
    requireInstructor(viewer);

    const body = await parseRequestBody(request);
    const title = normalizeText(body.title);
    if (!title) {
      return jsonError("`title` is required.", 400);
    }

    const course = await createCourse({
      brandId: viewer.brandId,
      title,
      description: normalizeText(body.description),
      level: normalizeText(body.level),
      durationMinutes: normalizeInteger(body.duration_minutes),
      metadata: asJsonObject(body.metadata),
      visible: body.is_visible !== false && body.is_visible !== "false",
    });

    return jsonOk({ course }, 201);
  } catch (error) {
    const authError = asViewerAuthError(error);
    return jsonError(toResponseError(error, authError.message), authError.status);
  }
}
