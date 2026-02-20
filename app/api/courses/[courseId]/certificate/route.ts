import { asViewerAuthError, ensureCustomerForViewer, resolveViewerFromHeaders } from "@/lib/courses/auth";
import { buildCertificatePdf, generateCertificateCode, getCertificateCode } from "@/lib/courses/certificates";
import {
  getCertificateForCustomerCourse,
  getCourseById,
  getCustomerById,
  getEnrollmentForCourse,
  insertCertificate,
  listOrderedLessonsForCourse,
  listProgressForEnrollment,
} from "@/lib/courses/data";
import { jsonError, jsonOk } from "@/lib/courses/http";
import { getCompletedLessonIds } from "@/lib/courses/progress";
import { toResponseError } from "@/lib/courses/utils";

export const runtime = "nodejs";

type RouteParams = {
  params: {
    courseId: string;
  };
};

const isCertificateCodeConflictError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("duplicate key value") ||
    message.includes("unique constraint") ||
    message.includes("23505") ||
    message.includes("certificates_active_certificate_number_unique")
  );
};

const insertCertificateWithRetries = async (params: {
  brandId: string;
  customerId: string;
  courseId: string;
}): Promise<Awaited<ReturnType<typeof insertCertificate>>> => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = generateCertificateCode();
    try {
      return await insertCertificate({
        brandId: params.brandId,
        customerId: params.customerId,
        courseId: params.courseId,
        certificateNumber: code,
      });
    } catch (error) {
      if (isCertificateCodeConflictError(error)) continue;
      throw error;
    }
  }

  throw new Error("Unable to generate a unique certificate code.");
};

const buildStudentName = (customer: Awaited<ReturnType<typeof getCustomerById>>): string => {
  if (!customer) return "Student";
  const fullName = [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim();
  if (fullName) return fullName;
  return customer.email ?? "Student";
};

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const viewer = await resolveViewerFromHeaders(new Headers(request.headers));
    const customerId = await ensureCustomerForViewer(viewer);

    const [course, enrollment] = await Promise.all([
      getCourseById(viewer.brandId, params.courseId),
      getEnrollmentForCourse(viewer.brandId, customerId, params.courseId),
    ]);

    if (!course || !enrollment) {
      return jsonError("Enrollment required.", 403);
    }

    const [lessons, progressRows] = await Promise.all([
      listOrderedLessonsForCourse(viewer.brandId, params.courseId),
      listProgressForEnrollment(enrollment.id),
    ]);

    if (!lessons.length) {
      return jsonError("Cannot issue certificate until the course has lessons.", 409);
    }

    const completed = getCompletedLessonIds(progressRows);
    const lessonIds = lessons.map((lesson) => lesson.id);
    const allComplete = lessonIds.every((lessonId) => completed.has(lessonId));
    if (!allComplete) {
      return jsonError("Course completion is required before issuing a certificate.", 409);
    }

    let certificate = await getCertificateForCustomerCourse(viewer.brandId, customerId, params.courseId);
    if (!certificate) {
      certificate = await insertCertificateWithRetries({
        brandId: viewer.brandId,
        customerId,
        courseId: params.courseId,
      });
    }

    const code = getCertificateCode(certificate);
    if (!code) {
      return jsonError("Certificate does not contain a verification code.", 500);
    }

    const customer = await getCustomerById(viewer.brandId, customerId);
    const studentName = buildStudentName(customer);

    const pdf = buildCertificatePdf({
      studentName,
      courseTitle: course.title,
      issuedAt: certificate.issued_at,
      verificationCode: code,
      brandName: viewer.brandName,
    });

    const requestUrl = new URL(request.url);
    if (requestUrl.searchParams.get("format") === "json") {
      return jsonOk({
        certificate: {
          id: certificate.id,
          course_id: certificate.course_id,
          certificate_number: code,
          issued_at: certificate.issued_at,
        },
      });
    }

    return new Response(Buffer.from(pdf), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename=\"certificate-${params.courseId}.pdf\"`,
        "x-certificate-code": code,
      },
    });
  } catch (error) {
    const authError = asViewerAuthError(error);
    return jsonError(toResponseError(error, authError.message), authError.status);
  }
}
