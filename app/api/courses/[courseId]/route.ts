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
import type { CourseRecord } from "@/lib/courses/types";

import { runCourseDetailsGet } from "./course-details-get";

export async function GET(
  request: Request,
  { params }: { params: { courseId: string } },
) {
  return runCourseDetailsGet(request, params);
}

export async function PATCH(
  request: Request,
  { params }: { params: { courseId: string } },
) {
  try {
    const context = await getCourseRequestContext({ requireAdmin: true, requireCustomer: false });
    const body = await readJsonBody(request);

    const { data: existingCourseData, error: existingCourseError } = await context.supabase
      .from("courses")
      .select(
        "id,brand_id,title,description,level,duration_minutes,metadata,created_at,updated_at,deleted_at",
      )
      .eq("id", params.courseId)
      .eq("brand_id", context.brand.id)
      .maybeSingle();

    if (existingCourseError) {
      return NextResponse.json({ ok: false, error: existingCourseError.message }, { status: 400 });
    }

    if (!existingCourseData) {
      return NextResponse.json({ ok: false, error: "Course not found." }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};

    const title = asString(body.title);
    if (title) updates.title = title;

    if (body.description !== undefined) {
      updates.description = asNullableString(body.description);
    }

    if (body.level !== undefined) {
      updates.level = asNullableString(body.level);
    }

    if (body.duration_minutes !== undefined) {
      const durationMinutes = asIntOrNull(body.duration_minutes);
      updates.duration_minutes = durationMinutes;
    }

    const metadataPatch: Record<string, unknown> = {};
    let hasMetadataPatch = false;

    if (body.metadata !== undefined) {
      Object.assign(metadataPatch, asJsonObject(body.metadata) ?? {});
      hasMetadataPatch = true;
    }

    if (body.category !== undefined) {
      metadataPatch.category = asNullableString(body.category);
      hasMetadataPatch = true;
    }

    if (body.thumbnail_url !== undefined) {
      metadataPatch.thumbnail_url = asNullableString(body.thumbnail_url);
      hasMetadataPatch = true;
    }

    const publish = asBoolean(body.publish);
    if (publish === true) {
      metadataPatch.published_at = new Date().toISOString();
      hasMetadataPatch = true;
    }

    if (publish === false) {
      metadataPatch.published_at = null;
      hasMetadataPatch = true;
    }

    if (hasMetadataPatch) {
      updates.metadata = {
        ...(asJsonObject((existingCourseData as CourseRecord).metadata) ?? {}),
        ...metadataPatch,
      };
    }

    const archived = asBoolean(body.archived);
    if (archived === true) {
      updates.deleted_at = new Date().toISOString();
    }

    if (archived === false) {
      updates.deleted_at = null;
    }

    let visibleOnBrand = asBoolean(body.visible_on_brand);
    if (visibleOnBrand === null && publish !== null) {
      visibleOnBrand = publish;
    }

    if (Object.keys(updates).length === 0 && visibleOnBrand === null) {
      return NextResponse.json({ ok: false, error: "No valid fields to update." }, { status: 400 });
    }

    let updatedCourse: CourseRecord | null = existingCourseData as CourseRecord;

    if (Object.keys(updates).length > 0) {
      const { data, error } = await context.supabase
        .from("courses")
        .update(updates)
        .eq("id", params.courseId)
        .eq("brand_id", context.brand.id)
        .select(
          "id,brand_id,title,description,level,duration_minutes,metadata,created_at,updated_at,deleted_at",
        )
        .maybeSingle();

      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
      }

      if (!data) {
        return NextResponse.json({ ok: false, error: "Course not found." }, { status: 404 });
      }

      updatedCourse = data as CourseRecord;
    }

    if (visibleOnBrand !== null) {
      if (visibleOnBrand) {
        const { error } = await context.supabase.from("courses_brands").upsert(
          {
            brand_id: context.brand.id,
            course_id: params.courseId,
            deleted_at: null,
            metadata: {
              visible: true,
            },
          },
          { onConflict: "brand_id,course_id" },
        );

        if (error) {
          return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
        }
      } else {
        const { error } = await context.supabase
          .from("courses_brands")
          .update({ deleted_at: new Date().toISOString() })
          .eq("brand_id", context.brand.id)
          .eq("course_id", params.courseId)
          .is("deleted_at", null);

        if (error) {
          return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
        }
      }
    }

    return NextResponse.json({ ok: true, course: updatedCourse });
  } catch (error) {
    return handleCourseApiError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { courseId: string } },
) {
  try {
    const context = await getCourseRequestContext({ requireAdmin: true, requireCustomer: false });
    const archivedAt = new Date().toISOString();

    const { data, error } = await context.supabase
      .from("courses")
      .update({ deleted_at: archivedAt })
      .eq("id", params.courseId)
      .eq("brand_id", context.brand.id)
      .is("deleted_at", null)
      .select(
        "id,brand_id,title,description,level,duration_minutes,metadata,created_at,updated_at,deleted_at",
      )
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    if (!data) {
      return NextResponse.json({ ok: false, error: "Course not found." }, { status: 404 });
    }

    const { error: visibilityError } = await context.supabase
      .from("courses_brands")
      .update({ deleted_at: archivedAt })
      .eq("brand_id", context.brand.id)
      .eq("course_id", params.courseId)
      .is("deleted_at", null);

    if (visibilityError) {
      return NextResponse.json({ ok: false, error: visibilityError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, course: data as CourseRecord });
  } catch (error) {
    return handleCourseApiError(error);
  }
}
