"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type DashboardCourse = {
  id: string;
  title: string;
  description: string | null;
  progress_percent?: number;
  resume_lesson_id?: string | null;
  enrollment?: {
    id: string;
    status: string;
    enrolled_at?: string;
  } | null;
};

type CoursesResponse = {
  ok: boolean;
  error?: string;
  courses?: DashboardCourse[];
};

const clampPercent = (value: unknown): number => {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100, num));
};

export default function StudentCoursesDashboardPage() {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [courses, setCourses] = useState<DashboardCourse[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/courses", { cache: "no-store" });
      const data = (await response.json()) as CoursesResponse;

      if (!response.ok || !data.ok) {
        setError(data.error ?? "Could not load dashboard courses.");
        setCourses([]);
        return;
      }

      const enrolled = (data.courses ?? []).filter((course) => !!course.enrollment);
      setCourses(enrolled);
    } catch {
      setError("Could not load dashboard courses.");
      setCourses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const completedCourses = useMemo(() => {
    return courses.filter((course) => clampPercent(course.progress_percent ?? 0) >= 100).length;
  }, [courses]);

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Student Dashboard</h1>
          <p className="mt-2 text-sm text-gray-600">Track enrolled courses and jump back into lessons.</p>
        </div>

        <Link href="/courses" className="rounded border border-gray-300 px-3 py-2 text-sm">
          Browse More Courses
        </Link>
      </header>

      <section className="grid gap-3 rounded border border-gray-200 bg-white p-4 sm:grid-cols-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Enrolled Courses</p>
          <p className="mt-1 text-2xl font-semibold">{courses.length}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Completed Courses</p>
          <p className="mt-1 text-2xl font-semibold">{completedCourses}</p>
        </div>
      </section>

      {loading ? <p className="text-sm text-gray-600">Loading dashboard...</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <section className="space-y-4">
        {courses.map((course) => {
          const progress = clampPercent(course.progress_percent ?? 0);

          return (
            <article key={course.id} className="space-y-3 rounded border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{course.title}</h2>
                  <p className="mt-1 text-sm text-gray-600">{course.description ?? "No description yet."}</p>
                </div>
                <p className="text-sm font-medium text-gray-700">{progress.toFixed(1)}%</p>
              </div>

              <div className="h-2 rounded bg-gray-200">
                <div className="h-2 rounded bg-emerald-600" style={{ width: `${progress}%` }} />
              </div>

              <div className="flex flex-wrap gap-2">
                <Link href={`/courses/${course.id}`} className="rounded border border-gray-300 px-3 py-2 text-sm">
                  Open Course
                </Link>
                {course.resume_lesson_id ? (
                  <Link
                    href={`/courses/${course.id}?lesson=${course.resume_lesson_id}`}
                    className="rounded border border-emerald-300 px-3 py-2 text-sm text-emerald-700"
                  >
                    Resume Learning
                  </Link>
                ) : null}
              </div>
            </article>
          );
        })}
      </section>

      {!loading && courses.length === 0 ? (
        <p className="rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
          You are not enrolled in any courses yet.
        </p>
      ) : null}
    </main>
  );
}
