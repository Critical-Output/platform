import type { ViewerContext } from "@/lib/courses/auth";
import { calculateLessonUnlockStates, getResumeLessonId } from "@/lib/courses/drip";
import {
  getVisibleCourseIds,
  listCoursesByBrand,
  listEnrollmentsForCustomer,
  listOrderedLessonsForCourse,
  listProgressForEnrollment,
} from "@/lib/courses/data";
import { calculateCoursePercent, getCompletedLessonIds } from "@/lib/courses/progress";

export type StudentDashboardCourse = {
  enrollmentId: string;
  courseId: string;
  title: string;
  description: string | null;
  progressPercent: number;
  completedLessons: number;
  totalLessons: number;
  resumeLessonId: string | null;
};

export type AvailableCourse = {
  courseId: string;
  title: string;
  description: string | null;
  level: string | null;
  durationMinutes: number | null;
};

export const loadStudentDashboard = async (
  viewer: ViewerContext,
): Promise<{ enrolled: StudentDashboardCourse[]; available: AvailableCourse[] }> => {
  const courses = await listCoursesByBrand(viewer.brandId);
  const visibleSet = await getVisibleCourseIds(viewer.brandId);
  const visibleCourses = courses.filter((course) => visibleSet.has(course.id));
  const courseMap = new Map(visibleCourses.map((course) => [course.id, course]));

  if (!viewer.customerId) {
    return {
      enrolled: [],
      available: visibleCourses.map((course) => ({
        courseId: course.id,
        title: course.title,
        description: course.description,
        level: course.level,
        durationMinutes: course.duration_minutes,
      })),
    };
  }

  const enrollments = await listEnrollmentsForCustomer(viewer.brandId, viewer.customerId);
  const enrolledCourseIds = new Set(enrollments.map((enrollment) => enrollment.course_id));

  const enrolled = (
    await Promise.all(
      enrollments.map(async (enrollment) => {
        const course = courseMap.get(enrollment.course_id);
        if (!course) return null;

        const [lessons, progress] = await Promise.all([
          listOrderedLessonsForCourse(viewer.brandId, enrollment.course_id),
          listProgressForEnrollment(enrollment.id),
        ]);

        const unlockStates = calculateLessonUnlockStates({
          lessons: lessons.map((lesson) => ({
            id: lesson.id,
            module_position: lesson.module_position,
            lesson_position: lesson.position,
            metadata: lesson.metadata,
          })),
          progressRows: progress,
          enrollmentDate: enrollment.enrolled_at,
          courseMetadata: course.metadata,
        });

        const lessonIds = lessons.map((lesson) => lesson.id);
        const completedLessons = getCompletedLessonIds(progress).size;
        const progressPercent = calculateCoursePercent(lessonIds, progress);
        const resumeLessonId = getResumeLessonId(
          lessons.map((lesson) => ({
            id: lesson.id,
            module_position: lesson.module_position,
            lesson_position: lesson.position,
            metadata: lesson.metadata,
          })),
          unlockStates,
          progress,
        );

        return {
          enrollmentId: enrollment.id,
          courseId: course.id,
          title: course.title,
          description: course.description,
          progressPercent,
          completedLessons,
          totalLessons: lessons.length,
          resumeLessonId,
        };
      }),
    )
  ).filter((row): row is StudentDashboardCourse => Boolean(row));

  const available = visibleCourses
    .filter((course) => !enrolledCourseIds.has(course.id))
    .map((course) => ({
      courseId: course.id,
      title: course.title,
      description: course.description,
      level: course.level,
      durationMinutes: course.duration_minutes,
    }));

  return {
    enrolled,
    available,
  };
};
