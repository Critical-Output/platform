"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import LessonPlayer from "./lesson-player";

type ApiResponse = {
  ok: boolean;
  error?: string;
  course?: {
    id: string;
    title: string;
    description: string | null;
    level: string | null;
    duration_minutes: number | null;
  };
  enrollment?: {
    id: string;
    status: string;
    enrolled_at: string;
  } | null;
  requires_enrollment?: boolean;
  modules?: Array<{
    id: string;
    title: string;
    lessons: Array<{
      id: string;
      title: string;
      content: string | null;
      video_url: string | null;
      metadata: Record<string, unknown> | null;
      progress?: {
        percent_complete: number;
        completed_at: string | null;
        metadata: Record<string, unknown> | null;
      } | null;
      unlock?: {
        unlocked: boolean;
        reason: string;
      } | null;
    }>;
  }>;
  progress_percent?: number;
  resume_lesson_id?: string | null;
  certificate?: {
    id: string;
    certificate_number: string | null;
    issued_at: string;
  } | null;
};

const toNumber = (value: unknown): number => {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return 0;
  return num;
};

export default function CourseDetailClient({
  courseId,
  initialLessonId,
}: {
  courseId: string;
  initialLessonId?: string | null;
}) {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState<boolean>(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/courses/${courseId}`, { cache: "no-store" });
      const json = (await response.json()) as ApiResponse;

      if (!response.ok || !json.ok) {
        setError(json.error ?? "Could not load course.");
        setData(null);
        return;
      }

      setData(json);
      if (initialLessonId) {
        setSelectedLessonId(initialLessonId);
      } else if (json.resume_lesson_id) {
        setSelectedLessonId(json.resume_lesson_id);
      } else {
        const first = json.modules?.flatMap((module) => module.lessons ?? [])[0];
        setSelectedLessonId(first?.id ?? null);
      }
    } catch {
      setError("Could not load course.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [courseId, initialLessonId]);

  useEffect(() => {
    void load();
  }, [load]);

  const lessons = useMemo(() => {
    return data?.modules?.flatMap((module) => module.lessons ?? []) ?? [];
  }, [data?.modules]);

  const selectedLesson = useMemo(() => {
    return lessons.find((lesson) => lesson.id === selectedLessonId) ?? lessons[0] ?? null;
  }, [lessons, selectedLessonId]);

  const enroll = useCallback(async () => {
    setEnrolling(true);
    setError(null);

    try {
      const response = await fetch(`/api/courses/${courseId}/enroll`, {
        method: "POST",
      });

      const json = (await response.json()) as { ok: boolean; error?: string };

      if (!response.ok || !json.ok) {
        setError(json.error ?? "Could not enroll.");
        return;
      }

      await load();
    } catch {
      setError("Could not enroll.");
    } finally {
      setEnrolling(false);
    }
  }, [courseId, load]);

  if (loading) {
    return <p className="p-6 text-sm text-gray-600">Loading course...</p>;
  }

  if (error) {
    return <p className="p-6 text-sm text-red-700">{error}</p>;
  }

  if (!data?.course) {
    return <p className="p-6 text-sm text-gray-600">Course not found.</p>;
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">{data.course.title}</h1>
          <p className="mt-2 text-sm text-gray-600">{data.course.description ?? "No description yet."}</p>
          <p className="mt-1 text-xs text-gray-500">
            Level: {data.course.level ?? "Not set"} • Duration: {data.course.duration_minutes ?? "-"} min
          </p>
        </div>

        <div className="flex gap-2">
          <Link href="/courses" className="rounded border border-gray-300 px-3 py-2 text-sm">
            Course Catalog
          </Link>
          <Link href="/dashboard/courses" className="rounded border border-gray-300 px-3 py-2 text-sm">
            Student Dashboard
          </Link>
        </div>
      </div>

      {data.enrollment ? (
        <div className="rounded border border-gray-200 bg-white p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium">Course Progress</span>
            <span>{toNumber(data.progress_percent).toFixed(1)}%</span>
          </div>
          <div className="h-2 rounded bg-gray-200">
            <div
              className="h-2 rounded bg-blue-600"
              style={{ width: `${Math.min(100, Math.max(0, toNumber(data.progress_percent)))}%` }}
            />
          </div>

          {data.certificate ? (
            <p className="mt-3 text-sm text-emerald-700">
              Certificate issued ({data.certificate.certificate_number ?? "pending code"}). {" "}
              <Link href={`/api/certificates/${data.certificate.id}/pdf`} className="underline">
                Download PDF
              </Link>
            </p>
          ) : null}
        </div>
      ) : (
        <div className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p>You are not enrolled in this course yet.</p>
          <button
            type="button"
            className="mt-3 rounded bg-amber-900 px-3 py-2 font-medium text-white disabled:opacity-50"
            onClick={() => {
              void enroll();
            }}
            disabled={enrolling}
          >
            {enrolling ? "Enrolling..." : "Enroll Now"}
          </button>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-[320px_1fr]">
        <aside className="space-y-4 rounded border border-gray-200 bg-white p-4">
          <h2 className="text-lg font-semibold">Lessons</h2>

          {data.modules?.map((module) => (
            <div key={module.id} className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-800">{module.title}</h3>
              <ul className="space-y-1">
                {module.lessons.map((lesson) => {
                  const unlocked = lesson.unlock?.unlocked ?? !!data.enrollment;
                  const complete =
                    !!lesson.progress?.completed_at || toNumber(lesson.progress?.percent_complete ?? 0) >= 100;

                  return (
                    <li key={lesson.id}>
                      <button
                        type="button"
                        className={`w-full rounded border px-2 py-2 text-left text-sm ${
                          selectedLesson?.id === lesson.id
                            ? "border-blue-500 bg-blue-50"
                            : "border-gray-200 bg-white"
                        } ${!unlocked ? "opacity-60" : ""}`}
                        onClick={() => {
                          if (!unlocked) return;
                          setSelectedLessonId(lesson.id);
                        }}
                        disabled={!unlocked}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span>{lesson.title}</span>
                          <span className="text-xs text-gray-500">
                            {complete ? "Complete" : unlocked ? "In Progress" : "Locked"}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </aside>

        <section className="space-y-4">
          {selectedLesson ? (
            <>
              {selectedLesson.content ? (
                <article className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-700">
                  {selectedLesson.content}
                </article>
              ) : null}

              {(selectedLesson.unlock?.unlocked ?? !!data.enrollment) ? (
                <LessonPlayer
                  courseId={courseId}
                  lessonId={selectedLesson.id}
                  lessonTitle={selectedLesson.title}
                  videoUrl={selectedLesson.video_url}
                  videonestVideoId={
                    (selectedLesson.metadata?.videonest_video_id as string | undefined) ?? null
                  }
                  initialPercent={toNumber(selectedLesson.progress?.percent_complete ?? 0)}
                  initialLastPosition={toNumber(
                    selectedLesson.progress?.metadata?.video_last_position_seconds ?? 0,
                  )}
                  initialWatchTime={toNumber(
                    selectedLesson.progress?.metadata?.video_watch_time_seconds ?? 0,
                  )}
                  onSaved={() => {
                    void load();
                  }}
                />
              ) : (
                <p className="rounded border border-gray-300 bg-gray-50 p-4 text-sm text-gray-700">
                  This lesson is locked. {selectedLesson.unlock?.reason === "waiting_for_previous_lesson"
                    ? "Complete previous lessons to unlock it."
                    : "It will unlock according to your drip schedule."}
                </p>
              )}
            </>
          ) : (
            <p className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-600">
              No lessons available yet.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
