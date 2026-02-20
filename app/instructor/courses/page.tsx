import Link from "next/link";
import { redirect } from "next/navigation";

import PanelClient from "@/app/instructor/courses/panel-client";
import { resolveViewerForPage } from "@/lib/courses/auth";
import { getVisibleCourseIds, listCoursesByBrand, listLessonsByModule, listModulesByCourse } from "@/lib/courses/data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function InstructorCoursesPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?next=%2Finstructor%2Fcourses");
  }

  const viewer = await resolveViewerForPage();
  if (!viewer.isInstructor) {
    redirect("/dashboard");
  }

  const [courses, visibleSet] = await Promise.all([
    listCoursesByBrand(viewer.brandId, { includeArchived: false }),
    getVisibleCourseIds(viewer.brandId),
  ]);

  const withContent = await Promise.all(
    courses.map(async (course) => {
      const modules = await listModulesByCourse(viewer.brandId, course.id);
      const modulesWithLessons = await Promise.all(
        modules.map(async (module) => {
          const lessons = await listLessonsByModule(viewer.brandId, module.id);
          return {
            id: module.id,
            title: module.title,
            position: module.position,
            lessons: lessons.map((lesson) => ({
              id: lesson.id,
              title: lesson.title,
              position: lesson.position,
              video_url: lesson.video_url,
            })),
          };
        }),
      );

      return {
        id: course.id,
        title: course.title,
        description: course.description,
        level: course.level,
        duration_minutes: course.duration_minutes,
        is_visible: visibleSet.has(course.id),
        modules: modulesWithLessons,
      };
    }),
  );

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Instructor course admin</h1>
          <p className="mt-1 text-sm text-gray-600">
            Manage courses, modules, lessons, drip metadata, and visibility for {viewer.brandName}.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="rounded border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50"
        >
          Back to dashboard
        </Link>
      </div>

      <div className="mt-8">
        <PanelClient courses={withContent} />
      </div>
    </main>
  );
}
