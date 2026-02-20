import type { ViewerContext } from "@/lib/courses/auth";
import { calculateLessonUnlockStates, getResumeLessonId, sortLessonsForDelivery } from "@/lib/courses/drip";
import {
  getCourseById,
  getEnrollmentForCourse,
  getVisibleCourseIds,
  listOrderedLessonsForCourse,
  listProgressForEnrollment,
} from "@/lib/courses/data";
import type { ProgressRow } from "@/lib/courses/types";

export type CourseLearningContext = {
  courseId: string;
  courseTitle: string;
  courseDescription: string | null;
  enrollmentId: string;
  enrollmentDate: string;
  lessons: Awaited<ReturnType<typeof listOrderedLessonsForCourse>>;
  progressRows: ProgressRow[];
  unlockStates: ReturnType<typeof calculateLessonUnlockStates>;
  resumeLessonId: string | null;
};

export const loadCourseLearningContext = async (
  viewer: ViewerContext,
  courseId: string,
): Promise<CourseLearningContext | null> => {
  if (!viewer.customerId) return null;

  const [course, visibleSet, enrollment] = await Promise.all([
    getCourseById(viewer.brandId, courseId),
    getVisibleCourseIds(viewer.brandId),
    getEnrollmentForCourse(viewer.brandId, viewer.customerId, courseId),
  ]);

  if (!course || !visibleSet.has(courseId) || !enrollment) return null;

  const lessons = await listOrderedLessonsForCourse(viewer.brandId, courseId);
  const progressRows = await listProgressForEnrollment(enrollment.id);

  const unlockStates = calculateLessonUnlockStates({
    lessons: lessons.map((lesson) => ({
      id: lesson.id,
      module_position: lesson.module_position,
      lesson_position: lesson.position,
      metadata: lesson.metadata,
    })),
    progressRows,
    enrollmentDate: enrollment.enrolled_at,
    courseMetadata: course.metadata,
  });

  const resumeLessonId = getResumeLessonId(
    sortLessonsForDelivery(
      lessons.map((lesson) => ({
        id: lesson.id,
        module_position: lesson.module_position,
        lesson_position: lesson.position,
        metadata: lesson.metadata,
      })),
    ),
    unlockStates,
    progressRows,
  );

  return {
    courseId: course.id,
    courseTitle: course.title,
    courseDescription: course.description,
    enrollmentId: enrollment.id,
    enrollmentDate: enrollment.enrolled_at,
    lessons,
    progressRows,
    unlockStates,
    resumeLessonId,
  };
};
