import { NextResponse } from "next/server";

import {
  asIntOrNull,
  asJsonObject,
  asString,
  handleCourseApiError,
  readJsonBody,
} from "@/lib/courses/api";
import { getCourseRequestContext } from "@/lib/courses/context";
import { loadCourseById } from "@/lib/courses/learning";
import type { ModuleRecord } from "@/lib/courses/types";

export async function GET(
  _request: Request,
  { params }: { params: { courseId: string } },
) {
  try {
    const context = await getCourseRequestContext({ requireAdmin: true, requireCustomer: false });

    const course = await loadCourseById(context.supabase, context.brand.id, params.courseId);
    if (!course) {
      return NextResponse.json({ ok: false, error: "Course not found." }, { status: 404 });
    }

    const { data, error } = await context.supabase
      .from("modules")
      .select("id,brand_id,course_id,title,position,metadata,created_at,updated_at,deleted_at")
      .eq("brand_id", context.brand.id)
      .eq("course_id", params.courseId)
      .is("deleted_at", null)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, modules: (data ?? []) as ModuleRecord[] });
  } catch (error) {
    return handleCourseApiError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: { courseId: string } },
) {
  try {
    const context = await getCourseRequestContext({ requireAdmin: true, requireCustomer: false });
    const body = await readJsonBody(request);

    const course = await loadCourseById(context.supabase, context.brand.id, params.courseId);
    if (!course) {
      return NextResponse.json({ ok: false, error: "Course not found." }, { status: 404 });
    }

    const title = asString(body.title);
    if (!title) {
      return NextResponse.json({ ok: false, error: "title is required." }, { status: 400 });
    }

    let position = asIntOrNull(body.position);
    if (position === null) {
      const { data: latestModule, error: latestModuleError } = await context.supabase
        .from("modules")
        .select("position")
        .eq("brand_id", context.brand.id)
        .eq("course_id", params.courseId)
        .is("deleted_at", null)
        .order("position", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestModuleError) {
        return NextResponse.json({ ok: false, error: latestModuleError.message }, { status: 500 });
      }

      position = ((latestModule as { position?: number } | null)?.position ?? -1) + 1;
    }
    const metadata = asJsonObject(body.metadata) ?? {};

    const { data, error } = await context.supabase
      .from("modules")
      .insert({
        brand_id: context.brand.id,
        course_id: params.courseId,
        title,
        position,
        metadata,
      })
      .select("id,brand_id,course_id,title,position,metadata,created_at,updated_at,deleted_at")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, module: data as ModuleRecord }, { status: 201 });
  } catch (error) {
    return handleCourseApiError(error);
  }
}
