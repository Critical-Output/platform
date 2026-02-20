import { asViewerAuthError, resolveViewerFromHeaders } from "@/lib/courses/auth";
import { loadStudentDashboard } from "@/lib/courses/dashboard";
import { jsonError, jsonOk } from "@/lib/courses/http";
import { toResponseError } from "@/lib/courses/utils";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const viewer = await resolveViewerFromHeaders(new Headers(request.headers));
    const dashboard = await loadStudentDashboard(viewer);
    return jsonOk({ dashboard });
  } catch (error) {
    const authError = asViewerAuthError(error);
    return jsonError(toResponseError(error, authError.message), authError.status);
  }
}
