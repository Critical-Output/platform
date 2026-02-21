"use client";

import type { CSSProperties } from "react";

export type VideonestConfig = {
  channelId?: number | string;
};

export type VideoMetadata = {
  title: string;
  channelId?: number | string;
  description?: string;
  tags?: string[];
};

export type UploadStatus = "uploading" | "finalizing" | "failed" | "stalled";

export type UploadOptions = {
  metadata: VideoMetadata;
  thumbnail?: File | null;
  onProgress?: (progress: number, status: UploadStatus) => void;
  chunkSizeBytes?: number;
};

export type UploadResult = {
  success: boolean;
  message?: string;
  video?: {
    id: string;
  };
};

type UploadChunkResponse = {
  ok: boolean;
  error?: string;
};

type FinalizeUploadResponse = {
  ok: boolean;
  error?: string;
  video?: {
    id: string;
  };
};

const defaultChunkSizeBytes = 5 * 1024 * 1024;

const generateUploadId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "_");
  }

  return `upload_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
};

const fileToDataUrl = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Unable to read file."));
    };
    reader.onerror = () => {
      reject(new Error("Unable to read file."));
    };
    reader.readAsDataURL(file);
  });
};

export const uploadVideo = async (
  file: File,
  options: UploadOptions,
  config?: VideonestConfig,
): Promise<UploadResult> => {
  if (!(file instanceof File)) {
    return { success: false, message: "A video file is required." };
  }

  const chunkSize = Math.max(256 * 1024, Math.trunc(options.chunkSizeBytes ?? defaultChunkSizeBytes));
  const totalChunks = Math.max(1, Math.ceil(file.size / chunkSize));
  const uploadId = generateUploadId();
  const tags = options.metadata.tags ?? [];
  const thumbnailDataUrl = options.thumbnail ? await fileToDataUrl(options.thumbnail) : null;

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
    const start = chunkIndex * chunkSize;
    const end = Math.min(file.size, start + chunkSize);
    const chunk = file.slice(start, end);
    const formData = new FormData();

    formData.set("upload_id", uploadId);
    formData.set("chunk_index", String(chunkIndex));
    formData.set("chunk_total", String(totalChunks));
    formData.set("chunk", chunk, `${file.name}.part.${chunkIndex}`);
    formData.set("file_name", file.name);
    formData.set("file_type", file.type || "application/octet-stream");
    formData.set("title", options.metadata.title || file.name);
    if (options.metadata.description) {
      formData.set("description", options.metadata.description);
    }
    if (tags.length > 0) {
      formData.set("tags", JSON.stringify(tags));
    }
    if (options.metadata.channelId !== undefined) {
      formData.set("channel_id", String(options.metadata.channelId));
    } else if (config?.channelId !== undefined) {
      formData.set("channel_id", String(config.channelId));
    }
    if (chunkIndex === 0 && thumbnailDataUrl) {
      formData.set("thumbnail_data_url", thumbnailDataUrl);
    }

    let response: Response;
    try {
      response = await fetch("/api/videonest/upload", {
        method: "POST",
        body: formData,
      });
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Chunk upload failed.",
      };
    }

    const result = (await response.json()) as UploadChunkResponse;
    if (!response.ok || !result.ok) {
      return { success: false, message: result.error ?? "Chunk upload failed." };
    }

    const chunkProgress = Math.round(((chunkIndex + 1) / totalChunks) * 95);
    options.onProgress?.(chunkProgress, "uploading");
  }

  options.onProgress?.(97, "finalizing");

  let finalizeResponse: Response;
  try {
    finalizeResponse = await fetch("/api/videonest/upload", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ upload_id: uploadId }),
    });
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Upload finalization failed.",
    };
  }

  const finalizeResult = (await finalizeResponse.json()) as FinalizeUploadResponse;
  if (!finalizeResponse.ok || !finalizeResult.ok || !finalizeResult.video?.id) {
    return {
      success: false,
      message: finalizeResult.error ?? "Upload finalization failed.",
    };
  }

  options.onProgress?.(100, "finalizing");

  return {
    success: true,
    video: {
      id: finalizeResult.video.id,
    },
  };
};

type PreviewProps = {
  videoId: string | number;
  config?: VideonestConfig;
  style?: CSSProperties;
  className?: string;
};

const previewFrameStyle: CSSProperties = {
  width: "100%",
  minHeight: 220,
  border: "1px solid rgb(229, 231, 235)",
  borderRadius: 8,
};

export function VideonestPreview({ videoId, style, className }: PreviewProps) {
  const source = `https://player.videonest.io/embed/${encodeURIComponent(String(videoId))}?preview=1`;

  return (
    <iframe
      src={source}
      title={`VideoNest Preview ${videoId}`}
      className={className}
      style={{ ...previewFrameStyle, ...style }}
      allow="autoplay; fullscreen"
    />
  );
}

export function VideonestEmbed({ videoId, style, className }: PreviewProps) {
  const source = `https://player.videonest.io/embed/${encodeURIComponent(String(videoId))}`;

  return (
    <iframe
      src={source}
      title={`VideoNest Embed ${videoId}`}
      className={className}
      style={{ ...previewFrameStyle, ...style }}
      allow="autoplay; fullscreen"
    />
  );
}
