import { NextResponse } from "next/server";

import { listBrandInstructors, userHasBrandAccess } from "@/lib/bookings/service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const brandId = requestUrl.searchParams.get("brand_id")?.trim();

  if (!brandId) {
    return NextResponse.json(
      { ok: false, error: "brand_id is required" },
      { status: 400 },
    );
  }

  try {
    const sessionClient = createSupabaseServerClient();
    const { data: userData, error: userError } = await sessionClient.auth.getUser();

    if (userError || !userData.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const adminClient = createSupabaseAdminClient();
    const hasBrandAccess = await userHasBrandAccess(adminClient, brandId, userData.user.id);

    if (!hasBrandAccess) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const instructors = await listBrandInstructors(adminClient, brandId);

    return NextResponse.json({
      ok: true,
      instructors: instructors.map((instructor) => ({
        id: instructor.id,
        brand_id: instructor.brand_id,
        first_name: instructor.first_name,
        last_name: instructor.last_name,
        email: instructor.email,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to load instructors",
      },
      { status: 500 },
    );
  }
}
