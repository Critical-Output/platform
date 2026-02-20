import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  CertificateRow,
  CourseRow,
  EnrollmentRow,
  JsonObject,
  LessonRow,
  ModuleRow,
  ProgressRow,
} from "@/lib/courses/types";
import { asJsonObject, normalizeText } from "@/lib/courses/utils";

const COURSE_COLUMNS =
  "id,brand_id,title,description,level,duration_minutes,metadata,created_at,updated_at,deleted_at";
const MODULE_COLUMNS = "id,brand_id,course_id,title,position,metadata,created_at,updated_at,deleted_at";
const LESSON_COLUMNS =
  "id,brand_id,module_id,title,content,video_url,duration_minutes,position,metadata,created_at,updated_at,deleted_at";
const ENROLLMENT_COLUMNS =
  "id,brand_id,customer_id,course_id,status,enrolled_at,completed_at,metadata,created_at,updated_at,deleted_at";
const PROGRESS_COLUMNS =
  "id,brand_id,enrollment_id,lesson_id,percent_complete,completed_at,metadata,created_at,updated_at,deleted_at";
const CERTIFICATE_COLUMNS =
  "id,brand_id,customer_id,course_id,issued_at,certificate_number,metadata,deleted_at";

type BrandRow = {
  id: string;
  slug: string;
  name: string;
};

type CustomerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

export type OrderedLessonRow = LessonRow & {
  course_id: string;
  module_position: number;
};

const castRows = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

const normalizeCourseRow = (row: CourseRow): CourseRow => ({
  ...row,
  metadata: asJsonObject(row.metadata),
});

const normalizeModuleRow = (row: ModuleRow): ModuleRow => ({
  ...row,
  metadata: asJsonObject(row.metadata),
});

const normalizeLessonRow = (row: LessonRow): LessonRow => ({
  ...row,
  metadata: asJsonObject(row.metadata),
});

const normalizeEnrollmentRow = (row: EnrollmentRow): EnrollmentRow => ({
  ...row,
  metadata: asJsonObject(row.metadata),
});

const normalizeProgressRow = (row: ProgressRow): ProgressRow => ({
  ...row,
  metadata: asJsonObject(row.metadata),
});

const normalizeCertificateRow = (row: CertificateRow): CertificateRow => ({
  ...row,
  metadata: asJsonObject(row.metadata),
});

export const getBrandBySlug = async (slug: string): Promise<BrandRow | null> => {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("brands")
    .select("id,slug,name")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(`Unable to resolve brand: ${error.message}`);
  return (data as BrandRow | null) ?? null;
};

