import type { JsonObject } from "@/lib/courses/types";
import { resolveVideoSource } from "@/lib/courses/videonest";

type VideoNestPlayerProps = {
  lessonTitle: string;
  videoUrl: string | null;
  metadata: JsonObject;
};

export default function VideoNestPlayer({
  lessonTitle,
  videoUrl,
  metadata,
}: VideoNestPlayerProps) {
  const source = resolveVideoSource(videoUrl, metadata);

  if (source.provider === "videonest" && source.embedUrl) {
    return (
      <div className="space-y-3">
        <div className="aspect-video w-full overflow-hidden rounded border border-gray-200 bg-black">
          <iframe
            title={`VideoNest player - ${lessonTitle}`}
            src={source.embedUrl}
            className="h-full w-full"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
          />
        </div>
        <p className="text-xs text-gray-500">
          VideoNest embed is running in placeholder mode until API/docs details are finalized.
        </p>
      </div>
    );
  }

  if (source.provider === "html5" && source.embedUrl) {
    return (
      <div className="space-y-3">
        <video controls className="aspect-video w-full rounded border border-gray-200 bg-black" src={source.embedUrl}>
          Sorry, your browser does not support embedded video playback.
        </video>
      </div>
    );
  }

  return (
    <div className="rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
      No video source configured for this lesson.
    </div>
  );
}
