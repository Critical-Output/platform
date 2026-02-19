import { updatePasswordAction } from "@/app/auth/actions";

type ResetPasswordPageProps = {
  searchParams?: {
    error?: string;
    success?: string;
  };
};

export default function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-3xl font-semibold">Set a new password</h1>
      <p className="mt-2 text-sm text-gray-600">Choose a new password for your account.</p>

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

      <form action={updatePasswordAction} className="mt-6 space-y-3">
        <label className="block text-sm">
          New password
          <input
            required
            type="password"
            name="password"
            minLength={6}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
            autoComplete="new-password"
          />
        </label>

        <label className="block text-sm">
          Confirm new password
          <input
            required
            type="password"
            name="confirm_password"
            minLength={6}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
            autoComplete="new-password"
          />
        </label>

        <button
          type="submit"
          className="w-full rounded bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Update password
        </button>
      </form>
    </main>
  );
}