export const getCustomerByBrandAndUser = async (
  brandId: string,
  userId: string,
): Promise<{ id: string } | null> => {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("customers")
    .select("id")
    .eq("brand_id", brandId)
    .eq("auth_user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Unable to resolve customer: ${error.message}`);
  return (data as { id: string } | null) ?? null;
};

export const getCustomerById = async (brandId: string, customerId: string): Promise<CustomerRow | null> => {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("customers")
    .select("id,first_name,last_name,email")
    .eq("brand_id", brandId)
    .eq("id", customerId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(`Unable to load customer: ${error.message}`);
  return (data as CustomerRow | null) ?? null;
};

export const listCoursesByBrand = async (
  brandId: string,
  options?: { includeArchived?: boolean },
): Promise<CourseRow[]> => {
  const includeArchived = options?.includeArchived ?? false;
  const admin = createSupabaseAdminClient();

  let query = admin
    .from("courses")
    .select(COURSE_COLUMNS)
    .eq("brand_id", brandId)
    .order("created_at", { ascending: true });

  if (!includeArchived) {
    query = query.is("deleted_at", null);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Unable to list courses: ${error.message}`);

  return castRows<CourseRow>(data).map(normalizeCourseRow);
};

export const getVisibleCourseIds = async (brandId: string): Promise<Set<string>> => {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("courses_brands")
    .select("course_id")
    .eq("brand_id", brandId)
    .is("deleted_at", null);

  if (error) throw new Error(`Unable to resolve course visibility: ${error.message}`);

  const rows = castRows<{ course_id: string }>(data);
  return new Set(rows.map((row) => row.course_id));
};

export const setCourseVisibility = async (brandId: string, courseId: string, visible: boolean): Promise<void> => {
  const admin = createSupabaseAdminClient();

  if (visible) {
    const { data: existingRows, error: existingError } = await admin
      .from("courses_brands")
      .select("id")
      .eq("brand_id", brandId)
      .eq("course_id", courseId)
      .order("created_at", { ascending: true })
      .limit(1);

    if (existingError) {
      throw new Error(`Unable to update course visibility: ${existingError.message}`);
    }

    const existing = castRows<{ id: string }>(existingRows)[0];
    if (existing?.id) {
      const { error: updateError } = await admin
        .from("courses_brands")
        .update({ deleted_at: null, updated_at: new Date().toISOString() })
        .eq("id", existing.id);

      if (updateError) {
        throw new Error(`Unable to unarchive visibility mapping: ${updateError.message}`);
      }
      return;
    }

    const { error: insertError } = await admin.from("courses_brands").insert({
      brand_id: brandId,
      course_id: courseId,
      metadata: {},
    });
    if (insertError) {
      throw new Error(`Unable to create visibility mapping: ${insertError.message}`);
    }

    return;
  }

  const { error: hideError } = await admin
    .from("courses_brands")
    .update({ deleted_at: new Date().toISOString() })
    .eq("brand_id", brandId)
    .eq("course_id", courseId)
    .is("deleted_at", null);

  if (hideError) {
    throw new Error(`Unable to hide course from brand catalog: ${hideError.message}`);
  }
};

export const getCourseById = async (
  brandId: string,
  courseId: string,
  options?: { includeArchived?: boolean },
): Promise<CourseRow | null> => {
  const includeArchived = options?.includeArchived ?? false;
  const admin = createSupabaseAdminClient();

  let query = admin
    .from("courses")
    .select(COURSE_COLUMNS)
    .eq("brand_id", brandId)
    .eq("id", courseId)
    .limit(1);

  if (!includeArchived) {
    query = query.is("deleted_at", null);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`Unable to load course: ${error.message}`);

  const row = data as CourseRow | null;
  return row ? normalizeCourseRow(row) : null;
};

export const createCourse = async (params: {
  brandId: string;
  title: string;
  description?: string | null;
  level?: string | null;
  durationMinutes?: number | null;
  metadata?: JsonObject;
  visible?: boolean;
}): Promise<CourseRow> => {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("courses")
    .insert({
      brand_id: params.brandId,
      title: params.title,
      description: normalizeText(params.description) ?? null,
      level: normalizeText(params.level) ?? null,
      duration_minutes: params.durationMinutes ?? null,
      metadata: params.metadata ?? {},
    })
    .select(COURSE_COLUMNS)
    .single();

  if (error) throw new Error(`Unable to create course: ${error.message}`);

  const created = normalizeCourseRow(data as CourseRow);
  await setCourseVisibility(params.brandId, created.id, params.visible !== false);
  return created;
};

export const updateCourse = async (params: {
  brandId: string;
  courseId: string;
  patch: {
    title?: string;
    description?: string | null;
    level?: string | null;
    duration_minutes?: number | null;
    metadata?: JsonObject;
  };
}): Promise<CourseRow> => {
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from("courses")
    .update(params.patch)
    .eq("brand_id", params.brandId)
    .eq("id", params.courseId)
    .is("deleted_at", null)
    .select(COURSE_COLUMNS)
    .single();

  if (error) throw new Error(`Unable to update course: ${error.message}`);
  return normalizeCourseRow(data as CourseRow);
};

export const archiveCourse = async (brandId: string, courseId: string): Promise<void> => {
  const admin = createSupabaseAdminClient();
  const deletedAt = new Date().toISOString();

  const { data: modulesData, error: modulesError } = await admin
    .from("modules")
    .select("id")
    .eq("brand_id", brandId)
    .eq("course_id", courseId)
    .is("deleted_at", null);

  if (modulesError) {
    throw new Error(`Unable to archive course modules: ${modulesError.message}`);
  }

  const moduleIds = castRows<{ id: string }>(modulesData).map((row) => row.id);
  if (moduleIds.length > 0) {
    const { error: lessonError } = await admin
      .from("lessons")
      .update({ deleted_at: deletedAt })
      .eq("brand_id", brandId)
      .in("module_id", moduleIds)
      .is("deleted_at", null);

    if (lessonError) throw new Error(`Unable to archive course lessons: ${lessonError.message}`);
  }

  const { error: moduleArchiveError } = await admin
    .from("modules")
    .update({ deleted_at: deletedAt })
    .eq("brand_id", brandId)
    .eq("course_id", courseId)
    .is("deleted_at", null);
  if (moduleArchiveError) {
    throw new Error(`Unable to archive course modules: ${moduleArchiveError.message}`);
  }

  const { error: visibilityError } = await admin
    .from("courses_brands")
    .update({ deleted_at: deletedAt })
    .eq("brand_id", brandId)
    .eq("course_id", courseId)
    .is("deleted_at", null);
  if (visibilityError) {
    throw new Error(`Unable to archive course visibility rows: ${visibilityError.message}`);
  }

  const { error: courseError } = await admin
    .from("courses")
    .update({ deleted_at: deletedAt })
    .eq("brand_id", brandId)
    .eq("id", courseId)
    .is("deleted_at", null);
  if (courseError) throw new Error(`Unable to archive course: ${courseError.message}`);
};

export const listModulesByCourse = async (brandId: string, courseId: string): Promise<ModuleRow[]> => {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("modules")
    .select(MODULE_COLUMNS)
    .eq("brand_id", brandId)
    .eq("course_id", courseId)
    .is("deleted_at", null)
    .order("position", { ascending: true });

  if (error) throw new Error(`Unable to list modules: ${error.message}`);
  return castRows<ModuleRow>(data).map(normalizeModuleRow);
};

export const getModuleById = async (
  brandId: string,
  courseId: string,
  moduleId: string,
): Promise<ModuleRow | null> => {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("modules")
    .select(MODULE_COLUMNS)
    .eq("brand_id", brandId)
    .eq("course_id", courseId)
    .eq("id", moduleId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(`Unable to load module: ${error.message}`);
  const row = data as ModuleRow | null;
  return row ? normalizeModuleRow(row) : null;
};

export const createModule = async (params: {
  brandId: string;
  courseId: string;
  title: string;
  position?: number;
  metadata?: JsonObject;
}): Promise<ModuleRow> => {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("modules")
    .insert({
      brand_id: params.brandId,
      course_id: params.courseId,
      title: params.title,
      position: params.position ?? 0,
      metadata: params.metadata ?? {},
    })
    .select(MODULE_COLUMNS)
    .single();

  if (error) throw new Error(`Unable to create module: ${error.message}`);
  return normalizeModuleRow(data as ModuleRow);
};

export const updateModule = async (params: {
  brandId: string;
  courseId: string;
  moduleId: string;
  patch: {
    title?: string;
    position?: number;
    metadata?: JsonObject;
  };
}): Promise<ModuleRow> => {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("modules")
    .update(params.patch)
    .eq("brand_id", params.brandId)
    .eq("course_id", params.courseId)
    .eq("id", params.moduleId)
    .is("deleted_at", null)
    .select(MODULE_COLUMNS)
    .single();

  if (error) throw new Error(`Unable to update module: ${error.message}`);
  return normalizeModuleRow(data as ModuleRow);
};

export const archiveModule = async (brandId: string, courseId: string, moduleId: string): Promise<void> => {
  const admin = createSupabaseAdminClient();
  const deletedAt = new Date().toISOString();

  const { error: lessonError } = await admin
    .from("lessons")
    .update({ deleted_at: deletedAt })
    .eq("brand_id", brandId)
    .eq("module_id", moduleId)
    .is("deleted_at", null);

  if (lessonError) throw new Error(`Unable to archive module lessons: ${lessonError.message}`);

  const { error: moduleError } = await admin
    .from("modules")
    .update({ deleted_at: deletedAt })
    .eq("brand_id", brandId)
    .eq("course_id", courseId)
    .eq("id", moduleId)
    .is("deleted_at", null);

  if (moduleError) throw new Error(`Unable to archive module: ${moduleError.message}`);
};

export const listLessonsByModule = async (brandId: string, moduleId: string): Promise<LessonRow[]> => {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("lessons")
    .select(LESSON_COLUMNS)
    .eq("brand_id", brandId)
    .eq("module_id", moduleId)
    .is("deleted_at", null)
    .order("position", { ascending: true });

  if (error) throw new Error(`Unable to list lessons: ${error.message}`);
  return castRows<LessonRow>(data).map(normalizeLessonRow);
};

export const getLessonById = async (brandId: string, moduleId: string, lessonId: string): Promise<LessonRow | null> => {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("lessons")
    .select(LESSON_COLUMNS)
    .eq("brand_id", brandId)
    .eq("module_id", moduleId)
    .eq("id", lessonId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(`Unable to load lesson: ${error.message}`);
  const row = data as LessonRow | null;
  return row ? normalizeLessonRow(row) : null;
};

export const createLesson = async (params: {
  brandId: string;
  moduleId: string;
  title: string;
  content?: string | null;
  video_url?: string | null;
  duration_minutes?: number | null;
  position?: number;
  metadata?: JsonObject;
}): Promise<LessonRow> => {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("lessons")
    .insert({
      brand_id: params.brandId,
      module_id: params.moduleId,
      title: params.title,
      content: normalizeText(params.content) ?? null,
      video_url: normalizeText(params.video_url) ?? null,
      duration_minutes: params.duration_minutes ?? null,
      position: params.position ?? 0,
      metadata: params.metadata ?? {},
    })
    .select(LESSON_COLUMNS)
    .single();

  if (error) throw new Error(`Unable to create lesson: ${error.message}`);
  return normalizeLessonRow(data as LessonRow);
};

export const updateLesson = async (params: {
  brandId: string;
  moduleId: string;
  lessonId: string;
  patch: {
    title?: string;
    content?: string | null;
    video_url?: string | null;
    duration_minutes?: number | null;
    position?: number;
    metadata?: JsonObject;
  };
}): Promise<LessonRow> => {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("lessons")
    .update(params.patch)
    .eq("brand_id", params.brandId)
    .eq("module_id", params.moduleId)
    .eq("id", params.lessonId)
    .is("deleted_at", null)
    .select(LESSON_COLUMNS)
    .single();

  if (error) throw new Error(`Unable to update lesson: ${error.message}`);
  return normalizeLessonRow(data as LessonRow);
};

export const archiveLesson = async (brandId: string, moduleId: string, lessonId: string): Promise<void> => {
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("lessons")
    .update({ deleted_at: new Date().toISOString() })
    .eq("brand_id", brandId)
    .eq("module_id", moduleId)
    .eq("id", lessonId)
    .is("deleted_at", null);

  if (error) throw new Error(`Unable to archive lesson: ${error.message}`);
};

export const listOrderedLessonsForCourse = async (
  brandId: string,
  courseId: string,
): Promise<OrderedLessonRow[]> => {
  const modules = await listModulesByCourse(brandId, courseId);
  if (!modules.length) return [];

  const moduleById = new Map(modules.map((module) => [module.id, module]));
  const admin = createSupabaseAdminClient();
  const moduleIds = modules.map((module) => module.id);

  const { data, error } = await admin
    .from("lessons")
    .select(LESSON_COLUMNS)
    .eq("brand_id", brandId)
    .in("module_id", moduleIds)
    .is("deleted_at", null);

  if (error) throw new Error(`Unable to list course lessons: ${error.message}`);

  const lessons = castRows<LessonRow>(data).map(normalizeLessonRow);
  const withOrder = lessons
    .map((lesson): OrderedLessonRow | null => {
      const courseModule = moduleById.get(lesson.module_id);
      if (!courseModule) return null;
      return {
        ...lesson,
        course_id: courseModule.course_id,
        module_position: courseModule.position,
      };
    })
    .filter((value): value is OrderedLessonRow => Boolean(value));

  return withOrder.sort((a, b) => {
    if (a.module_position !== b.module_position) return a.module_position - b.module_position;
    if (a.position !== b.position) return a.position - b.position;
    return a.id.localeCompare(b.id);
  });
};

export const getEnrollmentForCourse = async (
  brandId: string,
  customerId: string,
  courseId: string,
): Promise<EnrollmentRow | null> => {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("enrollments")
    .select(ENROLLMENT_COLUMNS)
    .eq("brand_id", brandId)
    .eq("customer_id", customerId)
    .eq("course_id", courseId)
    .is("deleted_at", null)
    .in("status", ["active", "completed"])
    .order("enrolled_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Unable to load enrollment: ${error.message}`);
  const row = data as EnrollmentRow | null;
  return row ? normalizeEnrollmentRow(row) : null;
};

export const createEnrollment = async (params: {
  brandId: string;
  customerId: string;
  courseId: string;
  metadata?: JsonObject;
}): Promise<EnrollmentRow> => {
  const existing = await getEnrollmentForCourse(params.brandId, params.customerId, params.courseId);
  if (existing) return existing;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("enrollments")
    .insert({
      brand_id: params.brandId,
      customer_id: params.customerId,
      course_id: params.courseId,
      status: "active",
      metadata: params.metadata ?? {},
    })
    .select(ENROLLMENT_COLUMNS)
    .single();

  if (error) throw new Error(`Unable to create enrollment: ${error.message}`);
  return normalizeEnrollmentRow(data as EnrollmentRow);
};

export const listEnrollmentsForCustomer = async (
  brandId: string,
  customerId: string,
): Promise<EnrollmentRow[]> => {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("enrollments")
    .select(ENROLLMENT_COLUMNS)
    .eq("brand_id", brandId)
    .eq("customer_id", customerId)
    .in("status", ["active", "completed"])
    .is("deleted_at", null)
    .order("enrolled_at", { ascending: true });

  if (error) throw new Error(`Unable to list enrollments: ${error.message}`);
  return castRows<EnrollmentRow>(data).map(normalizeEnrollmentRow);
};

export const listProgressForEnrollment = async (enrollmentId: string): Promise<ProgressRow[]> => {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("progress")
    .select(PROGRESS_COLUMNS)
    .eq("enrollment_id", enrollmentId)
    .is("deleted_at", null);

  if (error) throw new Error(`Unable to list progress: ${error.message}`);
  return castRows<ProgressRow>(data).map(normalizeProgressRow);
};

export const getProgressForLesson = async (
  enrollmentId: string,
  lessonId: string,
): Promise<ProgressRow | null> => {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("progress")
    .select(PROGRESS_COLUMNS)
    .eq("enrollment_id", enrollmentId)
    .eq("lesson_id", lessonId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(`Unable to load lesson progress: ${error.message}`);
  const row = data as ProgressRow | null;
  return row ? normalizeProgressRow(row) : null;
};

export const insertProgress = async (params: {
  brandId: string;
  enrollmentId: string;
  lessonId: string;
  percentComplete: number;
  completedAt: string | null;
  metadata: JsonObject;
}): Promise<ProgressRow> => {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("progress")
    .insert({
      brand_id: params.brandId,
      enrollment_id: params.enrollmentId,
      lesson_id: params.lessonId,
      percent_complete: params.percentComplete,
      completed_at: params.completedAt,
      metadata: params.metadata,
    })
    .select(PROGRESS_COLUMNS)
    .single();

  if (error) throw new Error(`Unable to insert lesson progress: ${error.message}`);
  return normalizeProgressRow(data as ProgressRow);
};

export const updateProgress = async (params: {
  progressId: string;
  percentComplete: number;
  completedAt: string | null;
  metadata: JsonObject;
}): Promise<ProgressRow> => {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("progress")
    .update({
      percent_complete: params.percentComplete,
      completed_at: params.completedAt,
      metadata: params.metadata,
    })
    .eq("id", params.progressId)
    .select(PROGRESS_COLUMNS)
    .single();

  if (error) throw new Error(`Unable to update lesson progress: ${error.message}`);
  return normalizeProgressRow(data as ProgressRow);
};

export const markEnrollmentCompletionState = async (params: {
  enrollmentId: string;
  isCompleted: boolean;
}): Promise<void> => {
  const admin = createSupabaseAdminClient();
  const nextStatus = params.isCompleted ? "completed" : "active";
  const completedAt = params.isCompleted ? new Date().toISOString() : null;

  const { error } = await admin
    .from("enrollments")
    .update({ status: nextStatus, completed_at: completedAt })
    .eq("id", params.enrollmentId)
    .is("deleted_at", null);

  if (error) throw new Error(`Unable to update enrollment completion state: ${error.message}`);
};

export const getCertificateForCustomerCourse = async (
  brandId: string,
  customerId: string,
  courseId: string,
): Promise<CertificateRow | null> => {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("certificates")
    .select(CERTIFICATE_COLUMNS)
    .eq("brand_id", brandId)
    .eq("customer_id", customerId)
    .eq("course_id", courseId)
    .is("deleted_at", null)
    .order("issued_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Unable to load certificate: ${error.message}`);
  const row = data as CertificateRow | null;
  return row ? normalizeCertificateRow(row) : null;
};

export const insertCertificate = async (params: {
  brandId: string;
  customerId: string;
  courseId: string;
  certificateNumber: string;
  metadata?: JsonObject;
}): Promise<CertificateRow> => {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("certificates")
    .insert({
      brand_id: params.brandId,
      customer_id: params.customerId,
      course_id: params.courseId,
      certificate_number: params.certificateNumber,
      metadata: {
        verification_code: params.certificateNumber,
        ...(params.metadata ?? {}),
      },
    })
    .select(CERTIFICATE_COLUMNS)
    .single();

  if (error) throw new Error(`Unable to create certificate: ${error.message}`);
  return normalizeCertificateRow(data as CertificateRow);
};

export const isCertificateNumberTaken = async (brandId: string, certificateNumber: string): Promise<boolean> => {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("certificates")
    .select("id")
    .eq("brand_id", brandId)
    .eq("certificate_number", certificateNumber)
    .is("deleted_at", null)
    .limit(1);

  if (error) throw new Error(`Unable to validate certificate number uniqueness: ${error.message}`);
  return castRows<{ id: string }>(data).length > 0;
};

export const getCertificateByNumber = async (
  brandId: string,
  certificateNumber: string,
): Promise<CertificateRow | null> => {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("certificates")
    .select(CERTIFICATE_COLUMNS)
    .eq("brand_id", brandId)
    .eq("certificate_number", certificateNumber)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Unable to load certificate by code: ${error.message}`);
  const row = data as CertificateRow | null;
  return row ? normalizeCertificateRow(row) : null;
};

export const getCertificateByCode = async (
  brandId: string,
  code: string,
): Promise<(CertificateRow & { course: CourseRow | null; customer: CustomerRow | null }) | null> => {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("certificates")
    .select(
      `${CERTIFICATE_COLUMNS},course:courses(id,brand_id,title,description,level,duration_minutes,metadata,created_at,updated_at,deleted_at),customer:customers(id,first_name,last_name,email)`,
    )
    .eq("brand_id", brandId)
    .eq("certificate_number", code)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Unable to verify certificate code: ${error.message}`);
  if (!data) return null;

  const row = data as CertificateRow & { course: CourseRow | null; customer: CustomerRow | null };
  return {
    ...normalizeCertificateRow(row),
    course: row.course ? normalizeCourseRow(row.course) : null,
    customer: row.customer ?? null,
  };
};
