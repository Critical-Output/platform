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
import { orderDashboardLessonIds } from "@/lib/courses/dashboard";
import type { CourseRecord, EnrollmentRecord, ProgressRecord } from "@/lib/courses/types";

export async function GET(request: Request) {
  try {
    const scope = new URL(request.url).searchParams.get("scope");
    const context = await getCourseRequestContext(
      scope === "admin" ? { requireCustomer: false } : undefined,
    );

    if (scope === "admin") {
      if (!context.isBrandAdmin) {
        return NextResponse.json(
          { ok: false, error: "Only brand admins can list admin courses." },
          { status: 403 },
        );
      }

      const { data, error } = await context.supabase
        .from("courses")
        .select(
          "id,brand_id,title,description,level,duration_minutes,metadata,created_at,updated_at,deleted_at",
        )
        .eq("brand_id", context.brand.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, courses: (data ?? []) as CourseRecord[] });
    }

    const { data: catalogData, error: catalogError } = await context.supabase.rpc(
      "list_visible_courses_for_current_brand",
      {
        p_brand_slug: context.brand.slug,
      },
    );

    if (catalogError) {
      return NextResponse.json({ ok: false, error: catalogError.message }, { status: 500 });
    }

    const courses = (catalogData ?? []) as CourseRecord[];

    if (!context.customerId || courses.length === 0) {
      return NextResponse.json({ ok: true, courses });
    }

    const courseIds = courses.map((course) => course.id);

    const { data: enrollmentData, error: enrollmentError } = await context.supabase
      .from("enrollments")
      .select(
        "id,brand_id,customer_id,course_id,status,enrolled_at,completed_at,metadata,created_at,updated_at,deleted_at",
      )
      .eq("brand_id", context.brand.id)
      .eq("customer_id", context.customerId)
      .in("course_id", courseIds)
      .is("deleted_at", null)
      .in("status", ["active", "completed"])
      .order("created_at", { ascending: false });

    if (enrollmentError) {
      return NextResponse.json({ ok: false, error: enrollmentError.message }, { status: 500 });
    }

    const enrollments = (enrollmentData ?? []) as EnrollmentRecord[];
    const enrollmentByCourse = new Map<string, EnrollmentRecord>();
    for (const enrollment of enrollments) {
      if (!enrollmentByCourse.has(enrollment.course_id)) {
        enrollmentByCourse.set(enrollment.course_id, enrollment);
      }
    }

    const enrollmentIds = Array.from(enrollmentByCourse.values()).map((row) => row.id);

    const progressByEnrollment = new Map<string, ProgressRecord[]>();
    if (enrollmentIds.length > 0) {
      const { data: progressData, error: progressError } = await context.supabase
        .from("progress")
        .select(
          "id,brand_id,enrollment_id,lesson_id,percent_complete,completed_at,metadata,created_at,updated_at,deleted_at",
        )
        .in("enrollment_id", enrollmentIds)
        .is("deleted_at", null);

      if (progressError) {
        return NextResponse.json({ ok: false, error: progressError.message }, { status: 500 });
      }

      for (const row of (progressData ?? []) as ProgressRecord[]) {
        const rows = progressByEnrollment.get(row.enrollment_id) ?? [];
        rows.push(row);
        progressByEnrollment.set(row.enrollment_id, rows);
      }
    }

    const { data: moduleRows, error: moduleError } = await context.supabase
      .from("modules")
      .select("id,course_id,position,created_at")
      .in("course_id", courseIds)
      .is("deleted_at", null);

    if (moduleError) {
      return NextResponse.json({ ok: false, error: moduleError.message }, { status: 500 });
    }

    const modules = (moduleRows ?? []) as Array<{
      id: string;
      course_id: string;
      position: number;
      created_at: string;
    }>;
    const moduleIds = modules.map((row) => row.id);
    const courseIdByModuleId = new Map<string, string>(modules.map((row) => [row.id, row.course_id]));
    const modulesByCourse = new Map<string, Array<{ id: string; position: number; created_at: string }>>();
    for (const module of modules) {
      const rows = modulesByCourse.get(module.course_id) ?? [];
      rows.push({
        id: module.id,
        position: module.position,
        created_at: module.created_at,
      });
      modulesByCourse.set(module.course_id, rows);
    }

    let lessonRows: Array<{ id: string; module_id: string; position: number; created_at: string }> = [];
    if (moduleIds.length > 0) {
      const { data: lessonsData, error: lessonsError } = await context.supabase
        .from("lessons")
        .select("id,module_id,position,created_at")
        .in("module_id", moduleIds)
        .is("deleted_at", null);

      if (lessonsError) {
        return NextResponse.json({ ok: false, error: lessonsError.message }, { status: 500 });
      }

      lessonRows = (lessonsData ?? []) as Array<{
        id: string;
        module_id: string;
        position: number;
        created_at: string;
      }>;
    }

    const lessonsByCourse = new Map<string, Array<{ id: string; module_id: string; position: number; created_at: string }>>();
    for (const lesson of lessonRows) {
      const courseId = courseIdByModuleId.get(lesson.module_id);
      if (!courseId) continue;
      const rows = lessonsByCourse.get(courseId) ?? [];
      rows.push(lesson);
      lessonsByCourse.set(courseId, rows);
    }

    const coursesWithEnrollment = courses.map((course) => {
      const enrollment = enrollmentByCourse.get(course.id) ?? null;
      const moduleRowsForCourse = modulesByCourse.get(course.id) ?? [];
      const lessonRowsForCourse = lessonsByCourse.get(course.id) ?? [];
      const orderedLessonIds = orderDashboardLessonIds(moduleRowsForCourse, lessonRowsForCourse);

      const progressRows = enrollment ? progressByEnrollment.get(enrollment.id) ?? [] : [];
      const progressByLesson = new Map(progressRows.map((row) => [row.lesson_id, row]));
      const totalPercent = orderedLessonIds.reduce((sum, lessonId) => {
        const row = progressByLesson.get(lessonId);
        const raw = Number(row?.percent_complete ?? 0);
        const percent = Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : 0;
        return sum + percent;
      }, 0);
      const progressPercent =
        orderedLessonIds.length > 0
          ? Math.round((totalPercent / orderedLessonIds.length) * 100) / 100
          : 0;

      const resumeLessonId =
        orderedLessonIds.find((lessonId) => {
          const row = progressByLesson.get(lessonId);
          if (!row) return true;
          if (row.completed_at) return false;
          return Number(row.percent_complete) < 100;
        }) ?? orderedLessonIds[orderedLessonIds.length - 1] ?? null;

      return {
        ...course,
        enrollment,
        progress_percent: progressPercent,
        resume_lesson_id: resumeLessonId,
      };
    });

    return NextResponse.json({ ok: true, courses: coursesWithEnrollment });
  } catch (error) {
    return handleCourseApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCourseRequestContext({ requireAdmin: true, requireCustomer: false });
    const body = await readJsonBody(request);

    const title = asString(body.title);
    if (!title) {
      return NextResponse.json({ ok: false, error: "title is required." }, { status: 400 });
    }

    const description = asNullableString(body.description);
    const level = asNullableString(body.level);
    const durationMinutes = asIntOrNull(body.duration_minutes);
    const metadata = asJsonObject(body.metadata) ?? {};
    const visibleOnBrand = asBoolean(body.visible_on_brand) ?? true;

    const { data: courseData, error: courseError } = await context.supabase
      .from("courses")
      .insert({
        brand_id: context.brand.id,
        title,
        description,
        level,
        duration_minutes: durationMinutes,
        metadata,
      })
      .select(
        "id,brand_id,title,description,level,duration_minutes,metadata,created_at,updated_at,deleted_at",
      )
      .single();

    if (courseError) {
      return NextResponse.json({ ok: false, error: courseError.message }, { status: 400 });
    }

    const course = courseData as CourseRecord;

    if (visibleOnBrand) {
      const { error: visibilityError } = await context.supabase.from("courses_brands").upsert(
        {
          brand_id: context.brand.id,
          course_id: course.id,
          metadata: {
            visible: true,
          },
          deleted_at: null,
        },
        {
          onConflict: "brand_id,course_id",
        },
      );

      if (visibilityError) {
        return NextResponse.json({ ok: false, error: visibilityError.message }, { status: 400 });
      }
    }

    return NextResponse.json({ ok: true, course }, { status: 201 });
  } catch (error) {
    return handleCourseApiError(error);
  }
}
