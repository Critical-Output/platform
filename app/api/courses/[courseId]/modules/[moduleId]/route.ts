import { NextResponse } from "next/server";

import {
  asBoolean,
  asIntOrNull,
  asJsonObject,
  asString,
  handleCourseApiError,
  readJsonBody,
} from "@/lib/courses/api";
import { getCourseRequestContext } from "@/lib/courses/context";
import type { ModuleRecord } from "@/lib/courses/types";

const moduleSelect =
  "id,brand_id,course_id,title,position,metadata,created_at,updated_at,deleted_at";

export async function GET(
  _request: Request,
  { params }: { params: { courseId: string; moduleId: string } },
) {
  try {
    const context = await getCourseRequestContext({ requireAdmin: true, requireCustomer: false });

    const { data, error } = await context.supabase
      .from("modules")
      .select(moduleSelect)
      .eq("id", params.moduleId)
      .eq("course_id", params.courseId)
      .eq("brand_id", context.brand.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ ok: false, error: "Module not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, module: data as ModuleRecord });
  } catch (error) {
    return handleCourseApiError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { courseId: string; moduleId: string } },
) {
  try {
    const context = await getCourseRequestContext({ requireAdmin: true, requireCustomer: false });
    const body = await readJsonBody(request);

    const updates: Record<string, unknown> = {};

    const title = asString(body.title);
    if (title) {
      updates.title = title;
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
      .from("modules")
      .update(updates)
      .eq("id", params.moduleId)
      .eq("course_id", params.courseId)
      .eq("brand_id", context.brand.id)
      .select(moduleSelect)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    if (!data) {
      return NextResponse.json({ ok: false, error: "Module not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, module: data as ModuleRecord });
  } catch (error) {
    return handleCourseApiError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { courseId: string; moduleId: string } },
) {
  try {
    const context = await getCourseRequestContext({ requireAdmin: true, requireCustomer: false });

    const { data, error } = await context.supabase
      .from("modules")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", params.moduleId)
      .eq("course_id", params.courseId)
      .eq("brand_id", context.brand.id)
      .is("deleted_at", null)
      .select(moduleSelect)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    if (!data) {
      return NextResponse.json({ ok: false, error: "Module not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, module: data as ModuleRecord });
  } catch (error) {
    return handleCourseApiError(error);
  }
}
