export type JsonObject = Record<string, unknown>;

export type CourseRow = {
  id: string;
  brand_id: string;
  title: string;
  description: string | null;
  level: string | null;
  duration_minutes: number | null;
  metadata: JsonObject;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ModuleRow = {
  id: string;
  brand_id: string;
  course_id: string;
  title: string;
  position: number;
  metadata: JsonObject;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type LessonRow = {
  id: string;
  brand_id: string;
  module_id: string;
  title: string;
  content: string | null;
  video_url: string | null;
  duration_minutes: number | null;
  position: number;
  metadata: JsonObject;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type EnrollmentRow = {
  id: string;
  brand_id: string;
  customer_id: string;
  course_id: string;
  status: "active" | "completed" | "cancelled";
  enrolled_at: string;
  completed_at: string | null;
  metadata: JsonObject;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ProgressRow = {
  id: string;
  brand_id: string;
  enrollment_id: string;
  lesson_id: string;
  percent_complete: number;
  completed_at: string | null;
  metadata: JsonObject;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CertificateRow = {
  id: string;
  brand_id: string;
  customer_id: string;
  course_id: string;
  issued_at: string;
  certificate_number: string | null;
  metadata: JsonObject;
  deleted_at: string | null;
};

export type CompletionSource = "manual" | "time-based" | "quiz-pass";
