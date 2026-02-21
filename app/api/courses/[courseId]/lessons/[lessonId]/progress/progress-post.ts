import { NextResponse } from "next/server";

import {
  asBoolean,
  asString,
  handleCourseApiError,
  readJsonBody,
} from "@/lib/courses/api";
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
import { calculateCoursePercent, isLessonComplete, type CompletionMethod } from "@/lib/courses/progress";
import {
  hasRequiredTierAccess,
  loadActiveSubscriptionTiers,
  toLessonVisibilitySettings,
} from "@/lib/courses/visibility";

const parseCompletionMethod = (value: unknown): CompletionMethod | null => {
  const method = asString(value);
  if (!method) return null;
  if (method === "manual" || method === "time-based" || method === "quiz-pass") {
    return method;
  }
  return null;
};

export type LessonProgressPostDependencies = {
  getCourseRequestContext: typeof getCourseRequestContext;
  readJsonBody: typeof readJsonBody;
  loadEnrollment: typeof loadEnrollment;
  loadCourseStructure: typeof loadCourseStructure;
  loadProgressRows: typeof loadProgressRows;
  ensureLessonUnlocked: typeof ensureLessonUnlocked;
  toLessonVisibilitySettings: typeof toLessonVisibilitySettings;
  loadActiveSubscriptionTiers: typeof loadActiveSubscriptionTiers;
  hasRequiredTierAccess: typeof hasRequiredTierAccess;
  upsertLessonProgress: typeof upsertLessonProgress;
  calculateCoursePercent: typeof calculateCoursePercent;
  isLessonComplete: typeof isLessonComplete;
  issueCertificateForEnrollment: typeof issueCertificateForEnrollment;
  generateCertificateNumber: typeof generateCertificateNumber;
};

const defaultLessonProgressPostDependencies: LessonProgressPostDependencies = {
  getCourseRequestContext,
  readJsonBody,
  loadEnrollment,
  loadCourseStructure,
  loadProgressRows,
  ensureLessonUnlocked,
  toLessonVisibilitySettings,
  loadActiveSubscriptionTiers,
  hasRequiredTierAccess,
  upsertLessonProgress,
  calculateCoursePercent,
  isLessonComplete,
  issueCertificateForEnrollment,
  generateCertificateNumber,
};

export async function runLessonProgressPost(
  request: Request,
  { params }: { params: { courseId: string; lessonId: string } },
  dependencies: LessonProgressPostDependencies = defaultLessonProgressPostDependencies,
) {
  try {
    const context = await dependencies.getCourseRequestContext({ requireCustomer: true });
    const body = await dependencies.readJsonBody(request);

    const enrollment = await dependencies.loadEnrollment(
      context.supabase,
      context.brand.id,
      context.customerId as string,
      params.courseId,
    );

    if (!enrollment) {
      return NextResponse.json(
        { ok: false, error: "You must enroll before tracking lesson progress." },
        { status: 403 },
      );
    }

    const structure = await dependencies.loadCourseStructure(context.supabase, context.brand.id, params.courseId);
    const lesson = structure.lessons.find((row) => row.id === params.lessonId);

    if (!lesson) {
      return NextResponse.json({ ok: false, error: "Lesson not found in this course." }, { status: 404 });
    }

    const visibilitySettings = dependencies.toLessonVisibilitySettings(lesson.metadata);
    if (visibilitySettings.visibility === "specific_tier") {
      const activeSubscriptionTiers = await dependencies.loadActiveSubscriptionTiers(
        context.supabase,
        context.brand.id,
        context.customerId as string,
      );

      if (!dependencies.hasRequiredTierAccess(activeSubscriptionTiers, visibilitySettings.requiredTier)) {
        return NextResponse.json(
          { ok: false, error: "You do not have access to this lesson for your current membership tier." },
          { status: 403 },
        );
      }
    }

    const progressRows = await dependencies.loadProgressRows(context.supabase, enrollment.id);

    dependencies.ensureLessonUnlocked({
      lessonId: params.lessonId,
      lessons: structure.lessons,
      modules: structure.modules,
      courseMetadata: structure.course.metadata,
      enrollment,
      progressRows,
    });

    const completionMethod = parseCompletionMethod(body.completion_method);
    if (body.completion_method !== undefined && !completionMethod) {
      return NextResponse.json({ ok: false, error: "Invalid completion_method." }, { status: 400 });
    }

    const markComplete = asBoolean(body.mark_complete) ?? false;

    const progress = await dependencies.upsertLessonProgress({
      supabase: context.supabase,
      brandId: context.brand.id,
      enrollmentId: enrollment.id,
      lessonId: params.lessonId,
      percentComplete: body.percent_complete,
      lastPositionSeconds: body.last_position_seconds,
      watchTimeSeconds: body.watch_time_seconds,
      completionMethod,
      markComplete,
    });

    const mergedProgress = [
      ...progressRows.filter((row) => row.lesson_id !== progress.lesson_id),
      progress,
    ];

    const progressPercent = dependencies.calculateCoursePercent(structure.lessons, mergedProgress);
    const allLessonsComplete =
      structure.lessons.length > 0 &&
      structure.lessons.every((courseLesson) => {
        const progressRow = mergedProgress.find((row) => row.lesson_id === courseLesson.id);
        return dependencies.isLessonComplete(progressRow);
      });

    let certificateId: string | null = null;
    if (allLessonsComplete) {
      certificateId = await dependencies.issueCertificateForEnrollment({
        supabase: context.supabase,
        enrollmentId: enrollment.id,
        certificateNumber: dependencies.generateCertificateNumber(),
      });
    }

    return NextResponse.json({
      ok: true,
      progress,
      course_progress_percent: progressPercent,
      lesson_completed: dependencies.isLessonComplete(progress),
      completion_method:
        completionMethod ?? ((progress.metadata as Record<string, unknown> | null)?.completion_method as string | null) ?? null,
      certificate_id: certificateId,
    });
  } catch (error) {
    return handleCourseApiError(error);
  }
}
