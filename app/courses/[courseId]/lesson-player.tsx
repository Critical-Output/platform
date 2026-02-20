"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";

type LessonPlayerProps = {
  courseId: string;
  lessonId: string;
  lessonTitle: string;
  videoUrl: string | null;
  videonestVideoId: string | null;
  initialPercent: number;
  initialLastPosition: number;
  initialWatchTime: number;
  onSaved: () => void;
};

type ProgressResponse = {
  ok: boolean;
  error?: string;
  certificate_id?: string | null;
};

const toNumber = (value: unknown): number => {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return 0;
  return num;
};

const isFileVideo = (url: string): boolean => {
  return /\.(mp4|webm|ogg)(\?|$)/i.test(url);
};

export default function LessonPlayer({
  courseId,
  lessonId,
  lessonTitle,
  videoUrl,
  videonestVideoId,
  initialPercent,
  initialLastPosition,
  initialWatchTime,
  onSaved,
}: LessonPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastPersistAtRef = useRef<number>(0);

  const [percent, setPercent] = useState<number>(toNumber(initialPercent));
  const [lastPosition, setLastPosition] = useState<number>(toNumber(initialLastPosition));
  const [watchTime, setWatchTime] = useState<number>(toNumber(initialWatchTime));
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [certificateId, setCertificateId] = useState<string | null>(null);

  const embedUrl = useMemo(() => {
    if (videonestVideoId) {
      return `https://player.videonest.io/embed/${encodeURIComponent(videonestVideoId)}`;
    }

    if (videoUrl && !isFileVideo(videoUrl)) {
      return videoUrl;
    }

    return null;
  }, [videonestVideoId, videoUrl]);

  const saveProgress = useCallback(
    async (payload: Record<string, unknown>) => {
      setSaving(true);
      setError(null);

      try {
        const response = await fetch(`/api/courses/${courseId}/lessons/${lessonId}/progress`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        const data = (await response.json()) as ProgressResponse;
        if (!response.ok || !data.ok) {
          setError(data.error ?? "Could not save progress.");
          return;
        }

        if (data.certificate_id) {
          setCertificateId(data.certificate_id);
        }

        onSaved();
      } catch {
        setError("Could not save progress.");
      } finally {
        setSaving(false);
      }
    },
    [courseId, lessonId, onSaved],
  );

  const saveCompletion = useCallback(
    async (method: "manual" | "quiz-pass" | "time-based") => {
      setSaving(true);
      setError(null);

      try {
        const response = await fetch(`/api/courses/${courseId}/lessons/${lessonId}/complete`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            method,
            last_position_seconds: lastPosition,
            watch_time_seconds: watchTime,
          }),
        });

        const data = (await response.json()) as ProgressResponse;
        if (!response.ok || !data.ok) {
          setError(data.error ?? "Could not complete lesson.");
          return;
        }

        setPercent(100);
        onSaved();
      } catch {
        setError("Could not complete lesson.");
      } finally {
        setSaving(false);
      }
    },
    [courseId, lessonId, lastPosition, onSaved, watchTime],
  );

  const persistFromVideoElement = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const current = video.currentTime;
    const nextPercent = duration > 0 ? Math.min(100, (current / duration) * 100) : percent;

    setPercent(nextPercent);
    setLastPosition(current);
    setWatchTime((prev) => Math.max(prev, current));

    await saveProgress({
      percent_complete: nextPercent,
      last_position_seconds: current,
      watch_time_seconds: Math.max(watchTime, current),
      completion_method: "time-based",
    });
  }, [percent, saveProgress, watchTime]);

  const onVideoTimeUpdate = useCallback(async () => {
    const now = Date.now();
    if (now - lastPersistAtRef.current < 8000) return;
    lastPersistAtRef.current = now;
    await persistFromVideoElement();
  }, [persistFromVideoElement]);

  const onVideoLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (initialLastPosition > 0 && initialLastPosition < video.duration) {
      video.currentTime = initialLastPosition;
    }
  }, [initialLastPosition]);

  return (
    <section className="space-y-4 rounded border border-gray-200 bg-white p-4">
      <header>
        <h3 className="text-lg font-semibold">{lessonTitle}</h3>
        <p className="mt-1 text-sm text-gray-600">Progress: {percent.toFixed(1)}%</p>
      </header>

      {videoUrl && isFileVideo(videoUrl) ? (
        <video
          ref={videoRef}
          src={videoUrl}
          controls
          className="w-full rounded border border-gray-200 bg-black"
          onLoadedMetadata={onVideoLoadedMetadata}
          onTimeUpdate={() => {
            void onVideoTimeUpdate();
          }}
          onPause={() => {
            void persistFromVideoElement();
          }}
          onEnded={() => {
            void persistFromVideoElement();
          }}
        />
      ) : embedUrl ? (
        <iframe
          src={embedUrl}
          className="h-72 w-full rounded border border-gray-200"
          allow="autoplay; fullscreen"
          title={lessonTitle}
        />
      ) : (
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          Video source is missing. Add `video_url` or `metadata.videonest_video_id` for this lesson.
        </p>
      )}

      {embedUrl ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm">
            Completion %
            <input
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={Number.isFinite(percent) ? percent : 0}
              onChange={(event) => {
                setPercent(toNumber(event.target.value));
              }}
            />
          </label>
          <label className="text-sm">
            Last Position (sec)
            <input
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
              type="number"
              min={0}
              step={0.1}
              value={Number.isFinite(lastPosition) ? lastPosition : 0}
              onChange={(event) => {
                setLastPosition(toNumber(event.target.value));
              }}
            />
          </label>
          <label className="text-sm">
            Watch Time (sec)
            <input
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
              type="number"
              min={0}
              step={0.1}
              value={Number.isFinite(watchTime) ? watchTime : 0}
              onChange={(event) => {
                setWatchTime(toNumber(event.target.value));
              }}
            />
          </label>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={saving}
          onClick={() => {
            void saveProgress({
              percent_complete: percent,
              last_position_seconds: lastPosition,
              watch_time_seconds: watchTime,
              completion_method: "time-based",
            });
          }}
        >
          {saving ? "Saving..." : "Save Progress"}
        </button>

        <button
          type="button"
          className="rounded border border-gray-300 px-3 py-2 text-sm font-medium"
          disabled={saving}
          onClick={() => {
            void saveCompletion("manual");
          }}
        >
          Mark Complete (Manual)
        </button>

        <button
          type="button"
          className="rounded border border-gray-300 px-3 py-2 text-sm font-medium"
          disabled={saving}
          onClick={() => {
            void saveCompletion("quiz-pass");
          }}
        >
          Mark Complete (Quiz Pass)
        </button>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {certificateId ? (
        <p className="text-sm text-emerald-700">
          Certificate generated. {" "}
          <Link href={`/api/certificates/${certificateId}/pdf`} className="underline">
            Download PDF
          </Link>
        </p>
      ) : null}
    </section>
  );
}
