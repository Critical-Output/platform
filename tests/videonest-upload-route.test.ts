import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import {
  runVideoNestUploadPatch,
  runVideoNestUploadPost,
  type VideoNestUploadDependencies,
} from "../app/api/videonest/upload/upload-route";

const uploadRootDir = path.join(process.cwd(), ".tmp", "videonest-uploads");

const createUploadId = () => `upload_${randomUUID().replace(/-/g, "")}`;

const createDependencies = (options?: {
  fetch?: typeof fetch;
  maxChunkBytes?: number;
  maxTotalBytes?: number;
}): VideoNestUploadDependencies => ({
  ensureAdmin: async () => {},
  fetch:
    options?.fetch ??
    (async () =>
      new Response(JSON.stringify({ id: "video-1" }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      })),
  getUploadLimits: () => ({
    maxChunkBytes: options?.maxChunkBytes ?? 10 * 1024 * 1024,
    maxTotalBytes: options?.maxTotalBytes ?? 100 * 1024 * 1024,
  }),
});

const buildChunkRequest = (params: {
  uploadId: string;
  chunkIndex: number;
  chunkTotal: number;
  chunkSize: number;
}) => {
  const formData = new FormData();
  const bytes = new Uint8Array(params.chunkSize).fill(7);

  formData.set("upload_id", params.uploadId);
  formData.set("chunk_index", String(params.chunkIndex));
  formData.set("chunk_total", String(params.chunkTotal));
  formData.set("chunk", new File([bytes], `chunk-${params.chunkIndex}.mp4`, { type: "video/mp4" }));
  formData.set("file_name", "lesson.mp4");
  formData.set("file_type", "video/mp4");
  formData.set("title", "Lesson Upload");

  return new Request("http://localhost:3000/api/videonest/upload", {
    method: "POST",
    body: formData,
  });
};

const buildFinalizeRequest = (uploadId: string) =>
  new Request("http://localhost:3000/api/videonest/upload", {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ upload_id: uploadId }),
  });

const uploadDirPath = (uploadId: string) => path.join(uploadRootDir, uploadId);

const cleanupUploadDir = async (uploadId: string) => {
  await fs.rm(uploadDirPath(uploadId), { recursive: true, force: true });
};

const uploadDirExists = async (uploadId: string): Promise<boolean> => {
  try {
    await fs.access(uploadDirPath(uploadId));
    return true;
  } catch {
    return false;
  }
};

test("PATCH /api/videonest/upload keeps chunks on upstream failure and allows retry", async () => {
  const uploadId = createUploadId();
  const previousApiKey = process.env.VIDEONEST_API_KEY;
  process.env.VIDEONEST_API_KEY = "test-videonest-key";

  await cleanupUploadDir(uploadId);

  try {
    const postDependencies = createDependencies();
    const postResponse = await runVideoNestUploadPost(
      buildChunkRequest({
        uploadId,
        chunkIndex: 0,
        chunkTotal: 1,
        chunkSize: 4,
      }),
      postDependencies,
    );
    assert.equal(postResponse.status, 200);

    let shouldFailUpload = true;
    const patchDependencies = createDependencies({
      fetch: async () =>
        shouldFailUpload
          ? new Response(JSON.stringify({ message: "temporary outage" }), {
              status: 503,
              headers: {
                "content-type": "application/json",
              },
            })
          : new Response(JSON.stringify({ id: "video-retry-1" }), {
              status: 200,
              headers: {
                "content-type": "application/json",
              },
            }),
    });

    const firstFinalize = await runVideoNestUploadPatch(buildFinalizeRequest(uploadId), patchDependencies);
    assert.equal(firstFinalize.status, 502);
    assert.equal(await uploadDirExists(uploadId), true);

    shouldFailUpload = false;

    const secondFinalize = await runVideoNestUploadPatch(buildFinalizeRequest(uploadId), patchDependencies);
    assert.equal(secondFinalize.status, 200);

    const secondFinalizeJson = (await secondFinalize.json()) as {
      ok: boolean;
      video?: { id: string };
    };

    assert.equal(secondFinalizeJson.ok, true);
    assert.equal(secondFinalizeJson.video?.id, "video-retry-1");
    assert.equal(await uploadDirExists(uploadId), false);
  } finally {
    if (previousApiKey === undefined) {
      delete process.env.VIDEONEST_API_KEY;
    } else {
      process.env.VIDEONEST_API_KEY = previousApiKey;
    }

    await cleanupUploadDir(uploadId);
  }
});

test("POST /api/videonest/upload rejects chunks over configured limit", async () => {
  const uploadId = createUploadId();
  await cleanupUploadDir(uploadId);

  try {
    const dependencies = createDependencies({
      maxChunkBytes: 3,
      maxTotalBytes: 100,
    });

    const response = await runVideoNestUploadPost(
      buildChunkRequest({
        uploadId,
        chunkIndex: 0,
        chunkTotal: 1,
        chunkSize: 4,
      }),
      dependencies,
    );

    assert.equal(response.status, 413);
    const json = (await response.json()) as { ok: boolean; error: string };
    assert.equal(json.ok, false);
    assert.match(json.error, /Chunk exceeds max size/);
  } finally {
    await cleanupUploadDir(uploadId);
  }
});

test("PATCH /api/videonest/upload rejects finalize when total upload exceeds configured limit", async () => {
  const uploadId = createUploadId();
  await cleanupUploadDir(uploadId);

  try {
    const postDependencies = createDependencies({
      maxChunkBytes: 10,
      maxTotalBytes: 10,
    });

    const firstPost = await runVideoNestUploadPost(
      buildChunkRequest({
        uploadId,
        chunkIndex: 0,
        chunkTotal: 2,
        chunkSize: 3,
      }),
      postDependencies,
    );
    assert.equal(firstPost.status, 200);

    const secondPost = await runVideoNestUploadPost(
      buildChunkRequest({
        uploadId,
        chunkIndex: 1,
        chunkTotal: 2,
        chunkSize: 3,
      }),
      postDependencies,
    );
    assert.equal(secondPost.status, 200);

    let fetchCalls = 0;
    const patchDependencies = createDependencies({
      maxChunkBytes: 10,
      maxTotalBytes: 5,
      fetch: async () => {
        fetchCalls += 1;
        return new Response(JSON.stringify({ id: "video-unexpected" }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        });
      },
    });

    const finalizeResponse = await runVideoNestUploadPatch(buildFinalizeRequest(uploadId), patchDependencies);
    assert.equal(finalizeResponse.status, 413);

    const finalizeJson = (await finalizeResponse.json()) as { ok: boolean; error: string };
    assert.equal(finalizeJson.ok, false);
    assert.match(finalizeJson.error, /Upload exceeds max total size/);
    assert.equal(fetchCalls, 0);
    assert.equal(await uploadDirExists(uploadId), true);
  } finally {
    await cleanupUploadDir(uploadId);
  }
});
