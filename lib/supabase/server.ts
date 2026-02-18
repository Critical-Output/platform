import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

import type { Database } from "./types";

export const createSupabaseServerClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  const cookieStore = cookies();
  const mutableCookieStore = cookieStore as unknown as {
    set?: (name: string, value: string, options?: Record<string, unknown>) => void;
  };

  return createServerClient<Database>(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore
          .getAll()
          .map(({ name, value }) => ({ name, value }));
      },
      setAll(cookiesToSet) {
        if (typeof mutableCookieStore.set !== "function") return;

        for (const cookie of cookiesToSet) {
          mutableCookieStore.set(cookie.name, cookie.value, cookie.options);
        }
      },
    },
  });
};
