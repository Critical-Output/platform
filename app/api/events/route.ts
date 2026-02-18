import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    // TODO: validate payload + forward to analytics (RudderStack) and/or storage (ClickHouse).
    await request.json();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
}

