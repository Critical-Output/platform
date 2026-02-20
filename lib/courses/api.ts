import { NextResponse } from "next/server";

import { CourseApiError } from "./context";

export const jsonError = (status: number, error: string) => {
  return NextResponse.json({ ok: false, error }, { status });
};

export const handleCourseApiError = (error: unknown) => {
  if (error instanceof CourseApiError) {
    return jsonError(error.status, error.message);
  }

  if (error instanceof Error) {
    return jsonError(500, error.message);
  }

  return jsonError(500, "Unexpected error");
};

export const readJsonBody = async (request: Request): Promise<Record<string, unknown>> => {
  let body: unknown;
  try {
    body = (await request.json()) as unknown;
  } catch {
    throw new CourseApiError(400, "Invalid JSON payload.");
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new CourseApiError(400, "Payload must be a JSON object.");
  }

  return body as Record<string, unknown>;
};

export const asString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

export const asNullableString = (value: unknown): string | null => {
  if (value === null) return null;
  return asString(value);
};

export const asIntOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.trunc(num);
};

export const asJsonObject = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

export const asBoolean = (value: unknown): boolean | null => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return null;
};
