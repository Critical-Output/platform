import assert from "node:assert/strict";
import { test } from "node:test";

import {
  issueCertificateForEnrollment,
  loadVisibleCourseById,
  upsertLessonProgress,
} from "../lib/courses/learning";
import type { ProgressRecord } from "../lib/courses/types";

const makeProgress = (overrides: Partial<ProgressRecord> = {}): ProgressRecord => ({
  id: "progress-1",
  brand_id: "brand-1",
  enrollment_id: "enrollment-1",
  lesson_id: "lesson-1",
  percent_complete: 100,
  completed_at: "2026-02-20T10:00:00.000Z",
  metadata: {
    completion_method: "manual",
  },
  created_at: "2026-02-20T10:00:00.000Z",
  updated_at: "2026-02-20T10:00:00.000Z",
  deleted_at: null,
  ...overrides,
});

test("upsertLessonProgress preserves completed lessons when lower progress is submitted", async () => {
  const existing = makeProgress();
  let capturedUpdate: Record<string, unknown> | null = null;

  const query = {
    select: () => query,
    eq: () => query,
    is: () => query,
    maybeSingle: async () => ({ data: existing, error: null }),
    update: (payload: Record<string, unknown>) => {
      capturedUpdate = payload;
      return query;
    },
    single: async () => ({
      data: makeProgress({
        percent_complete: Number(capturedUpdate?.percent_complete ?? existing.percent_complete),
        completed_at: (capturedUpdate?.completed_at as string | null) ?? existing.completed_at,
      }),
      error: null,
    }),
  };

  const supabase = {
    from: () => query,
  } as Parameters<typeof upsertLessonProgress>[0];

  await upsertLessonProgress({
    supabase,
    brandId: "brand-1",
    enrollmentId: existing.enrollment_id,
    lessonId: existing.lesson_id,
    percentComplete: 12,
    lastPositionSeconds: 30,
    watchTimeSeconds: 30,
    completionMethod: "time-based",
    markComplete: false,
  });

  assert.equal(capturedUpdate?.percent_complete, 100);
  assert.equal(capturedUpdate?.completed_at, existing.completed_at);
});

test("upsertLessonProgress keeps percent monotonic before completion", async () => {
  const existing = makeProgress({
    percent_complete: 80,
    completed_at: null,
    metadata: {},
  });
  let capturedUpdate: Record<string, unknown> | null = null;

  const query = {
    select: () => query,
    eq: () => query,
    is: () => query,
    maybeSingle: async () => ({ data: existing, error: null }),
    update: (payload: Record<string, unknown>) => {
      capturedUpdate = payload;
      return query;
    },
    single: async () => ({
      data: makeProgress({
        percent_complete: Number(capturedUpdate?.percent_complete ?? existing.percent_complete),
        completed_at: (capturedUpdate?.completed_at as string | null) ?? existing.completed_at,
      }),
      error: null,
    }),
  };

  const supabase = {
    from: () => query,
  } as Parameters<typeof upsertLessonProgress>[0];

  await upsertLessonProgress({
    supabase,
    brandId: "brand-1",
    enrollmentId: existing.enrollment_id,
    lessonId: existing.lesson_id,
    percentComplete: 40,
    lastPositionSeconds: null,
    watchTimeSeconds: null,
    completionMethod: null,
    markComplete: false,
  });

  assert.equal(capturedUpdate?.percent_complete, 80);
  assert.equal(capturedUpdate?.completed_at, null);
});

test("issueCertificateForEnrollment throws when rpc returns an error", async () => {
  const supabase = {
    rpc: async () => ({
      data: null,
      error: {
        message: "database timeout",
      },
    }),
  } as Parameters<typeof issueCertificateForEnrollment>[0]["supabase"];

  await assert.rejects(
    () =>
      issueCertificateForEnrollment({
        supabase,
        enrollmentId: "enrollment-1",
        certificateNumber: "CERT-2026-ABC123",
      }),
    /Could not issue certificate: database timeout/,
  );
});

test("loadVisibleCourseById returns the matching visible course", async () => {
  const supabase = {
    rpc: async () => ({
      data: [
        {
          id: "course-1",
          brand_id: "owner-brand",
          title: "Visible Course",
          description: null,
          level: null,
          duration_minutes: 10,
          metadata: {},
          created_at: "2026-02-20T10:00:00.000Z",
          updated_at: "2026-02-20T10:00:00.000Z",
          deleted_at: null,
        },
      ],
      error: null,
    }),
  } as Parameters<typeof loadVisibleCourseById>[0];

  const course = await loadVisibleCourseById(supabase, "viewer-brand", "course-1");

  assert.equal(course?.id, "course-1");
});
