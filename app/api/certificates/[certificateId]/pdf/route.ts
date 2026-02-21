import { NextResponse } from "next/server";

import {
  applyCertificateCourseLookupFilters,
  buildCertificatePdf,
  canAccessCertificatePdf,
} from "@/lib/courses/certificates";
import { handleCourseApiError } from "@/lib/courses/api";
import { getCourseRequestContext } from "@/lib/courses/context";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: { certificateId: string } },
) {
  try {
    const context = await getCourseRequestContext();

    const { data: certData, error: certError } = await context.supabase
      .from("certificates")
      .select("id,brand_id,customer_id,course_id,issued_at,certificate_number")
      .eq("id", params.certificateId)
      .eq("brand_id", context.brand.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (certError) {
      return NextResponse.json({ ok: false, error: certError.message }, { status: 500 });
    }

    if (!certData) {
      return NextResponse.json({ ok: false, error: "Certificate not found." }, { status: 404 });
    }

    const certificate = certData as {
      id: string;
      brand_id: string;
      customer_id: string;
      course_id: string;
      issued_at: string;
      certificate_number: string | null;
    };

    if (
      !canAccessCertificatePdf({
        isBrandAdmin: context.isBrandAdmin,
        customerId: context.customerId,
        certificateCustomerId: certificate.customer_id,
      })
    ) {
      return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });
    }

    const baseCourseQuery = context.supabase.from("courses").select("title");
    const courseQuery = applyCertificateCourseLookupFilters<typeof baseCourseQuery>(
      baseCourseQuery,
      certificate.course_id,
    );
    const { data: courseData, error: courseError } = await courseQuery.maybeSingle();

    if (courseError) {
      return NextResponse.json({ ok: false, error: courseError.message }, { status: 500 });
    }

    const { data: customerData, error: customerError } = await context.supabase
      .from("customers")
      .select("first_name,last_name,email")
      .eq("id", certificate.customer_id)
      .eq("brand_id", certificate.brand_id)
      .is("deleted_at", null)
      .maybeSingle();

    if (customerError) {
      return NextResponse.json({ ok: false, error: customerError.message }, { status: 500 });
    }

    const fullName = [
      (customerData as { first_name?: string | null } | null)?.first_name ?? null,
      (customerData as { last_name?: string | null } | null)?.last_name ?? null,
    ]
      .filter(Boolean)
      .join(" ");

    const studentName =
      fullName ||
      (customerData as { email?: string | null } | null)?.email ||
      "Student";

    const pdf = buildCertificatePdf({
      certificateNumber: certificate.certificate_number ?? `CERT-${certificate.id}`,
      studentName,
      courseTitle: (courseData as { title?: string | null } | null)?.title ?? "Course",
      issuedAt: new Date(certificate.issued_at).toISOString().slice(0, 10),
      brandName: context.brand.name,
    });

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "cache-control": "no-store",
        "content-disposition": `attachment; filename="certificate-${certificate.id}.pdf"`,
      },
    });
  } catch (error) {
    return handleCourseApiError(error);
  }
}
