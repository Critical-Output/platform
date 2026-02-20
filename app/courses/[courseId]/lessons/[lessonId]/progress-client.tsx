"use client";

import { useState } from "react";

type ProgressClientProps = {
  courseId: string;
  lessonId: string;
  initialPercent: number;
  initialPositionSeconds: number;
  initialWatchTimeSeconds: number;
};

type ProgressResponse = {
  ok: boolean;
  error?: string;
  progress?: {
    percent_complete: number;
    metadata?: {
      last_position_seconds?: number;
      watch_time_seconds?: number;
    };
  };
  course_progress_percent?: number;
  course_completed?: boolean;
};

export default function ProgressClient({
  courseId,
  lessonId,
  initialPercent,
  initialPositionSeconds,
  initialWatchTimeSeconds,
}: ProgressClientProps) {
  const [percent, setPercent] = useState<number>(initialPercent);
  const [positionSeconds, setPositionSeconds] = useState<number>(initialPositionSeconds);
  const [watchTimeSeconds, setWatchTimeSeconds] = useState<number>(initialWatchTimeSeconds);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async (payload: {
    completion_source: "manual" | "time-based" | "quiz-pass" | null;
    mark_complete: boolean;
  }) => {
    setSaving(true);
    setStatus(null);
    setError(null);

    try {
      const response = await fetch(`/api/courses/${courseId}/lessons/${lessonId}/progress`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          percent_complete: percent,
          last_position_seconds: positionSeconds,
          watch_time_seconds: watchTimeSeconds,
          completion_source: payload.completion_source,
          mark_complete: payload.mark_complete,
        }),
      });

      const json = (await response.json()) as ProgressResponse;
      if (!response.ok || !json.ok) {
        setError(json.error ?? "Unable to save progress.");
        return;
      }

      const nextPercent = json.progress?.percent_complete;
      if (typeof nextPercent === "number") setPercent(nextPercent);
      const nextPosition = json.progress?.metadata?.last_position_seconds;
      if (typeof nextPosition === "number") setPositionSeconds(nextPosition);
      const nextWatch = json.progress?.metadata?.watch_time_seconds;
      if (typeof nextWatch === "number") setWatchTimeSeconds(nextWatch);

      if (json.course_completed) {
        setStatus("Lesson progress saved. Course completed.");
      } else if (typeof json.course_progress_percent === "number") {
        setStatus(`Lesson progress saved. Course progress: ${json.course_progress_percent}%.`);
      } else {
        setStatus("Lesson progress saved.");
      }
    } catch {
      setError("Unable to save progress.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-4 rounded border border-gray-200 p-4">
      <h2 className="text-lg font-semibold">Progress tracking</h2>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700" htmlFor="percent-complete">
          Completion %
        </label>
        <input
          id="percent-complete"
          type="range"
          min={0}
          max={100}
          value={percent}
          onChange={(event) => {
            setPercent(Number(event.target.value));
          }}
          className="w-full"
        />
        <p className="text-sm text-gray-600">{percent}%</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="block font-medium text-gray-700">Last position (seconds)</span>
          <input
            type="number"
            min={0}
            value={positionSeconds}
            onChange={(event) => {
              setPositionSeconds(Number(event.target.value));
            }}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
          />
        </label>

        <label className="text-sm">
          <span className="block font-medium text-gray-700">Watch time (seconds)</span>
          <input
            type="number"
            min={0}
            value={watchTimeSeconds}
            onChange={(event) => {
              setWatchTimeSeconds(Number(event.target.value));
            }}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            void save({ completion_source: null, mark_complete: false });
          }}
          className="rounded border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Save progress
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            void save({ completion_source: "manual", mark_complete: true });
          }}
          className="rounded border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Mark complete (manual)
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            void save({ completion_source: "time-based", mark_complete: false });
          }}
          className="rounded border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Mark complete (time-based)
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            void save({ completion_source: "quiz-pass", mark_complete: true });
          }}
          className="rounded border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Mark complete (quiz-pass)
        </button>
      </div>

      {status ? (
        <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700">{status}</p>
      ) : null}
      {error ? (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
    </section>
  );
}
