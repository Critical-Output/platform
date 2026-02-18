import { cookies, headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { signOutAction } from "@/app/auth/actions";
import AnonymousIdLinker from "@/app/profile/anonymous-id-linker";
import { resolveBrandSlugFromHeaders } from "@/lib/brands/resolve";
import { ANALYTICS_ANON_ID_COOKIE } from "@/lib/rudderstack/constants";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ProfilePageProps = {
  searchParams?: {
    error?: string;
    success?: string;
  };
};

type BrandSummary = {
  slug?: string | null;
  name?: string | null;
};

type CustomerProfileRow = {
  id: string;
  brand_id: string;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  metadata?: unknown;
  brand?: BrandSummary | null;
};

const getAnonymousIds = (metadata: unknown): string[] => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];

  const maybeAnonymousIds = (metadata as { anonymous_ids?: unknown }).anonymous_ids;
  if (!Array.isArray(maybeAnonymousIds)) return [];

  return maybeAnonymousIds
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
};

export default async function ProfilePage({ searchParams }: ProfilePageProps) {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?next=%2Fprofile");
  }

  const brandSlug = resolveBrandSlugFromHeaders(headers());
  let syncErrorMessage: string | null = null;
  if (brandSlug) {
    const { error: syncError } = await supabase.rpc("sync_customer_for_current_brand", {
      p_brand_slug: brandSlug,
      p_anonymous_id: cookies().get(ANALYTICS_ANON_ID_COOKIE)?.value ?? null,
    });

    if (syncError) {
      syncErrorMessage = syncError.message || "Could not sync customer profile for this brand.";
    }
  }

  const { data, error } = await supabase
    .from("customers")
    .select(
      "id,brand_id,email,first_name,last_name,phone,metadata,brand:brands!customers_brand_id_fkey(slug,name)",
    )
    .eq("auth_user_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Unable to load profile: ${error.message}`);
  }

  const customerRows = (data ?? []) as CustomerProfileRow[];

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-6 py-12">
      <AnonymousIdLinker />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Profile</h1>
          <p className="mt-2 text-sm text-gray-600">
            Signed in as <span className="font-medium text-gray-900">{user.email}</span>
          </p>
        </div>

        <form action={signOutAction}>
          <button
            type="submit"
            className="rounded border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Sign out
          </button>
        </form>
      </div>

      {searchParams?.error ? (
        <p className="mt-6 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {searchParams.error}
        </p>
      ) : null}

      {syncErrorMessage ? (
        <p className="mt-6 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {syncErrorMessage}
        </p>
      ) : null}

      {searchParams?.success ? (
        <p className="mt-6 rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700">
          {searchParams.success}
        </p>
      ) : null}

      <section className="mt-8 space-y-4">
        <h2 className="text-lg font-semibold">Customer records</h2>

        {customerRows.length === 0 ? (
          <p className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
            No customer rows were found for this user.
          </p>
        ) : null}

        {customerRows.map((row) => {
          const fullName = [row.first_name, row.last_name].filter(Boolean).join(" ");
          const anonymousIds = getAnonymousIds(row.metadata);

          return (
            <article key={row.id} className="rounded border border-gray-200 p-4">
              <p className="text-sm text-gray-500">
                Brand: <span className="font-medium text-gray-900">{row.brand?.name ?? row.brand?.slug ?? row.brand_id}</span>
              </p>
              <p className="mt-2 text-sm">Name: {fullName || "Not set"}</p>
              <p className="mt-1 text-sm">Email: {row.email ?? "Not set"}</p>
              <p className="mt-1 text-sm">Phone: {row.phone ?? "Not set"}</p>
              <p className="mt-1 text-sm">Anonymous IDs linked: {anonymousIds.length || 0}</p>
            </article>
          );
        })}
      </section>

      <p className="mt-8 text-sm text-gray-600">
        Need to switch brands? Visit that brand domain and sign in again with the same credentials.
      </p>

      <p className="mt-2 text-sm">
        <Link href="/" className="text-blue-700 hover:underline">
          Back to home
        </Link>
      </p>
    </main>
  );
}
