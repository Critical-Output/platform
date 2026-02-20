import { NextResponse } from "next/server";

import {
  asBoolean,
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

const ensureModuleInCourse = async (
  context: Awaited<ReturnType<typeof getCourseRequestContext>>,
  params: { courseId: string; lessonId: string; moduleId: string },
) => {
  const { data, error } = await context.supabase
    .from("modules")
    .select("id")
    .eq("id", params.moduleId)
    .eq("course_id", params.courseId)
    .eq("brand_id", context.brand.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    return { ok: false as const, status: 500, error: error.message };
  }

  if (!data) {
    return { ok: false as const, status: 404, error: "Module not found." };
  }

  return { ok: true as const };
};

export async function GET(
  _request: Request,
  { params }: { params: { courseId: string; moduleId: string; lessonId: string } },
) {
  try {
    const context = await getCourseRequestContext({ requireAdmin: true, requireCustomer: false });

    const moduleCheck = await ensureModuleInCourse(context, params);
    if (!moduleCheck.ok) {
      return NextResponse.json({ ok: false, error: moduleCheck.error }, { status: moduleCheck.status });
    }

    const { data, error } = await context.supabase
      .from("lessons")
      .select(lessonSelect)
      .eq("id", params.lessonId)
      .eq("module_id", params.moduleId)
      .eq("brand_id", context.brand.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ ok: false, error: "Lesson not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, lesson: data as LessonRecord });
  } catch (error) {
    return handleCourseApiError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { courseId: string; moduleId: string; lessonId: string } },
) {
  try {
    const context = await getCourseRequestContext({ requireAdmin: true, requireCustomer: false });
    const body = await readJsonBody(request);
    const moduleCheck = await ensureModuleInCourse(context, params);
    if (!moduleCheck.ok) {
      return NextResponse.json({ ok: false, error: moduleCheck.error }, { status: moduleCheck.status });
    }

    const updates: Record<string, unknown> = {};

    const title = asString(body.title);
    if (title) updates.title = title;

    if (body.content !== undefined) {
      updates.content = asNullableString(body.content);
    }

    if (body.video_url !== undefined) {
      updates.video_url = asNullableString(body.video_url);
    }

    if (body.duration_minutes !== undefined) {
      updates.duration_minutes = asIntOrNull(body.duration_minutes);
    }

    if (body.position !== undefined) {
      updates.position = asIntOrNull(body.position) ?? 0;
    }

    if (body.metadata !== undefined) {
      updates.metadata = asJsonObject(body.metadata) ?? {};
    }

    const archived = asBoolean(body.archived);
    if (archived === true) {
      updates.deleted_at = new Date().toISOString();
    }

    if (archived === false) {
      updates.deleted_at = null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: false, error: "No valid fields to update." }, { status: 400 });
    }

    const { data, error } = await context.supabase
      .from("lessons")
      .update(updates)
      .eq("id", params.lessonId)
      .eq("module_id", params.moduleId)
      .eq("brand_id", context.brand.id)
      .select(lessonSelect)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    if (!data) {
      return NextResponse.json({ ok: false, error: "Lesson not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, lesson: data as LessonRecord });
  } catch (error) {
    return handleCourseApiError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { courseId: string; moduleId: string; lessonId: string } },
) {
  try {
    const context = await getCourseRequestContext({ requireAdmin: true, requireCustomer: false });
    const moduleCheck = await ensureModuleInCourse(context, params);
    if (!moduleCheck.ok) {
      return NextResponse.json({ ok: false, error: moduleCheck.error }, { status: moduleCheck.status });
    }

    const { data, error } = await context.supabase
      .from("lessons")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", params.lessonId)
      .eq("module_id", params.moduleId)
      .eq("brand_id", context.brand.id)
      .is("deleted_at", null)
      .select(lessonSelect)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    if (!data) {
      return NextResponse.json({ ok: false, error: "Lesson not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, lesson: data as LessonRecord });
  } catch (error) {
    return handleCourseApiError(error);
  }
}
