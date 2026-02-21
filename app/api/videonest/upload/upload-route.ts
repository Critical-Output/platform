import { openAsBlob, promises as fs } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

import { getCourseRequestContext } from "@/lib/courses/context";

type UploadManifest = {
  fileName: string;
  fileType: string;
  totalChunks: number;
  title: string;
  description: string | null;
  tags: string[];
  channelId: string | null;
  thumbnailDataUrl: string | null;
};

type UploadLimits = {
  maxChunkBytes: number;
  maxTotalBytes: number;
};

type PartFileMetadata = {
  index: number;
  filePath: string;
  size: number;
};

export type VideoNestUploadDependencies = {
  ensureAdmin: () => Promise<void>;
  fetch: typeof fetch;
  getUploadLimits: () => UploadLimits;
};

const uploadRootDir = path.join(process.cwd(), ".tmp", "videonest-uploads");
const DEFAULT_MAX_CHUNK_BYTES = 25 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_BYTES = 5 * 1024 * 1024 * 1024;

const asString = (value: FormDataEntryValue | null): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const parseIntField = (value: FormDataEntryValue | null): number | null => {
  const str = asString(value);
  if (!str) return null;
  const parsed = Number.parseInt(str, 10);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
};

const sanitizeUploadId = (value: string | null): string | null => {
  if (!value) return null;
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(value)) {
    return null;
  }

  return value;
};

const parseTags = (value: string | null): string[] => {
  if (!value) return [];
  if (value.startsWith("[")) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter((item) => item.length > 0);
      }
    } catch {
      return [];
    }
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

const decodeDataUrl = (dataUrl: string): { buffer: Buffer; mimeType: string } | null => {
  const match = dataUrl.match(/^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;

  const mimeType = match[1] ?? "application/octet-stream";
  const base64Data = match[2] ?? "";
  try {
    return {
      buffer: Buffer.from(base64Data, "base64"),
      mimeType,
    };
  } catch {
    return null;
  }
};

const parsePositiveInteger = (value: string | undefined): number | null => {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return null;
  }

  return parsed;
};

const resolveUploadLimits = (): UploadLimits => ({
  maxChunkBytes:
    parsePositiveInteger(process.env.VIDEONEST_UPLOAD_MAX_CHUNK_BYTES) ?? DEFAULT_MAX_CHUNK_BYTES,
  maxTotalBytes:
    parsePositiveInteger(process.env.VIDEONEST_UPLOAD_MAX_TOTAL_BYTES) ?? DEFAULT_MAX_TOTAL_BYTES,
});

const readManifest = async (manifestPath: string): Promise<UploadManifest | null> => {
  try {
    const raw = await fs.readFile(manifestPath, "utf8");
    const parsed = JSON.parse(raw) as UploadManifest;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.fileName !== "string" ||
      typeof parsed.fileType !== "string" ||
      !Number.isInteger(parsed.totalChunks) ||
      parsed.totalChunks < 1
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
};

const listPartFiles = async (uploadDir: string): Promise<PartFileMetadata[]> => {
  const entries = await fs.readdir(uploadDir);
  const parts: PartFileMetadata[] = [];

  for (const entry of entries) {
    if (!entry.endsWith(".part")) {
      continue;
    }

    const index = Number.parseInt(entry, 10);
    if (!Number.isInteger(index) || index < 0) {
      continue;
    }

    const filePath = path.join(uploadDir, entry);
    const fileStats = await fs.stat(filePath);
    if (!fileStats.isFile()) {
      continue;
    }

    parts.push({
      index,
      filePath,
      size: fileStats.size,
    });
  }

  return parts.sort((left, right) => left.index - right.index);
};

const sumPartBytes = (parts: PartFileMetadata[]): number =>
  parts.reduce((total, part) => total + part.size, 0);

const extractVideoId = (payload: unknown): string | null => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const root = payload as Record<string, unknown>;
  const directId = root.id;
  if (typeof directId === "string" || typeof directId === "number") {
    return String(directId);
  }

  const videoValue = root.video;
  if (videoValue && typeof videoValue === "object" && !Array.isArray(videoValue)) {
    const nestedId = (videoValue as Record<string, unknown>).id;
    if (typeof nestedId === "string" || typeof nestedId === "number") {
      return String(nestedId);
    }
  }

  const dataValue = root.data;
  if (dataValue && typeof dataValue === "object" && !Array.isArray(dataValue)) {
    const nestedId = (dataValue as Record<string, unknown>).id;
    if (typeof nestedId === "string" || typeof nestedId === "number") {
      return String(nestedId);
    }
  }

  return null;
};

