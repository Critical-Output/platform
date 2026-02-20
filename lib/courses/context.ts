import { headers } from "next/headers";

import { resolveBrandSlugFromHeaders } from "@/lib/brands/resolve";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { BrandRecord } from "./types";

export class CourseApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type CourseRequestContext = {
  supabase: ReturnType<typeof createSupabaseServerClient>;
  userId: string;
  brand: BrandRecord;
  isBrandAdmin: boolean;
  customerId: string | null;
};

type BrandMembershipRow = {
  role: string | null;
};

type CustomerRow = {
  id: string;
};

const resolveBrand = async (
  supabase: ReturnType<typeof createSupabaseServerClient>,
): Promise<BrandRecord> => {
  const brandSlug = resolveBrandSlugFromHeaders(headers());

  if (!brandSlug) {
    throw new CourseApiError(
      500,
      "Brand resolution failed. Set NEXT_PUBLIC_BRAND_SLUG or BRAND_DOMAIN_MAP.",
    );
  }

  const { data, error } = await supabase
    .from("brands")
    .select("id,slug,name")
    .eq("slug", brandSlug)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new CourseApiError(500, `Unable to resolve brand: ${error.message}`);
  }

  if (!data) {
    throw new CourseApiError(404, `Brand not found for slug: ${brandSlug}`);
  }

  return data as BrandRecord;
};

const resolveCustomerId = async (
  supabase: ReturnType<typeof createSupabaseServerClient>,
  brandSlug: string,
  brandId: string,
  userId: string,
): Promise<string | null> => {
  const { error: syncError } = await supabase.rpc("sync_customer_for_current_brand", {
    p_brand_slug: brandSlug,
    p_anonymous_id: null,
  });

  if (syncError) {
    throw new CourseApiError(500, `Could not sync customer profile: ${syncError.message}`);
  }

  const { data, error } = await supabase
    .from("customers")
    .select("id")
    .eq("brand_id", brandId)
    .eq("auth_user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new CourseApiError(500, `Could not load customer profile: ${error.message}`);
  }

  return (data as CustomerRow | null)?.id ?? null;
};

const resolveAdminStatus = async (
  supabase: ReturnType<typeof createSupabaseServerClient>,
  brandId: string,
  userId: string,
): Promise<boolean> => {
  const { data, error } = await supabase
    .from("brand_members")
    .select("role")
    .eq("brand_id", brandId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new CourseApiError(500, `Could not resolve brand membership: ${error.message}`);
  }

  const role = (data as BrandMembershipRow | null)?.role;
  return role === "owner" || role === "admin";
};

export const getCourseRequestContext = async (options?: {
  requireAdmin?: boolean;
  requireCustomer?: boolean;
}): Promise<CourseRequestContext> => {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new CourseApiError(401, "Authentication required.");
  }

  const brand = await resolveBrand(supabase);
  const isBrandAdmin = await resolveAdminStatus(supabase, brand.id, user.id);

  if (options?.requireAdmin && !isBrandAdmin) {
    throw new CourseApiError(403, "Only brand admins can perform this action.");
  }

  let customerId: string | null = null;
  if (options?.requireCustomer !== false) {
    customerId = await resolveCustomerId(supabase, brand.slug, brand.id, user.id);

    if (!customerId && options?.requireCustomer) {
      throw new CourseApiError(403, "Customer profile required for this action.");
    }
  }

  return {
    supabase,
    userId: user.id,
    brand,
    isBrandAdmin,
    customerId,
  };
};
