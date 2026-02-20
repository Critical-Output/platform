import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import ProgressClient from "@/app/courses/[courseId]/lessons/[lessonId]/progress-client";
import VideoNestPlayer from "@/app/courses/video-nest-player";
import { resolveViewerForPage } from "@/lib/courses/auth";
import { loadCourseLearningContext } from "@/lib/courses/learning";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type LessonPageProps = {
  params: {
    courseId: string;
    lessonId: string;
  };
};

const getNumericMetadataValue = (metadata: unknown, key: "last_position_seconds" | "watch_time_seconds"): number => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return 0;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
};

export default async function LessonPage({ params }: LessonPageProps) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const encodedNext = encodeURIComponent(`/courses/${params.courseId}/lessons/${params.lessonId}`);
    redirect(`/auth/login?next=${encodedNext}`);
  }

  const viewer = await resolveViewerForPage();
  const context = await loadCourseLearningContext(viewer, params.courseId);
  if (!context) notFound();

  const lesson = context.lessons.find((row) => row.id === params.lessonId);
  if (!lesson) notFound();

  const unlock = context.unlockStates.find((state) => state.lessonId === lesson.id);
  const progress = context.progressRows.find((row) => row.lesson_id === lesson.id) ?? null;
  const lastPositionSeconds = getNumericMetadataValue(progress?.metadata, "last_position_seconds");
  const watchTimeSeconds = getNumericMetadataValue(progress?.metadata, "watch_time_seconds");

  const nextUnlockedLesson = context.lessons.find((candidate) => {
    if (candidate.id === lesson.id) return false;
    const state = context.unlockStates.find((entry) => entry.lessonId === candidate.id);
    return state?.isUnlocked;
  });

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10">
      <p className="text-sm text-gray-600">
        <Link href="/dashboard" className="text-blue-700 hover:underline">
          Dashboard
        </Link>{" "}
        / <span className="font-medium text-gray-900">{context.courseTitle}</span>
      </p>

      <h1 className="mt-3 text-3xl font-semibold">{lesson.title}</h1>
      {context.courseDescription ? <p className="mt-2 text-sm text-gray-600">{context.courseDescription}</p> : null}

      {!unlock?.isUnlocked ? (
        <div className="mt-6 rounded border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-900">
          This lesson is locked by drip scheduling.
          {unlock?.availableAt ? ` Available after ${new Date(unlock.availableAt).toLocaleString()}.` : ""}
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <VideoNestPlayer lessonTitle={lesson.title} videoUrl={lesson.video_url} metadata={lesson.metadata} />
          <ProgressClient
            courseId={params.courseId}
            lessonId={params.lessonId}
            initialPercent={progress?.percent_complete ?? 0}
            initialPositionSeconds={lastPositionSeconds}
            initialWatchTimeSeconds={watchTimeSeconds}
          />
        </div>
      )}

      <section className="mt-8 rounded border border-gray-200 p-4">
        <h2 className="text-lg font-semibold">Course outline</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {context.lessons.map((candidate) => {
            const state = context.unlockStates.find((entry) => entry.lessonId === candidate.id);
            const isCurrent = candidate.id === lesson.id;
            const isUnlocked = state?.isUnlocked ?? false;
            const candidateProgress = context.progressRows.find((row) => row.lesson_id === candidate.id);
            const completed = Boolean(
              candidateProgress?.completed_at || (candidateProgress?.percent_complete ?? 0) >= 100,
            );

            return (
              <li key={candidate.id} className="flex items-center justify-between gap-3">
                <span className={isCurrent ? "font-semibold text-gray-900" : "text-gray-700"}>
                  {candidate.title}
                  {completed ? " (completed)" : ""}
                </span>
                {isUnlocked ? (
                  <Link
                    href={`/courses/${params.courseId}/lessons/${candidate.id}`}
                    className="text-blue-700 hover:underline"
                  >
                    Open
                  </Link>
                ) : (
                  <span className="text-gray-400">Locked</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <div className="mt-6 flex items-center gap-3">
        {nextUnlockedLesson ? (
          <Link
            href={`/courses/${params.courseId}/lessons/${nextUnlockedLesson.id}`}
            className="rounded border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Next unlocked lesson
          </Link>
        ) : null}
        <Link
          href={`/api/courses/${params.courseId}/certificate?format=json`}
          className="rounded border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50"
        >
          Check certificate status
        </Link>
      </div>
    </main>
  );
}
