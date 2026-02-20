import Link from "next/link";
import { redirect } from "next/navigation";

import StudentDashboardClient from "@/app/dashboard/student-dashboard-client";
import { resolveViewerForPage } from "@/lib/courses/auth";
import { loadStudentDashboard } from "@/lib/courses/dashboard";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?next=%2Fdashboard");
  }

  const viewer = await resolveViewerForPage();
  const dashboard = await loadStudentDashboard(viewer);

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Student dashboard</h1>
          <p className="mt-1 text-sm text-gray-600">
            Brand: <span className="font-medium text-gray-900">{viewer.brandName}</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          {viewer.isInstructor ? (
            <Link
              href="/instructor/courses"
              className="rounded border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50"
            >
              Instructor panel
            </Link>
          ) : null}
          <Link
            href="/profile"
            className="rounded border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Profile
          </Link>
        </div>
      </div>

      <div className="mt-8">
        <StudentDashboardClient enrolled={dashboard.enrolled} available={dashboard.available} />
      </div>
    </main>
  );
}
