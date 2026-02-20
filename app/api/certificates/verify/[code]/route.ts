import { resolveBrandSlugFromHeaders } from "@/lib/brands/resolve";
import {
  getBrandBySlug,
  getCertificateByNumber,
  getCourseById,
  getCustomerById,
} from "@/lib/courses/data";
import { jsonError, jsonOk } from "@/lib/courses/http";
import { normalizeText, toResponseError } from "@/lib/courses/utils";

export const runtime = "nodejs";

type RouteParams = {
  params: {
    code: string;
  };
};

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const code = normalizeText(params.code);
    if (!code) return jsonError("Certificate code is required.", 400);

    const brandSlug = resolveBrandSlugFromHeaders(new Headers(request.headers));
    if (!brandSlug) {
      return jsonError(
        "Brand configuration is missing. Set NEXT_PUBLIC_BRAND_SLUG or BRAND_DOMAIN_MAP.",
        500,
      );
    }

    const brand = await getBrandBySlug(brandSlug);
    if (!brand) return jsonError("Brand not found.", 404);

    const certificate = await getCertificateByNumber(brand.id, code);
    if (!certificate) {
      return jsonError("Certificate not found.", 404);
    }

    const [course, customer] = await Promise.all([
      getCourseById(brand.id, certificate.course_id, { includeArchived: true }),
      getCustomerById(brand.id, certificate.customer_id),
    ]);
    const studentName = [normalizeText(customer?.first_name), normalizeText(customer?.last_name)]
      .filter((value): value is string => Boolean(value))
      .join(" ")
      .trim();

    return jsonOk({
      verification: {
        valid: true,
        certificate_number: code,
        issued_at: certificate.issued_at,
        brand: {
          slug: brand.slug,
          name: brand.name,
        },
        course: {
          id: certificate.course_id,
          title: course?.title ?? null,
        },
        student: {
          name: studentName || null,
        },
      },
    });
  } catch (error) {
    return jsonError(toResponseError(error, "Unable to verify certificate."), 500);
  }
}
