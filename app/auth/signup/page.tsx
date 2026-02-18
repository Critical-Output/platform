import Link from "next/link";

import { signInWithGoogleAction, signUpAction } from "@/app/auth/actions";
import { normalizeRedirectPath } from "@/lib/auth/paths";

type SignupPageProps = {
  searchParams?: {
    error?: string;
    success?: string;
    next?: string;
  };
};

export default function SignupPage({ searchParams }: SignupPageProps) {
  const nextPath = normalizeRedirectPath(searchParams?.next, "/profile");

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-3xl font-semibold">Create account</h1>
      <p className="mt-2 text-sm text-gray-600">Your auth identity will be linked to your current brand customer profile.</p>

      {searchParams?.error ? (
        <p className="mt-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {searchParams.error}
        </p>
      ) : null}

      {searchParams?.success ? (
        <p className="mt-4 rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700">
          {searchParams.success}
        </p>
      ) : null}

      <form action={signUpAction} className="mt-6 space-y-3">
        <input type="hidden" name="next" value={nextPath} />

        <label className="block text-sm">
          First name
          <input
            type="text"
            name="first_name"
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
            autoComplete="given-name"
          />
        </label>

        <label className="block text-sm">
          Last name
          <input
            type="text"
            name="last_name"
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
            autoComplete="family-name"
          />
        </label>

        <label className="block text-sm">
          Email
          <input
            required
            type="email"
            name="email"
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
            autoComplete="email"
          />
        </label>

        <label className="block text-sm">
          Password
          <input
            required
            type="password"
            name="password"
            minLength={6}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
            autoComplete="new-password"
          />
        </label>

        <button
          type="submit"
          className="w-full rounded bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Create account
        </button>
      </form>

      <form action={signInWithGoogleAction} className="mt-3">
        <input type="hidden" name="next" value={nextPath} />
        <button
          type="submit"
          className="w-full rounded border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
        >
          Sign up with Google
        </button>
      </form>

      <p className="mt-6 text-sm text-gray-700">
        Already have an account?{" "}
        <Link href={`/auth/login?next=${encodeURIComponent(nextPath)}`} className="text-blue-700 hover:underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
