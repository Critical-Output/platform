"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { AvailableCourse, StudentDashboardCourse } from "@/lib/courses/dashboard";

type StudentDashboardClientProps = {
  enrolled: StudentDashboardCourse[];
  available: AvailableCourse[];
};

export default function StudentDashboardClient({
  enrolled,
  available,
}: StudentDashboardClientProps) {
  const router = useRouter();
  const [pendingCourseId, setPendingCourseId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const enroll = async (courseId: string) => {
    setPendingCourseId(courseId);
    setError(null);

    try {
      const response = await fetch(`/api/courses/${courseId}/enroll`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const json = (await response.json()) as { error?: string };
        setError(json.error ?? "Unable to enroll in course.");
        return;
      }

      router.refresh();
    } catch {
      setError("Unable to enroll in course.");
    } finally {
      setPendingCourseId(null);
    }
  };

  return (
    <section className="space-y-10">
      {error ? (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Enrolled courses</h2>
        {enrolled.length === 0 ? (
          <p className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
            You are not enrolled in any courses yet.
          </p>
        ) : null}

        {enrolled.map((course) => (
          <article key={course.enrollmentId} className="rounded border border-gray-200 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">{course.title}</h3>
                {course.description ? (
                  <p className="mt-1 text-sm text-gray-600">{course.description}</p>
                ) : null}
              </div>

              {course.resumeLessonId ? (
                <Link
                  href={`/courses/${course.courseId}/lessons/${course.resumeLessonId}`}
                  className="rounded border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50"
                >
                  Resume learning
                </Link>
              ) : null}
            </div>

            <div className="mt-4 space-y-1">
              <div className="h-2 w-full overflow-hidden rounded bg-gray-200">
                <div
                  className="h-full bg-blue-600 transition-all"
                  style={{ width: `${course.progressPercent}%` }}
                />
              </div>
              <p className="text-sm text-gray-600">
                {course.progressPercent}% complete ({course.completedLessons}/{course.totalLessons} lessons)
              </p>
            </div>

            {course.progressPercent >= 100 ? (
              <p className="mt-3">
                <Link
                  href={`/api/courses/${course.courseId}/certificate`}
                  className="text-sm font-medium text-blue-700 hover:underline"
                >
                  Download certificate PDF
                </Link>
              </p>
            ) : null}
          </article>
        ))}
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Available courses</h2>
        {available.length === 0 ? (
          <p className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
            No additional courses are available for this brand.
          </p>
        ) : null}

        {available.map((course) => (
          <article key={course.courseId} className="rounded border border-gray-200 p-4">
            <h3 className="text-lg font-semibold">{course.title}</h3>
            {course.description ? <p className="mt-1 text-sm text-gray-600">{course.description}</p> : null}
            <p className="mt-2 text-sm text-gray-500">
              Level: {course.level ?? "N/A"} | Duration: {course.durationMinutes ?? "N/A"} min
            </p>

            <button
              type="button"
              onClick={() => {
                void enroll(course.courseId);
              }}
              disabled={pendingCourseId === course.courseId}
              className="mt-3 rounded border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pendingCourseId === course.courseId ? "Enrolling..." : "Enroll"}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
