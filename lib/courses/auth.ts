import { headers } from "next/headers";

import { resolveBrandSlugFromHeaders } from "@/lib/brands/resolve";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { toResponseError } from "@/lib/courses/utils";

type BrandRow = {
  id: string;
  slug: string;
  name: string;
};

type CustomerRow = {
  id: string;
};

type BrandMemberRow = {
  id: string;
};

type InstructorRow = {
  id: string;
};

export type ViewerContext = {
  userId: string;
  userEmail: string | null;
  brandId: string;
  brandSlug: string;
  brandName: string;
  customerId: string | null;
  isInstructor: boolean;
  isBrandAdmin: boolean;
};

export class ViewerAuthError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const getBrandFromSlug = async (brandSlug: string): Promise<BrandRow> => {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("brands")
    .select("id,slug,name")
    .eq("slug", brandSlug)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new ViewerAuthError(`Unable to resolve brand: ${error.message}`, 500);
  }

  const row = data as BrandRow | null;
  if (!row) {
    throw new ViewerAuthError("Brand not found for current request host.", 404);
  }

  return row;
};

const getCustomerForViewer = async (brandId: string, userId: string): Promise<CustomerRow | null> => {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("customers")
    .select("id")
    .eq("brand_id", brandId)
    .eq("auth_user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new ViewerAuthError(`Unable to resolve customer profile: ${error.message}`, 500);
  }

  return (data as CustomerRow | null) ?? null;
};

const getInstructorFlags = async (brandId: string, userId: string, userEmail: string | null) => {
  const admin = createSupabaseAdminClient();

  const { data: brandMemberData, error: brandMemberError } = await admin
    .from("brand_members")
    .select("id")
    .eq("brand_id", brandId)
    .eq("user_id", userId)
    .in("role", ["owner", "admin"])
    .is("deleted_at", null)
    .limit(1);

  if (brandMemberError) {
    throw new ViewerAuthError(`Unable to validate instructor access: ${brandMemberError.message}`, 500);
  }

  const isBrandAdmin = ((brandMemberData ?? []) as BrandMemberRow[]).length > 0;
  if (isBrandAdmin) {
    return { isBrandAdmin: true, isInstructor: true };
  }

  if (!userEmail) {
    return { isBrandAdmin: false, isInstructor: false };
  }

  const { data: instructorData, error: instructorError } = await admin
    .from("instructors")
    .select("id")
    .eq("brand_id", brandId)
    .ilike("email", userEmail)
    .is("deleted_at", null)
    .limit(1);

  if (instructorError) {
    throw new ViewerAuthError(`Unable to validate instructor profile: ${instructorError.message}`, 500);
  }

  return {
    isBrandAdmin: false,
    isInstructor: ((instructorData ?? []) as InstructorRow[]).length > 0,
  };
};

export const resolveViewerFromHeaders = async (requestHeaders: Headers): Promise<ViewerContext> => {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    throw new ViewerAuthError(`Authentication failed: ${authError.message}`, 401);
  }

  if (!user) {
    throw new ViewerAuthError("Authentication required.", 401);
  }

  const brandSlug = resolveBrandSlugFromHeaders(requestHeaders);
  if (!brandSlug) {
    throw new ViewerAuthError(
      "Brand configuration is missing. Set NEXT_PUBLIC_BRAND_SLUG or BRAND_DOMAIN_MAP.",
      500,
    );
  }

  const brand = await getBrandFromSlug(brandSlug);
  const customer = await getCustomerForViewer(brand.id, user.id);
  const flags = await getInstructorFlags(brand.id, user.id, user.email ?? null);

  return {
    userId: user.id,
    userEmail: user.email ?? null,
    brandId: brand.id,
    brandSlug: brand.slug,
    brandName: brand.name,
    customerId: customer?.id ?? null,
    isInstructor: flags.isInstructor,
    isBrandAdmin: flags.isBrandAdmin,
  };
};

export const resolveViewerForPage = async (): Promise<ViewerContext> => resolveViewerFromHeaders(headers());

export const requireInstructor = (viewer: ViewerContext) => {
  if (!viewer.isInstructor) {
    throw new ViewerAuthError("Instructor access is required.", 403);
  }
};

export const ensureCustomerForViewer = async (viewer: ViewerContext): Promise<string> => {
  if (viewer.customerId) return viewer.customerId;

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc("sync_customer_for_current_brand", {
    p_brand_slug: viewer.brandSlug,
    p_anonymous_id: null,
  });

  if (error) {
    throw new ViewerAuthError(`Unable to create customer profile: ${error.message}`, 500);
  }

  const customerId = typeof data === "string" ? data : null;
  if (!customerId) {
    throw new ViewerAuthError("Unable to create customer profile for current user.", 500);
  }

  return customerId;
};

export const asViewerAuthError = (error: unknown): ViewerAuthError =>
  error instanceof ViewerAuthError
    ? error
    : new ViewerAuthError(toResponseError(error, "Unexpected course authorization failure."), 500);
