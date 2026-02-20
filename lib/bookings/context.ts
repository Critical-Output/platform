import type { User } from "@supabase/supabase-js";

import { resolveBrandSlugFromHeaders } from "@/lib/brands/resolve";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Brand = {
  id: string;
  slug: string;
  name: string;
};

type Customer = {
  id: string;
  email: string | null;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
};

type BookingActor = {
  user: User;
  customer: Customer | null;
  isBrandAdmin: boolean;
  instructorIds: string[];
};

export type BookingApiContext = {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  userClient: ReturnType<typeof createSupabaseServerClient>;
  brand: Brand;
  actor: BookingActor;
};

export type BookingApiContextError = {
  status: number;
  message: string;
};

const loadInstructorIdsForActor = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  brandId: string,
  email: string | null,
): Promise<string[]> => {
  if (!email) return [];

  const { data: linkedRows, error: linkedError } = await admin
    .from("instructors_brands")
    .select("instructor_id")
    .eq("brand_id", brandId)
    .is("deleted_at", null);

  if (linkedError) return [];

  const linkedIds = new Set(
    (linkedRows ?? [])
      .map((row) => {
        const value = (row as { instructor_id?: unknown }).instructor_id;
        return typeof value === "string" ? value : null;
      })
      .filter((value): value is string => Boolean(value)),
  );

  const { data: instructors, error: instructorsError } = await admin
    .from("instructors")
    .select("id, brand_id")
    .ilike("email", email)
    .is("deleted_at", null);

  if (instructorsError) return [];

  const ids: string[] = [];
  for (const row of instructors ?? []) {
    const id = (row as { id?: unknown }).id;
    const homeBrandId = (row as { brand_id?: unknown }).brand_id;
    if (typeof id !== "string") continue;

    if (homeBrandId === brandId || linkedIds.has(id)) {
      ids.push(id);
    }
  }

  return ids;
};

export const resolveBookingApiContext = async (
  request: Request,
): Promise<{ context: BookingApiContext } | { error: BookingApiContextError }> => {
  const serverSupabase = createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await serverSupabase.auth.getUser();

  if (userError || !user) {
    return { error: { status: 401, message: "Unauthorized" } };
  }

  const brandSlug = resolveBrandSlugFromHeaders(request.headers);
  if (!brandSlug) {
    return { error: { status: 400, message: "Brand configuration is missing" } };
  }

  const admin = createSupabaseAdminClient();

  const { data: brand, error: brandError } = await admin
    .from("brands")
    .select("id, slug, name")
    .eq("slug", brandSlug)
    .is("deleted_at", null)
    .maybeSingle();

  if (brandError || !brand) {
    return { error: { status: 404, message: "Brand not found" } };
  }

  const typedBrand = brand as Brand;

  const { data: customer } = await admin
    .from("customers")
    .select("id, email, phone, first_name, last_name")
    .eq("brand_id", typedBrand.id)
    .eq("auth_user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  const { data: adminMembership } = await admin
    .from("brand_members")
    .select("id")
    .eq("brand_id", typedBrand.id)
    .eq("user_id", user.id)
    .in("role", ["owner", "admin"])
    .is("deleted_at", null)
    .maybeSingle();

  const instructorIds = await loadInstructorIdsForActor(admin, typedBrand.id, user.email ?? null);
  const isBrandAdmin = Boolean(adminMembership?.id);

  if (!isBrandAdmin && !customer && instructorIds.length === 0) {
    return { error: { status: 403, message: "No access to this brand" } };
  }

  return {
    context: {
      admin,
      userClient: serverSupabase,
      brand: {
        id: typedBrand.id,
        slug: typedBrand.slug,
        name: typedBrand.name,
      },
      actor: {
        user,
        customer: (customer as Customer | null) ?? null,
        isBrandAdmin,
        instructorIds,
      },
    },
  };
};

export const canManageInstructor = (
  context: BookingApiContext,
  instructorId: string,
): boolean => context.actor.isBrandAdmin || context.actor.instructorIds.includes(instructorId);
