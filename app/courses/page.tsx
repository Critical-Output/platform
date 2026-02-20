"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type CourseCard = {
  id: string;
  title: string;
  description: string | null;
  level: string | null;
  duration_minutes: number | null;
  progress_percent?: number;
  resume_lesson_id?: string | null;
  enrollment?: {
    id: string;
    status: string;
  } | null;
};

type CoursesResponse = {
  ok: boolean;
  error?: string;
  courses?: CourseCard[];
};

const clampPercent = (value: unknown): number => {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.min(100, Math.max(0, num));
};

export default function CoursesPage() {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [courses, setCourses] = useState<CourseCard[]>([]);
  const [enrollingCourseId, setEnrollingCourseId] = useState<string | null>(null);

  const loadCourses = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/courses", { cache: "no-store" });
      const data = (await response.json()) as CoursesResponse;

      if (!response.ok || !data.ok) {
        setError(data.error ?? "Could not load courses.");
        setCourses([]);
        return;
      }

      setCourses(data.courses ?? []);
    } catch {
      setError("Could not load courses.");
      setCourses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCourses();
  }, [loadCourses]);

  const enroll = useCallback(async (courseId: string) => {
    setEnrollingCourseId(courseId);
    setError(null);

    try {
      const response = await fetch(`/api/courses/${courseId}/enroll`, {
        method: "POST",
      });

      const data = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !data.ok) {
        setError(data.error ?? "Could not enroll in course.");
        return;
      }

      await loadCourses();
    } catch {
      setError("Could not enroll in course.");
    } finally {
      setEnrollingCourseId(null);
    }
  }, [loadCourses]);

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Course Catalog</h1>
          <p className="mt-2 text-sm text-gray-600">
            Browse available courses and enroll to start learning.
          </p>
        </div>

        <div className="flex gap-2">
          <Link href="/dashboard/courses" className="rounded border border-gray-300 px-3 py-2 text-sm">
            Student Dashboard
          </Link>
          <Link href="/admin/courses" className="rounded border border-gray-300 px-3 py-2 text-sm">
            Instructor Admin
          </Link>
        </div>
      </header>

      {loading ? <p className="text-sm text-gray-600">Loading courses...</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <div className="grid gap-4 md:grid-cols-2">
        {courses.map((course) => {
          const progress = clampPercent(course.progress_percent ?? 0);

          return (
            <article key={course.id} className="space-y-3 rounded border border-gray-200 bg-white p-4">
              <div>
                <h2 className="text-lg font-semibold">{course.title}</h2>
                <p className="mt-1 text-sm text-gray-600">{course.description ?? "No description yet."}</p>
                <p className="mt-1 text-xs text-gray-500">
                  Level: {course.level ?? "Not set"} • Duration: {course.duration_minutes ?? "-"} min
                </p>
              </div>

              {course.enrollment ? (
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs text-gray-600">
                    <span>Progress</span>
                    <span>{progress.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 rounded bg-gray-200">
                    <div className="h-2 rounded bg-blue-600" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Link href={`/courses/${course.id}`} className="rounded border border-gray-300 px-3 py-2 text-sm">
                  View Course
                </Link>

                {course.enrollment ? null : (
                  <button
                    type="button"
                    className="rounded bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                    disabled={enrollingCourseId === course.id}
                    onClick={() => {
                      void enroll(course.id);
                    }}
                  >
                    {enrollingCourseId === course.id ? "Enrolling..." : "Enroll"}
                  </button>
                )}

                {course.enrollment && course.resume_lesson_id ? (
                  <Link
                    href={`/courses/${course.id}?lesson=${course.resume_lesson_id}`}
                    className="rounded border border-blue-300 px-3 py-2 text-sm text-blue-700"
                  >
                    Resume Learning
                  </Link>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      {!loading && courses.length === 0 ? (
        <p className="rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
          No courses are currently visible for this brand.
        </p>
      ) : null}
    </main>
  );
}
