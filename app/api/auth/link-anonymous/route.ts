import { NextResponse } from "next/server";

import { resolveBrandSlugFromHeaders } from "@/lib/brands/resolve";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const normalizeAnonymousId = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 200) return null;
  return trimmed;
};

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const brandSlug = resolveBrandSlugFromHeaders(request.headers);
  if (!brandSlug) {
    return NextResponse.json(
      { ok: false, error: "Brand configuration is missing" },
      { status: 400 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const anonymousId = normalizeAnonymousId(
    (payload as { anonymousId?: unknown })?.anonymousId,
  );

  if (!anonymousId) {
    return NextResponse.json(
      { ok: false, error: "anonymousId is required" },
      { status: 400 },
    );
  }

  const { error } = await supabase.rpc("sync_customer_for_current_brand", {
    p_brand_slug: brandSlug,
    p_anonymous_id: anonymousId,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
