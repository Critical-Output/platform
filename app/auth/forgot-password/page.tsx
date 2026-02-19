import Link from "next/link";

import { requestPasswordResetAction } from "@/app/auth/actions";

type ForgotPasswordPageProps = {
  searchParams?: {
    error?: string;
    success?: string;
  };
};

export default function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-3xl font-semibold">Reset your password</h1>
      <p className="mt-2 text-sm text-gray-600">We will send a password reset link to your email address.</p>

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

      <form action={requestPasswordResetAction} className="mt-6 space-y-3">
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

        <button
          type="submit"
          className="w-full rounded bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Send reset email
        </button>
      </form>

      <p className="mt-6 text-sm">
        <Link href="/auth/login" className="text-blue-700 hover:underline">
          Back to sign in
        </Link>
      </p>
    </main>
  );
}
