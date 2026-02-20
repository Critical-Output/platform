import { buildLessonUnlockStates, buildModuleOrderById } from "./drip";
import { CourseApiError } from "./context";
import { clampPercent, normalizeSeconds, type CompletionMethod } from "./progress";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  CourseRecord,
  EnrollmentRecord,
  JsonObject,
  LessonRecord,
  ModuleRecord,
  ProgressRecord,
} from "./types";
type SupabaseClientLike = ReturnType<typeof createSupabaseServerClient>;

export type CourseStructure = {
  course: CourseRecord;
  modules: ModuleRecord[];
  lessons: LessonRecord[];
  moduleOrderById: Map<string, number>;
};

const mergeJson = (base: unknown, patch: Record<string, unknown>): JsonObject => {
  const source =
    base && typeof base === "object" && !Array.isArray(base)
      ? (base as Record<string, unknown>)
      : {};

  return {
    ...source,
    ...patch,
  };
};

export const loadCourseById = async (
  supabase: SupabaseClientLike,
  brandId: string,
  courseId: string,
): Promise<CourseRecord | null> => {
  const { data, error } = await supabase
    .from("courses")
    .select("id,brand_id,title,description,level,duration_minutes,metadata,created_at,updated_at,deleted_at")
    .eq("id", courseId)
    .eq("brand_id", brandId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new CourseApiError(500, `Could not load course: ${error.message}`);
  }

  return (data as CourseRecord | null) ?? null;
};

export const loadVisibleCourseById = async (
  supabase: SupabaseClientLike,
  brandSlug: string,
  courseId: string,
): Promise<CourseRecord | null> => {
  const { data, error } = await supabase.rpc("list_visible_courses_for_current_brand", {
    p_brand_slug: brandSlug,
  });

  if (error) {
    throw new CourseApiError(500, `Could not load visible courses: ${error.message}`);
  }

  const courses = (data ?? []) as CourseRecord[];
  return courses.find((row) => row.id === courseId) ?? null;
};

export const loadCourseStructure = async (
  supabase: SupabaseClientLike,
  _brandId: string,
  courseId: string,
): Promise<CourseStructure> => {
  const { data: courseData, error: courseError } = await supabase
    .from("courses")
    .select("id,brand_id,title,description,level,duration_minutes,metadata,created_at,updated_at,deleted_at")
    .eq("id", courseId)
    .is("deleted_at", null)
    .maybeSingle();

  if (courseError) {
    throw new CourseApiError(500, `Could not load course: ${courseError.message}`);
  }

  const course = (courseData as CourseRecord | null) ?? null;

  if (!course) {
    throw new CourseApiError(404, "Course not found.");
  }

  const { data: moduleData, error: moduleError } = await supabase
    .from("modules")
    .select("id,brand_id,course_id,title,position,metadata,created_at,updated_at,deleted_at")
    .eq("course_id", courseId)
    .is("deleted_at", null)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (moduleError) {
    throw new CourseApiError(500, `Could not load modules: ${moduleError.message}`);
  }

  const modules = (moduleData ?? []) as ModuleRecord[];
  const moduleIds = modules.map((module) => module.id);

  let lessons: LessonRecord[] = [];
  if (moduleIds.length > 0) {
    const { data: lessonData, error: lessonError } = await supabase
      .from("lessons")
      .select(
        "id,brand_id,module_id,title,content,video_url,duration_minutes,position,metadata,created_at,updated_at,deleted_at",
      )
      .in("module_id", moduleIds)
      .is("deleted_at", null)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });

    if (lessonError) {
      throw new CourseApiError(500, `Could not load lessons: ${lessonError.message}`);
    }

    lessons = (lessonData ?? []) as LessonRecord[];
  }

  const moduleOrderById = buildModuleOrderById(modules);

  return {
    course,
    modules,
    lessons,
    moduleOrderById,
  };
};

