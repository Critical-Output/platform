import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { NextResponse, type NextRequest } from "next/server";

import { hasAuthStatusQuery } from "@/lib/auth/paths";
import type { Database } from "@/lib/supabase/types";

const isProtectedPath = (pathname: string): boolean =>
  pathname === "/profile" ||
  pathname.startsWith("/profile/") ||
  pathname === "/courses" ||
  pathname.startsWith("/courses/") ||
  pathname === "/dashboard" ||
  pathname.startsWith("/dashboard/") ||
  pathname === "/admin" ||
  pathname.startsWith("/admin/");

const copySupabaseCookies = (source: NextResponse, target: NextResponse) => {
  for (const cookie of source.cookies.getAll()) {
    target.cookies.set(cookie);
  }
};

export async function middleware(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll().map(({ name, value }) => ({ name, value }));
      },
      setAll(cookiesToSet) {
        for (const cookie of cookiesToSet) {
          request.cookies.set(cookie.name, cookie.value);
        }

        response = NextResponse.next({
          request: {
            headers: request.headers,
          },
        });

        for (const cookie of cookiesToSet) {
          response.cookies.set(cookie.name, cookie.value, cookie.options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && isProtectedPath(request.nextUrl.pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/auth/login";
    redirectUrl.search = "";
    redirectUrl.searchParams.set(
      "next",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );

    const redirectResponse = NextResponse.redirect(redirectUrl);
    copySupabaseCookies(response, redirectResponse);
    return redirectResponse;
  }

  if (
    user &&
    (request.nextUrl.pathname === "/auth/login" ||
      request.nextUrl.pathname === "/auth/signup") &&
    !hasAuthStatusQuery(request.nextUrl.searchParams)
  ) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/profile";
    redirectUrl.search = "";

    const redirectResponse = NextResponse.redirect(redirectUrl);
    copySupabaseCookies(response, redirectResponse);
    return redirectResponse;
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/events).*)"],
};
