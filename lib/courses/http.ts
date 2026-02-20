import { NextResponse } from "next/server";

import { isRecord } from "@/lib/courses/utils";

export const jsonError = (message: string, status = 400) =>
  NextResponse.json({ ok: false, error: message }, { status });

export const jsonOk = (data: Record<string, unknown>, status = 200) =>
  NextResponse.json({ ok: true, ...data }, { status });

export const parseRequestBody = async (request: Request): Promise<Record<string, unknown>> => {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const parsed = (await request.json()) as unknown;
    if (!isRecord(parsed)) {
      throw new Error("Request body must be a JSON object.");
    }
    return parsed;
  }

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const formData = await request.formData();
    return Object.fromEntries(formData.entries());
  }

  if (!contentType) return {};
  throw new Error("Unsupported content-type. Use application/json.");
};