export const loadEnrollment = async (
  supabase: SupabaseClientLike,
  brandId: string,
  customerId: string,
  courseId: string,
): Promise<EnrollmentRecord | null> => {
  const { data, error } = await supabase
    .from("enrollments")
    .select(
      "id,brand_id,customer_id,course_id,status,enrolled_at,completed_at,metadata,created_at,updated_at,deleted_at",
    )
    .eq("brand_id", brandId)
    .eq("customer_id", customerId)
    .eq("course_id", courseId)
    .is("deleted_at", null)
    .in("status", ["active", "completed"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new CourseApiError(500, `Could not load enrollment: ${error.message}`);
  }

  return (data as EnrollmentRecord | null) ?? null;
};

export const loadProgressRows = async (
  supabase: SupabaseClientLike,
  enrollmentId: string,
): Promise<ProgressRecord[]> => {
  const { data, error } = await supabase
    .from("progress")
    .select(
      "id,brand_id,enrollment_id,lesson_id,percent_complete,completed_at,metadata,created_at,updated_at,deleted_at",
    )
    .eq("enrollment_id", enrollmentId)
    .is("deleted_at", null);

  if (error) {
    throw new CourseApiError(500, `Could not load progress: ${error.message}`);
  }

  return (data ?? []) as ProgressRecord[];
};

export const ensureLessonUnlocked = (params: {
  lessonId: string;
  lessons: LessonRecord[];
  modules: ModuleRecord[];
  courseMetadata: JsonObject | null;
  enrollment: EnrollmentRecord;
  progressRows: ProgressRecord[];
}): void => {
  const { lessonId, lessons, modules, courseMetadata, enrollment, progressRows } = params;

  const moduleOrderById = buildModuleOrderById(modules);
  const states = buildLessonUnlockStates({
    lessons,
    moduleOrderById,
    enrollment,
    progressRows,
    courseMetadata,
  });

  const state = states.find((item) => item.lessonId === lessonId);
  if (!state) {
    throw new CourseApiError(404, "Lesson not found in course.");
  }

  if (!state.unlocked) {
    const reason =
      state.reason === "waiting_for_previous_lesson"
        ? "Finish previous lessons first."
        : "Lesson is not released yet.";

    throw new CourseApiError(403, reason);
  }
};

export const issueCertificateForEnrollment = async (params: {
  supabase: SupabaseClientLike;
  enrollmentId: string;
  certificateNumber: string;
}): Promise<string> => {
  const { supabase, enrollmentId, certificateNumber } = params;

  const { data, error } = await supabase.rpc("issue_certificate_for_enrollment", {
    p_enrollment_id: enrollmentId,
    p_certificate_number: certificateNumber,
  });

  if (error) {
    throw new CourseApiError(500, `Could not issue certificate: ${error.message}`);
  }

  const certificateId = typeof data === "string" ? data : null;
  if (!certificateId) {
    throw new CourseApiError(500, "Could not issue certificate: missing certificate id.");
  }

  return certificateId;
};

export const upsertLessonProgress = async (params: {
  supabase: SupabaseClientLike;
  brandId: string;
  enrollmentId: string;
  lessonId: string;
  percentComplete: unknown;
  lastPositionSeconds: unknown;
  watchTimeSeconds: unknown;
  completionMethod?: CompletionMethod | null;
  markComplete?: boolean;
}): Promise<ProgressRecord> => {
  const {
    supabase,
    brandId,
    enrollmentId,
    lessonId,
    percentComplete = null,
    lastPositionSeconds = null,
    watchTimeSeconds = null,
    completionMethod,
    markComplete,
  } = params;

  const { data: existingData, error: existingError } = await supabase
    .from("progress")
    .select(
      "id,brand_id,enrollment_id,lesson_id,percent_complete,completed_at,metadata,created_at,updated_at,deleted_at",
    )
    .eq("enrollment_id", enrollmentId)
    .eq("lesson_id", lessonId)
    .is("deleted_at", null)
    .maybeSingle();

  if (existingError) {
    throw new CourseApiError(500, `Could not read existing progress: ${existingError.message}`);
  }

  const existing = (existingData as ProgressRecord | null) ?? null;
  const hasPercentUpdate = percentComplete !== null && percentComplete !== undefined && percentComplete !== "";
  const hasLastPositionUpdate =
    lastPositionSeconds !== null && lastPositionSeconds !== undefined && lastPositionSeconds !== "";
  const hasWatchTimeUpdate =
    watchTimeSeconds !== null && watchTimeSeconds !== undefined && watchTimeSeconds !== "";

  const existingPercent = clampPercent(existing?.percent_complete ?? 0);
  const requestedPercent = markComplete
    ? 100
    : hasPercentUpdate
      ? clampPercent(percentComplete)
      : existingPercent;
  const clampedPercent = Math.max(existingPercent, requestedPercent);

  const normalizedLastPosition = hasLastPositionUpdate
    ? normalizeSeconds(lastPositionSeconds)
    : null;
  const normalizedWatchTime = hasWatchTimeUpdate ? normalizeSeconds(watchTimeSeconds) : null;
  const completion = Boolean(existing?.completed_at) || markComplete || clampedPercent >= 100;
  const existingMetadata =
    existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
      ? (existing.metadata as JsonObject)
      : {};
  const existingCompletionMethod =
    typeof existingMetadata.completion_method === "string" && existingMetadata.completion_method.trim().length > 0
      ? existingMetadata.completion_method
      : null;

  const metadataPatch: Record<string, unknown> = {
    ...(hasLastPositionUpdate
      ? { video_last_position_seconds: normalizedLastPosition }
      : {}),
    ...(hasWatchTimeUpdate ? { video_watch_time_seconds: normalizedWatchTime } : {}),
    completion_method: completion
      ? completionMethod ?? existingCompletionMethod ?? "time-based"
      : completionMethod ?? existingCompletionMethod ?? null,
  };

  if (existing) {
    const { data, error } = await supabase
      .from("progress")
      .update({
        percent_complete: clampedPercent,
        completed_at: completion ? existing.completed_at ?? new Date().toISOString() : null,
        metadata: mergeJson(existing.metadata, metadataPatch),
      })
      .eq("id", existing.id)
      .select(
        "id,brand_id,enrollment_id,lesson_id,percent_complete,completed_at,metadata,created_at,updated_at,deleted_at",
      )
      .single();

    if (error) {
      throw new CourseApiError(500, `Could not update progress: ${error.message}`);
    }

    return data as ProgressRecord;
  }

  const { data, error } = await supabase
    .from("progress")
    .insert({
      brand_id: brandId,
      enrollment_id: enrollmentId,
      lesson_id: lessonId,
      percent_complete: clampedPercent,
      completed_at: completion ? new Date().toISOString() : null,
      metadata: metadataPatch,
    })
    .select(
      "id,brand_id,enrollment_id,lesson_id,percent_complete,completed_at,metadata,created_at,updated_at,deleted_at",
    )
    .single();

  if (error) {
    throw new CourseApiError(500, `Could not create progress: ${error.message}`);
  }

  return data as ProgressRecord;
};
