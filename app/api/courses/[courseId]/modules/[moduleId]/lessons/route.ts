import { NextResponse } from "next/server";

import {
  asIntOrNull,
  asJsonObject,
  asNullableString,
  asString,
  handleCourseApiError,
  readJsonBody,
} from "@/lib/courses/api";
import { getCourseRequestContext } from "@/lib/courses/context";
import type { LessonRecord } from "@/lib/courses/types";

const lessonSelect =
  "id,brand_id,module_id,title,content,video_url,duration_minutes,position,metadata,created_at,updated_at,deleted_at";

export async function GET(
  _request: Request,
  { params }: { params: { courseId: string; moduleId: string } },
) {
  try {
    const context = await getCourseRequestContext({ requireAdmin: true, requireCustomer: false });

    const { data: moduleData, error: moduleError } = await context.supabase
      .from("modules")
      .select("id")
      .eq("id", params.moduleId)
      .eq("course_id", params.courseId)
      .eq("brand_id", context.brand.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (moduleError) {
      return NextResponse.json({ ok: false, error: moduleError.message }, { status: 500 });
    }

    if (!moduleData) {
      return NextResponse.json({ ok: false, error: "Module not found." }, { status: 404 });
    }

    const { data, error } = await context.supabase
      .from("lessons")
      .select(lessonSelect)
      .eq("brand_id", context.brand.id)
      .eq("module_id", params.moduleId)
      .is("deleted_at", null)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, lessons: (data ?? []) as LessonRecord[] });
  } catch (error) {
    return handleCourseApiError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: { courseId: string; moduleId: string } },
) {
  try {
    const context = await getCourseRequestContext({ requireAdmin: true, requireCustomer: false });
    const body = await readJsonBody(request);

    const { data: moduleData, error: moduleError } = await context.supabase
      .from("modules")
      .select("id")
      .eq("id", params.moduleId)
      .eq("course_id", params.courseId)
      .eq("brand_id", context.brand.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (moduleError) {
      return NextResponse.json({ ok: false, error: moduleError.message }, { status: 500 });
    }

    if (!moduleData) {
      return NextResponse.json({ ok: false, error: "Module not found." }, { status: 404 });
    }

    const title = asString(body.title);
    if (!title) {
      return NextResponse.json({ ok: false, error: "title is required." }, { status: 400 });
    }

    const content = asNullableString(body.content);
    const videoUrl = asNullableString(body.video_url);
    const durationMinutes = asIntOrNull(body.duration_minutes);
    let position = asIntOrNull(body.position);
    if (position === null) {
      const { data: latestLesson, error: latestLessonError } = await context.supabase
        .from("lessons")
        .select("position")
        .eq("brand_id", context.brand.id)
        .eq("module_id", params.moduleId)
        .is("deleted_at", null)
        .order("position", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestLessonError) {
        return NextResponse.json({ ok: false, error: latestLessonError.message }, { status: 500 });
      }

      position = ((latestLesson as { position?: number } | null)?.position ?? -1) + 1;
    }
    const metadata = asJsonObject(body.metadata) ?? {};

    const { data, error } = await context.supabase
      .from("lessons")
      .insert({
        brand_id: context.brand.id,
        module_id: params.moduleId,
        title,
        content,
        video_url: videoUrl,
        duration_minutes: durationMinutes,
        position,
        metadata,
      })
      .select(lessonSelect)
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, lesson: data as LessonRecord }, { status: 201 });
  } catch (error) {
    return handleCourseApiError(error);
  }
}