const uploadToVideoNest = async (params: {
  videoBlob: Blob;
  manifest: UploadManifest;
  fetchFn: typeof fetch;
}): Promise<{ ok: true; videoId: string } | { ok: false; error: string }> => {
  const { videoBlob, manifest, fetchFn } = params;
  const apiKey = process.env.VIDEONEST_API_KEY;
  const envChannelId = process.env.VIDEONEST_CHANNEL_ID?.trim() || null;
  const channelId = manifest.channelId ?? envChannelId;

  if (!apiKey) {
    return { ok: false, error: "VIDEONEST_API_KEY is not configured." };
  }

  const thumbnail = manifest.thumbnailDataUrl ? decodeDataUrl(manifest.thumbnailDataUrl) : null;
  const filenameParts = manifest.fileName.split(".");
  const extension = filenameParts.length > 1 ? filenameParts[filenameParts.length - 1] : "mp4";

  const endpointCandidates = [
    "https://api.videonest.io/v1/videos/upload",
    channelId ? `https://api.videonest.io/v1/channels/${encodeURIComponent(channelId)}/videos` : null,
    "https://api.videonest.io/v1/videos",
  ].filter((endpoint): endpoint is string => Boolean(endpoint));

  let lastError = "Unable to upload to VideoNest.";

  for (const endpoint of endpointCandidates) {
    const formData = new FormData();
    formData.set("file", videoBlob, manifest.fileName);
    formData.set("title", manifest.title || manifest.fileName);
    if (manifest.description) {
      formData.set("description", manifest.description);
    }
    if (manifest.tags.length > 0) {
      formData.set("tags", JSON.stringify(manifest.tags));
    }
    if (channelId) {
      formData.set("channel_id", channelId);
      formData.set("channelId", channelId);
    }
    if (thumbnail) {
      formData.set(
        "thumbnail",
        new Blob([new Uint8Array(thumbnail.buffer)], { type: thumbnail.mimeType }),
        `thumbnail.${extension}`,
      );
    }

    let response: Response;
    try {
      response = await fetchFn(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
      });
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Network error";
      continue;
    }

    const bodyText = await response.text();
    let payload: unknown = null;
    if (bodyText) {
      try {
        payload = JSON.parse(bodyText) as unknown;
      } catch {
        payload = null;
      }
    }

    if (!response.ok) {
      const fallbackMessage = response.statusText || `HTTP ${response.status}`;
      lastError =
        payload &&
        typeof payload === "object" &&
        !Array.isArray(payload) &&
        typeof (payload as Record<string, unknown>).message === "string"
          ? ((payload as Record<string, unknown>).message as string)
          : fallbackMessage;
      continue;
    }

    const videoId = extractVideoId(payload);
    if (!videoId) {
      lastError = "VideoNest response did not include a video id.";
      continue;
    }

    return { ok: true, videoId };
  }

  return { ok: false, error: lastError };
};

const ensureAdmin = async () => {
  await getCourseRequestContext({ requireAdmin: true, requireCustomer: false });
};

const defaultVideoNestUploadDependencies: VideoNestUploadDependencies = {
  ensureAdmin,
  fetch,
  getUploadLimits: resolveUploadLimits,
};

