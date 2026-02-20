import { NextResponse } from "next/server";

import { asString, handleCourseApiError, readJsonBody } from "@/lib/courses/api";
import { generateCertificateNumber } from "@/lib/courses/certificates";
import { getCourseRequestContext } from "@/lib/courses/context";
import {
  ensureLessonUnlocked,
  issueCertificateForEnrollment,
  loadCourseStructure,
  loadEnrollment,
  loadProgressRows,
  upsertLessonProgress,
} from "@/lib/courses/learning";
import { isLessonComplete, type CompletionMethod } from "@/lib/courses/progress";

const parseCompletionMethod = (value: unknown): CompletionMethod | null => {
  const method = asString(value);
  if (!method) return null;
  if (method === "manual" || method === "time-based" || method === "quiz-pass") {
    return method;
  }
  return null;
};

export async function POST(
  request: Request,
  { params }: { params: { courseId: string; lessonId: string } },
) {
  try {
    const context = await getCourseRequestContext({ requireCustomer: true });
    const body = await readJsonBody(request);
    const completionMethod = parseCompletionMethod(body.method ?? body.completion_method);

    if (!completionMethod) {
      return NextResponse.json(
        { ok: false, error: "method is required and must be manual, time-based, or quiz-pass." },
        { status: 400 },
      );
    }

    const enrollment = await loadEnrollment(
      context.supabase,
      context.brand.id,
      context.customerId as string,
      params.courseId,
    );

    if (!enrollment) {
      return NextResponse.json({ ok: false, error: "You must enroll before completing lessons." }, { status: 403 });
    }

    const structure = await loadCourseStructure(context.supabase, context.brand.id, params.courseId);
    const lesson = structure.lessons.find((row) => row.id === params.lessonId);

    if (!lesson) {
      return NextResponse.json({ ok: false, error: "Lesson not found in this course." }, { status: 404 });
    }

    const progressRows = await loadProgressRows(context.supabase, enrollment.id);

    ensureLessonUnlocked({
      lessonId: params.lessonId,
      lessons: structure.lessons,
      modules: structure.modules,
      courseMetadata: structure.course.metadata,
      enrollment,
      progressRows,
    });

    const progress = await upsertLessonProgress({
      supabase: context.supabase,
      brandId: context.brand.id,
      enrollmentId: enrollment.id,
      lessonId: params.lessonId,
      percentComplete: 100,
      lastPositionSeconds: body.last_position_seconds,
      watchTimeSeconds: body.watch_time_seconds,
      completionMethod,
      markComplete: true,
    });

    const mergedProgress = [
      ...progressRows.filter((row) => row.lesson_id !== progress.lesson_id),
      progress,
    ];

    const allLessonsComplete =
      structure.lessons.length > 0 &&
      structure.lessons.every((courseLesson) => {
        const progressRow = mergedProgress.find((row) => row.lesson_id === courseLesson.id);
        return isLessonComplete(progressRow);
      });

    let certificateId: string | null = null;
    if (allLessonsComplete) {
      certificateId = await issueCertificateForEnrollment({
        supabase: context.supabase,
        enrollmentId: enrollment.id,
        certificateNumber: generateCertificateNumber(),
      });
    }

    return NextResponse.json({
      ok: true,
      progress,
      lesson_completed: true,
      completion_method: completionMethod,
      certificate_id: certificateId,
    });
  } catch (error) {
    return handleCourseApiError(error);
  }
}
