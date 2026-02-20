import { NextResponse } from "next/server";

import { handleCourseApiError } from "@/lib/courses/api";
import { getCourseRequestContext } from "@/lib/courses/context";
import type { EnrollmentRecord } from "@/lib/courses/types";

export async function POST(
  _request: Request,
  { params }: { params: { courseId: string } },
) {
  try {
    const context = await getCourseRequestContext({ requireCustomer: true });

    const { data: enrollmentId, error: enrollError } = await context.supabase.rpc(
      "enroll_current_user_in_course",
      {
        p_brand_slug: context.brand.slug,
        p_course_id: params.courseId,
      },
    );

    if (enrollError) {
      return NextResponse.json({ ok: false, error: enrollError.message }, { status: 400 });
    }

    const { data, error } = await context.supabase
      .from("enrollments")
      .select(
        "id,brand_id,customer_id,course_id,status,enrolled_at,completed_at,metadata,created_at,updated_at,deleted_at",
      )
      .eq("id", enrollmentId as string)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, enrollment: (data as EnrollmentRecord | null) ?? null });
  } catch (error) {
    return handleCourseApiError(error);
  }
}
