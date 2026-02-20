import { NextResponse } from "next/server";

import { asString, handleCourseApiError } from "@/lib/courses/api";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: { code: string } },
) {
  try {
    const code = asString(params.code);
    if (!code) {
      return NextResponse.json({ ok: false, error: "Certificate code is required." }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc("verify_certificate_code", {
      p_certificate_number: code,
    });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as Array<{
      certificate_id: string;
      certificate_number: string;
      issued_at: string;
      course_title: string;
      brand_name: string;
      student_name: string;
    }>;

    if (rows.length === 0) {
      return NextResponse.json({ ok: false, verified: false, error: "Certificate not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, verified: true, certificate: rows[0] });
  } catch (error) {
    return handleCourseApiError(error);
  }
}
