export type JsonObject = Record<string, unknown>;

export type BrandRecord = {
  id: string;
  slug: string;
  name: string;
};

export type CourseRecord = {
  id: string;
  brand_id: string;
  title: string;
  description: string | null;
  level: string | null;
  duration_minutes: number | null;
  metadata: JsonObject | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ModuleRecord = {
  id: string;
  brand_id: string;
  course_id: string;
  title: string;
  position: number;
  metadata: JsonObject | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type LessonRecord = {
  id: string;
  brand_id: string;
  module_id: string;
  title: string;
  content: string | null;
  video_url: string | null;
  duration_minutes: number | null;
  position: number;
  metadata: JsonObject | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type EnrollmentRecord = {
  id: string;
  brand_id: string;
  customer_id: string;
  course_id: string;
  status: "active" | "completed" | "cancelled";
  enrolled_at: string;
  completed_at: string | null;
  metadata: JsonObject | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ProgressRecord = {
  id: string;
  brand_id: string;
  enrollment_id: string;
  lesson_id: string;
  percent_complete: number;
  completed_at: string | null;
  metadata: JsonObject | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CertificateRecord = {
  id: string;
  brand_id: string;
  customer_id: string;
  course_id: string;
  issued_at: string;
  certificate_number: string | null;
  metadata: JsonObject | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CourseWithChildren = CourseRecord & {
  modules: Array<
    ModuleRecord & {
      lessons: LessonRecord[];
    }
  >;
};
