import type { JsonObject } from "@/lib/courses/types";
import { normalizeText } from "@/lib/courses/utils";

type VideoNestConfig = {
  embedUrl: string | null;
  provider: "videonest" | "html5" | "none";
  source: string | null;
};

const getFromMetadata = (metadata: JsonObject, key: string): string | null => {
  return normalizeText(metadata[key]);
};

export const resolveVideoSource = (
  videoUrl: string | null,
  metadata: JsonObject,
): VideoNestConfig => {
  const normalizedVideoUrl = normalizeText(videoUrl);
  const explicitEmbed = getFromMetadata(metadata, "videonest_embed_url");
  if (explicitEmbed) {
    return {
      embedUrl: explicitEmbed,
      provider: "videonest",
      source: explicitEmbed,
    };
  }

  const videoNestAssetId =
    getFromMetadata(metadata, "videonest_asset_id") ?? getFromMetadata(metadata, "videonest_video_id");

  if (videoNestAssetId) {
    // Placeholder embed format until VideoNest API/docs are integrated.
    const embedUrl = `https://player.videonest.example/embed/${encodeURIComponent(videoNestAssetId)}`;
    return {
      embedUrl,
      provider: "videonest",
      source: videoNestAssetId,
    };
  }

  if (normalizedVideoUrl) {
    return {
      embedUrl: normalizedVideoUrl,
      provider: "html5",
      source: normalizedVideoUrl,
    };
  }

  return {
    embedUrl: null,
    provider: "none",
    source: null,
  };
};
