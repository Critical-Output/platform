import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { normalizeRedirectPath } from "@/lib/auth/paths";
import { resolveBrandSlugFromHeaders } from "@/lib/brands/resolve";
import { ANALYTICS_ANON_ID_COOKIE } from "@/lib/rudderstack/constants";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const redirectToLoginWithError = (requestUrl: URL, message: string) => {
  const url = new URL("/auth/login", requestUrl.origin);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url);
};

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type") as EmailOtpType | null;
  const nextPath = normalizeRedirectPath(requestUrl.searchParams.get("next"), "/profile");

  const supabase = createSupabaseServerClient();

  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      return redirectToLoginWithError(requestUrl, exchangeError.message || "Could not complete auth.");
    }
  } else if (tokenHash && type) {
    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });

    if (verifyError) {
      return redirectToLoginWithError(requestUrl, verifyError.message || "Could not verify recovery link.");
    }
  } else {
    return redirectToLoginWithError(requestUrl, "Missing auth code.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const brandSlug = resolveBrandSlugFromHeaders(request.headers);
    if (brandSlug) {
      const anonymousId = cookies().get(ANALYTICS_ANON_ID_COOKIE)?.value ?? null;
      const { error: syncError } = await supabase.rpc("sync_customer_for_current_brand", {
        p_brand_slug: brandSlug,
        p_anonymous_id: anonymousId,
      });

      if (syncError) {
        return redirectToLoginWithError(requestUrl, syncError.message || "Could not sync customer profile.");
      }
    }
  }

  const redirectUrl = new URL(nextPath, requestUrl.origin);
  return NextResponse.redirect(redirectUrl);
}
