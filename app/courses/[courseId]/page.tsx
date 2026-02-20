import CourseDetailClient from "./course-detail-client";

type CourseDetailPageProps = {
  params: {
    courseId: string;
  };
  searchParams?: {
    lesson?: string;
  };
};

export default function CourseDetailPage({ params, searchParams }: CourseDetailPageProps) {
  return <CourseDetailClient courseId={params.courseId} initialLessonId={searchParams?.lesson ?? null} />;
}