export async function runVideoNestUploadPost(
  request: Request,
  dependencies: VideoNestUploadDependencies = defaultVideoNestUploadDependencies,
) {
  try {
    await dependencies.ensureAdmin();

    const limits = dependencies.getUploadLimits();
    const formData = await request.formData();
    const uploadId = sanitizeUploadId(asString(formData.get("upload_id")));
    if (!uploadId) {
      return NextResponse.json({ ok: false, error: "Invalid upload_id." }, { status: 400 });
    }

    const chunkIndex = parseIntField(formData.get("chunk_index"));
    const chunkTotal = parseIntField(formData.get("chunk_total"));
    if (chunkIndex === null || chunkTotal === null || chunkTotal < 1 || chunkIndex < 0 || chunkIndex >= chunkTotal) {
      return NextResponse.json({ ok: false, error: "Invalid chunk index or total." }, { status: 400 });
    }

    const chunk = formData.get("chunk");
    if (!(chunk instanceof File)) {
      return NextResponse.json({ ok: false, error: "chunk file is required." }, { status: 400 });
    }

    if (chunk.size > limits.maxChunkBytes) {
      return NextResponse.json(
        {
          ok: false,
          error: `Chunk exceeds max size of ${limits.maxChunkBytes} bytes.`,
        },
        { status: 413 },
      );
    }

    const uploadDir = path.join(uploadRootDir, uploadId);
    await fs.mkdir(uploadDir, { recursive: true });

    const manifestPath = path.join(uploadDir, "manifest.json");
    const existingManifest = await readManifest(manifestPath);
    if (existingManifest && existingManifest.totalChunks !== chunkTotal) {
      return NextResponse.json(
        {
          ok: false,
          error: `chunk_total mismatch. Expected ${existingManifest.totalChunks}, received ${chunkTotal}.`,
        },
        { status: 409 },
      );
    }

    const partFiles = await listPartFiles(uploadDir);
    const existingPartSize = partFiles.find((part) => part.index === chunkIndex)?.size ?? 0;
    const projectedTotalBytes = sumPartBytes(partFiles) - existingPartSize + chunk.size;
    if (projectedTotalBytes > limits.maxTotalBytes) {
      return NextResponse.json(
        {
          ok: false,
          error: `Upload exceeds max total size of ${limits.maxTotalBytes} bytes.`,
        },
        { status: 413 },
      );
    }

    const chunkPath = path.join(uploadDir, `${chunkIndex}.part`);
    const chunkBuffer = Buffer.from(await chunk.arrayBuffer());
    await fs.writeFile(chunkPath, chunkBuffer);

    const fileName = asString(formData.get("file_name")) ?? chunk.name ?? "upload.bin";
    const fileType = asString(formData.get("file_type")) ?? chunk.type ?? "application/octet-stream";
    const manifest: UploadManifest = {
      fileName: existingManifest?.fileName ?? fileName,
      fileType: existingManifest?.fileType ?? fileType,
      totalChunks: existingManifest?.totalChunks ?? chunkTotal,
      title: existingManifest?.title ?? asString(formData.get("title")) ?? fileName,
      description: existingManifest?.description ?? asString(formData.get("description")),
      tags: existingManifest?.tags ?? parseTags(asString(formData.get("tags"))),
      channelId:
        existingManifest?.channelId ??
        asString(formData.get("channel_id")) ??
        process.env.VIDEONEST_CHANNEL_ID?.trim() ??
        null,
      thumbnailDataUrl:
        existingManifest?.thumbnailDataUrl ??
        asString(formData.get("thumbnail_data_url")),
    };

    await fs.writeFile(manifestPath, JSON.stringify(manifest), "utf8");

    return NextResponse.json({
      ok: true,
      upload_id: uploadId,
      chunk_index: chunkIndex,
      chunk_total: chunkTotal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected upload error.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function runVideoNestUploadPatch(
  request: Request,
  dependencies: VideoNestUploadDependencies = defaultVideoNestUploadDependencies,
) {
  let uploadDir: string | null = null;
  let shouldCleanupUploadDir = false;

  try {
    await dependencies.ensureAdmin();

    const limits = dependencies.getUploadLimits();
    const payload = (await request.json()) as Record<string, unknown>;
    const uploadId = sanitizeUploadId(
      typeof payload.upload_id === "string" ? payload.upload_id : null,
    );

    if (!uploadId) {
      return NextResponse.json({ ok: false, error: "Invalid upload_id." }, { status: 400 });
    }

    uploadDir = path.join(uploadRootDir, uploadId);
    const manifestPath = path.join(uploadDir, "manifest.json");
    const manifest = await readManifest(manifestPath);
    if (!manifest) {
      return NextResponse.json({ ok: false, error: "Upload manifest not found." }, { status: 404 });
    }

    const partFiles = await listPartFiles(uploadDir);
    if (partFiles.length === 0) {
      return NextResponse.json({ ok: false, error: "No uploaded chunks found." }, { status: 400 });
    }

    const partsByIndex = new Map(partFiles.map((part) => [part.index, part]));
    const orderedPartFiles: PartFileMetadata[] = [];

    for (let index = 0; index < manifest.totalChunks; index += 1) {
      const part = partsByIndex.get(index);
      if (!part) {
        return NextResponse.json(
          {
            ok: false,
            error: `Upload incomplete. Missing chunk ${index + 1} of ${manifest.totalChunks}.`,
          },
          { status: 409 },
        );
      }

      orderedPartFiles.push(part);
    }

    const totalBytes = sumPartBytes(orderedPartFiles);
    if (totalBytes > limits.maxTotalBytes) {
      return NextResponse.json(
        {
          ok: false,
          error: `Upload exceeds max total size of ${limits.maxTotalBytes} bytes.`,
        },
        { status: 413 },
      );
    }

    const partBlobs = await Promise.all(
      orderedPartFiles.map((part) =>
        openAsBlob(part.filePath, {
          type: manifest.fileType || "application/octet-stream",
        }),
      ),
    );
    const videoBlob = new Blob(partBlobs, {
      type: manifest.fileType || "application/octet-stream",
    });

    const uploadResult = await uploadToVideoNest({
      videoBlob,
      manifest,
      fetchFn: dependencies.fetch,
    });

    if (!uploadResult.ok) {
      return NextResponse.json({ ok: false, error: uploadResult.error }, { status: 502 });
    }

    shouldCleanupUploadDir = true;
    return NextResponse.json({
      ok: true,
      video: {
        id: uploadResult.videoId,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected upload finalize error.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  } finally {
    if (shouldCleanupUploadDir && uploadDir) {
      await fs.rm(uploadDir, { recursive: true, force: true });
    }
  }
}
