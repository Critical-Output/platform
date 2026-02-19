"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { normalizeRedirectPath } from "@/lib/auth/paths";
import { ANALYTICS_ANON_ID_COOKIE } from "@/lib/rudderstack/constants";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveBrandSlugFromHeaders } from "@/lib/brands/resolve";

const encode = (value: string): string => encodeURIComponent(value);

const getRequestOrigin = (): string => {
  const headerStore = headers();
  const forwardedHost = headerStore.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = headerStore.get("x-forwarded-proto")?.split(",")[0]?.trim();

  if (forwardedHost) {
    return `${forwardedProto ?? "https"}://${forwardedHost}`;
  }

  const origin = headerStore.get("origin");
  if (origin) return origin;

  const host = headerStore.get("host");
  if (host) {
    const protocol = process.env.NODE_ENV === "development" ? "http" : "https";
    return `${protocol}://${host}`;
  }

  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
};

const buildRedirectWithMessage = (
  path: string,
  type: "error" | "success",
  message: string,
): string => `${path}?${type}=${encode(message)}`;

const getAnonymousIdCookie = (): string | null => {
  const value = cookies().get(ANALYTICS_ANON_ID_COOKIE)?.value?.trim();
  return value || null;
};

const getResolvedBrandSlug = (): string | null => {
  return resolveBrandSlugFromHeaders(headers());
};

const syncCustomerForBrand = async (
  supabase: ReturnType<typeof createSupabaseServerClient>,
  brandSlug: string,
  anonymousId: string | null,
) => {
  const { error } = await supabase.rpc("sync_customer_for_current_brand", {
    p_brand_slug: brandSlug,
    p_anonymous_id: anonymousId,
  });

  if (error) {
    throw new Error(error.message);
  }
};

const normalizeMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Something went wrong. Please try again.";
};

export async function signUpAction(formData: FormData) {
  const supabase = createSupabaseServerClient();
  const nextPath = normalizeRedirectPath(formData.get("next")?.toString(), "/profile");

  const email = formData.get("email")?.toString().trim().toLowerCase();
  const password = formData.get("password")?.toString();
  const firstName = formData.get("first_name")?.toString().trim();
  const lastName = formData.get("last_name")?.toString().trim();

  if (!email || !password) {
    redirect(buildRedirectWithMessage("/auth/signup", "error", "Email and password are required."));
  }

  const brandSlug = getResolvedBrandSlug();
  if (!brandSlug) {
    redirect(
      buildRedirectWithMessage(
        "/auth/signup",
        "error",
        "Brand configuration is missing. Set NEXT_PUBLIC_BRAND_SLUG or BRAND_DOMAIN_MAP.",
      ),
    );
  }

  const anonymousId = getAnonymousIdCookie();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${getRequestOrigin()}/auth/callback?next=${encode(nextPath)}`,
      data: {
        brand_slug: brandSlug,
        anonymous_id: anonymousId ?? undefined,
        first_name: firstName || undefined,
        last_name: lastName || undefined,
      },
    },
  });

  if (error) {
    redirect(buildRedirectWithMessage("/auth/signup", "error", normalizeMessage(error)));
  }

  if (data.session && brandSlug) {
    try {
      await syncCustomerForBrand(supabase, brandSlug, anonymousId);
    } catch (syncError) {
      redirect(buildRedirectWithMessage("/auth/signup", "error", normalizeMessage(syncError)));
    }

    redirect(nextPath);
  }

  redirect(
    buildRedirectWithMessage(
      "/auth/login",
      "success",
      "Check your email to confirm your account, then sign in.",
    ),
  );
}

export async function signInWithPasswordAction(formData: FormData) {
  const supabase = createSupabaseServerClient();
  const nextPath = normalizeRedirectPath(formData.get("next")?.toString(), "/profile");

  const email = formData.get("email")?.toString().trim().toLowerCase();
  const password = formData.get("password")?.toString();

  if (!email || !password) {
    redirect(buildRedirectWithMessage("/auth/login", "error", "Email and password are required."));
  }

  const brandSlug = getResolvedBrandSlug();
  if (!brandSlug) {
    redirect(
      buildRedirectWithMessage(
        "/auth/login",
        "error",
        "Brand configuration is missing. Set NEXT_PUBLIC_BRAND_SLUG or BRAND_DOMAIN_MAP.",
      ),
    );
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect(buildRedirectWithMessage("/auth/login", "error", normalizeMessage(error)));
  }

  try {
    await syncCustomerForBrand(supabase, brandSlug, getAnonymousIdCookie());
  } catch (syncError) {
    redirect(buildRedirectWithMessage("/auth/login", "error", normalizeMessage(syncError)));
  }

  redirect(nextPath);
}

export async function signInWithGoogleAction(formData: FormData) {
  const supabase = createSupabaseServerClient();
  const nextPath = normalizeRedirectPath(formData.get("next")?.toString(), "/profile");

  const brandSlug = getResolvedBrandSlug();
  if (!brandSlug) {
    redirect(
      buildRedirectWithMessage(
        "/auth/login",
        "error",
        "Brand configuration is missing. Set NEXT_PUBLIC_BRAND_SLUG or BRAND_DOMAIN_MAP.",
      ),
    );
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${getRequestOrigin()}/auth/callback?next=${encode(nextPath)}`,
    },
  });

  if (error || !data.url) {
    redirect(buildRedirectWithMessage("/auth/login", "error", normalizeMessage(error)));
  }

  redirect(data.url);
}

export async function requestPasswordResetAction(formData: FormData) {
  const supabase = createSupabaseServerClient();
  const email = formData.get("email")?.toString().trim().toLowerCase();

  if (!email) {
    redirect(
      buildRedirectWithMessage(
        "/auth/forgot-password",
        "error",
        "Enter the email associated with your account.",
      ),
    );
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${getRequestOrigin()}/auth/callback?next=${encode("/auth/reset-password")}`,
  });

  if (error) {
    redirect(buildRedirectWithMessage("/auth/forgot-password", "error", normalizeMessage(error)));
  }

  redirect(
    buildRedirectWithMessage(
      "/auth/forgot-password",
      "success",
      "Password reset email sent. Check your inbox.",
    ),
  );
}

export async function updatePasswordAction(formData: FormData) {
  const supabase = createSupabaseServerClient();

  const password = formData.get("password")?.toString();
  const confirmPassword = formData.get("confirm_password")?.toString();

  if (!password || password.length < 6) {
    redirect(
      buildRedirectWithMessage(
        "/auth/reset-password",
        "error",
        "Password must be at least 6 characters.",
      ),
    );
  }

  if (password !== confirmPassword) {
    redirect(buildRedirectWithMessage("/auth/reset-password", "error", "Passwords do not match."));
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirect(buildRedirectWithMessage("/auth/reset-password", "error", normalizeMessage(error)));
  }

  redirect(buildRedirectWithMessage("/profile", "success", "Password updated."));
}

export async function signOutAction() {
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect(buildRedirectWithMessage("/auth/login", "success", "You have been signed out."));
}
