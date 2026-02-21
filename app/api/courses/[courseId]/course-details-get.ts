import { NextResponse } from "next/server";

import { handleCourseApiError } from "@/lib/courses/api";
import { getCourseRequestContext } from "@/lib/courses/context";
import { buildLessonUnlockStates, sortLessonsForUnlock } from "@/lib/courses/drip";
import {
  loadCourseById,
  loadCourseStructure,
  loadEnrollment,
  loadProgressRows,
  loadVisibleCourseById,
} from "@/lib/courses/learning";
import { calculateCoursePercent, findFirstIncompleteLessonId } from "@/lib/courses/progress";
import type { CourseRecord, EnrollmentRecord } from "@/lib/courses/types";
import {
  hasRequiredTierAccess,
  loadActiveSubscriptionTiers,
  toLessonVisibilitySettings,
  toRestrictedLessonMetadata,
  type LessonVisibilitySettings,
} from "@/lib/courses/visibility";

export type CourseDetailsGetDependencies = {
  getCourseRequestContext: typeof getCourseRequestContext;
  loadCourseById: typeof loadCourseById;
  loadVisibleCourseById: typeof loadVisibleCourseById;
  loadEnrollment: typeof loadEnrollment;
  loadActiveSubscriptionTiers: typeof loadActiveSubscriptionTiers;
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
  loadActiveSubscriptionTiers,
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

    if (!includeContent) {
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
    const visibilityByLessonId = new Map(
      orderedLessons.map((lesson) => [lesson.id, toLessonVisibilitySettings(lesson.metadata)]),
    );
    const hasSpecificTierLessons = orderedLessons.some(
      (lesson) => visibilityByLessonId.get(lesson.id)?.visibility === "specific_tier",
    );
    const activeSubscriptionTiers =
      !context.isBrandAdmin && context.customerId && hasSpecificTierLessons
        ? await dependencies.loadActiveSubscriptionTiers(context.supabase, context.brand.id, context.customerId)
        : new Set<string>();

    const lessonAccessById = new Map(
      orderedLessons.map((lesson) => {
        const settings =
          visibilityByLessonId.get(lesson.id) ??
          ({
            visibility: "members_only",
            requiredTier: null,
          } satisfies LessonVisibilitySettings);
        const hasVisibilityAccess = context.isBrandAdmin
          ? true
          : settings.visibility === "free_preview"
            ? true
            : settings.visibility === "specific_tier"
              ? hasRequiredTierAccess(activeSubscriptionTiers, settings.requiredTier)
              : !!enrollment;
        const dripUnlock = unlockByLessonId.get(lesson.id) ?? null;
        const unlocked = hasVisibilityAccess && (dripUnlock?.unlocked ?? true);

        const reason = !hasVisibilityAccess
          ? settings.visibility === "specific_tier"
            ? "requires_tier"
            : "requires_enrollment"
          : dripUnlock && !dripUnlock.unlocked
            ? dripUnlock.reason
            : "available";

        return [
          lesson.id,
          {
            hasVisibilityAccess,
            unlocked,
            reason,
            settings,
          },
        ];
      }),
    );

    const modules = structure.modules.map((moduleRow) => ({
      ...moduleRow,
      lessons: orderedLessons
        .filter((lesson) => lesson.module_id === moduleRow.id)
        .map((lesson) => {
          const lessonAccess = lessonAccessById.get(lesson.id) ?? {
            hasVisibilityAccess: true,
            unlocked: true,
            reason: "available",
            settings: toLessonVisibilitySettings(lesson.metadata),
          };

          return {
            ...lesson,
            content: lessonAccess.hasVisibilityAccess ? lesson.content : null,
            video_url: lessonAccess.hasVisibilityAccess ? lesson.video_url : null,
            metadata: lessonAccess.hasVisibilityAccess
              ? lesson.metadata
              : toRestrictedLessonMetadata(lessonAccess.settings),
            progress: lessonAccess.hasVisibilityAccess ? progressByLessonId.get(lesson.id) ?? null : null,
            unlock: {
              unlocked: lessonAccess.unlocked,
              reason: lessonAccess.reason,
            },
          };
        }),
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
      ...(context.isBrandAdmin || enrollment ? {} : { requires_enrollment: true }),
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
