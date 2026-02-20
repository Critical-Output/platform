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
import {
  loadCourseById,
  loadCourseStructure,
  loadEnrollment,
  loadProgressRows,
  loadVisibleCourseById,
} from "@/lib/courses/learning";
import { buildLessonUnlockStates, sortLessonsForUnlock } from "@/lib/courses/drip";
import { calculateCoursePercent, findFirstIncompleteLessonId } from "@/lib/courses/progress";
import type { CourseRecord, EnrollmentRecord } from "@/lib/courses/types";

type CourseDetailsGetDependencies = {
  getCourseRequestContext: typeof getCourseRequestContext;
  loadCourseById: typeof loadCourseById;
  loadVisibleCourseById: typeof loadVisibleCourseById;
  loadEnrollment: typeof loadEnrollment;
  loadCourseStructure: typeof loadCourseStructure;
  sortLessonsForUnlock: typeof sortLessonsForUnlock;
  loadProgressRows: typeof loadProgressRows;
  buildLessonUnlockStates: typeof buildLessonUnlockStates;
  calculateCoursePercent: typeof calculateCoursePercent;
  findFirstIncompleteLessonId: typeof findFirstIncompleteLessonId;
};

const defaultCourseDetailsGetDependencies: CourseDetailsGetDependencies = {
  getCourseRequestContext,
  loadCourseById,
  loadVisibleCourseById,
  loadEnrollment,
  loadCourseStructure,
  sortLessonsForUnlock,
  loadProgressRows,
  buildLessonUnlockStates,
  calculateCoursePercent,
  findFirstIncompleteLessonId,
};

export async function runCourseDetailsGet(
  request: Request,
  params: { courseId: string },
  dependencies: CourseDetailsGetDependencies = defaultCourseDetailsGetDependencies,
) {
  try {
    const context = await dependencies.getCourseRequestContext();

    const { courseId } = params;
    const includeContent = new URL(request.url).searchParams.get("include") !== "summary";

    let course: CourseRecord | null = null;

    if (context.isBrandAdmin) {
      course = await dependencies.loadCourseById(context.supabase, context.brand.id, courseId);
      if (!course) {
        course = await dependencies.loadVisibleCourseById(context.supabase, context.brand.slug, courseId);
      }
    } else {
      course = await dependencies.loadVisibleCourseById(context.supabase, context.brand.slug, courseId);
    }

    if (!course) {
      return NextResponse.json({ ok: false, error: "Course not found." }, { status: 404 });
    }

    let enrollment: EnrollmentRecord | null = null;

    if (context.customerId) {
      enrollment = await dependencies.loadEnrollment(
        context.supabase,
        context.brand.id,
        context.customerId,
        courseId,
      );
    }

    if (!includeContent || (!context.isBrandAdmin && !enrollment)) {
      return NextResponse.json({
        ok: true,
        course,
        enrollment,
        requires_enrollment: !context.isBrandAdmin && !enrollment,
      });
    }

    const structure = await dependencies.loadCourseStructure(context.supabase, context.brand.id, courseId);
    const orderedLessons = dependencies.sortLessonsForUnlock(structure.lessons, structure.moduleOrderById);
    const progressRows = enrollment ? await dependencies.loadProgressRows(context.supabase, enrollment.id) : [];
    const progressByLessonId = new Map(progressRows.map((row) => [row.lesson_id, row]));
    const unlockStates = enrollment
      ? dependencies.buildLessonUnlockStates({
          lessons: orderedLessons,
          moduleOrderById: structure.moduleOrderById,
          enrollment,
          progressRows,
          courseMetadata: structure.course.metadata,
        })
      : [];
    const unlockByLessonId = new Map(unlockStates.map((item) => [item.lessonId, item]));

    const modules = structure.modules.map((module) => ({
      ...module,
      lessons: orderedLessons
        .filter((lesson) => lesson.module_id === module.id)
        .map((lesson) => ({
          ...lesson,
          progress: progressByLessonId.get(lesson.id) ?? null,
          unlock: unlockByLessonId.get(lesson.id) ?? null,
        })),
    }));

    const progressPercent = dependencies.calculateCoursePercent(orderedLessons, progressRows);
    const resumeLessonId = dependencies.findFirstIncompleteLessonId(orderedLessons, progressRows);

    let certificate: {
      id: string;
      certificate_number: string | null;
      issued_at: string;
    } | null = null;

    if (enrollment && context.customerId) {
      const { data: certData, error: certError } = await context.supabase
        .from("certificates")
        .select("id,certificate_number,issued_at")
        .eq("brand_id", context.brand.id)
        .eq("customer_id", context.customerId)
        .eq("course_id", courseId)
        .is("deleted_at", null)
        .order("issued_at", { ascending: false })
        .maybeSingle();

      if (certError) {
        return NextResponse.json({ ok: false, error: certError.message }, { status: 500 });
      }

      certificate = (certData as { id: string; certificate_number: string | null; issued_at: string } | null) ?? null;
    }

    return NextResponse.json({
      ok: true,
      course,
      enrollment,
      modules,
      progress_rows: progressRows,
      progress_percent: progressPercent,
      resume_lesson_id: resumeLessonId,
      certificate,
    });
  } catch (error) {
    return handleCourseApiError(error);
  }
}

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

    const visibleOnBrand = asBoolean(body.visible_on_brand);

    if (Object.keys(updates).length === 0 && visibleOnBrand === null) {
      return NextResponse.json({ ok: false, error: "No valid fields to update." }, { status: 400 });
    }

    let updatedCourse: CourseRecord | null = null;

    if (Object.keys(updates).length === 0 && visibleOnBrand !== null) {
      const { data, error } = await context.supabase
        .from("courses")
        .select(
          "id,brand_id,title,description,level,duration_minutes,metadata,created_at,updated_at,deleted_at",
        )
        .eq("id", params.courseId)
        .eq("brand_id", context.brand.id)
        .maybeSingle();

      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
      }

      if (!data) {
        return NextResponse.json({ ok: false, error: "Course not found." }, { status: 404 });
      }

      updatedCourse = data as CourseRecord;
    }

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

    if (!updatedCourse) {
      updatedCourse = await loadCourseById(context.supabase, context.brand.id, params.courseId);
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
