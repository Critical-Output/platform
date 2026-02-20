"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type CourseSummary = {
  id: string;
  title: string;
  description: string | null;
  level: string | null;
  duration_minutes: number | null;
};

type ModuleWithLessons = {
  id: string;
  title: string;
  lessons: Array<{
    id: string;
    title: string;
    video_url: string | null;
  }>;
};

type CourseDetail = {
  course: CourseSummary;
  modules: ModuleWithLessons[];
};

export default function CourseAdminPage() {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CourseDetail | null>(null);

  const [creatingCourse, setCreatingCourse] = useState<boolean>(false);
  const [courseTitle, setCourseTitle] = useState<string>("");
  const [courseDescription, setCourseDescription] = useState<string>("");
  const [courseLevel, setCourseLevel] = useState<string>("");

  const [newModuleTitle, setNewModuleTitle] = useState<string>("");
  const [newLessonTitle, setNewLessonTitle] = useState<string>("");
  const [newLessonVideoUrl, setNewLessonVideoUrl] = useState<string>("");
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);

  const loadCourses = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/courses?scope=admin", { cache: "no-store" });
      const data = (await response.json()) as {
        ok: boolean;
        error?: string;
        courses?: CourseSummary[];
      };

      if (!response.ok || !data.ok) {
        setError(data.error ?? "Could not load admin courses. Ensure you are a brand admin.");
        setCourses([]);
        return;
      }

      setCourses(data.courses ?? []);
      if (!selectedCourseId && data.courses && data.courses.length > 0) {
        setSelectedCourseId(data.courses[0].id);
      }
    } catch {
      setError("Could not load admin courses.");
      setCourses([]);
    } finally {
      setLoading(false);
    }
  }, [selectedCourseId]);

  const loadCourseDetail = useCallback(async (courseId: string) => {
    setError(null);

    try {
      const response = await fetch(`/api/courses/${courseId}`, { cache: "no-store" });
      const data = (await response.json()) as {
        ok: boolean;
        error?: string;
        course?: CourseSummary;
        modules?: ModuleWithLessons[];
      };

      if (!response.ok || !data.ok || !data.course) {
        setError(data.error ?? "Could not load course detail.");
        setDetail(null);
        return;
      }

      const modules = data.modules ?? [];
      setDetail({ course: data.course, modules });
      if (!selectedModuleId && modules.length > 0) {
        setSelectedModuleId(modules[0].id);
      }
    } catch {
      setError("Could not load course detail.");
      setDetail(null);
    }
  }, [selectedModuleId]);

  useEffect(() => {
    void loadCourses();
  }, [loadCourses]);

  useEffect(() => {
    if (!selectedCourseId) {
      setDetail(null);
      return;
    }

    void loadCourseDetail(selectedCourseId);
  }, [loadCourseDetail, selectedCourseId]);

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId) ?? null,
    [courses, selectedCourseId],
  );

  const createCourse = useCallback(async () => {
    if (!courseTitle.trim()) {
      setError("Course title is required.");
      return;
    }

    setCreatingCourse(true);
    setError(null);

    try {
      const response = await fetch("/api/courses", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title: courseTitle.trim(),
          description: courseDescription.trim() || null,
          level: courseLevel.trim() || null,
          visible_on_brand: true,
        }),
      });

      const data = (await response.json()) as { ok: boolean; error?: string; course?: CourseSummary };
      if (!response.ok || !data.ok || !data.course) {
        setError(data.error ?? "Could not create course.");
        return;
      }

      setCourseTitle("");
      setCourseDescription("");
      setCourseLevel("");
      await loadCourses();
      setSelectedCourseId(data.course.id);
      await loadCourseDetail(data.course.id);
    } catch {
      setError("Could not create course.");
    } finally {
      setCreatingCourse(false);
    }
  }, [courseDescription, courseLevel, courseTitle, loadCourseDetail, loadCourses]);

  const createModule = useCallback(async () => {
    if (!selectedCourseId) {
      setError("Select a course first.");
      return;
    }

    if (!newModuleTitle.trim()) {
      setError("Module title is required.");
      return;
    }

    setError(null);

    try {
      const response = await fetch(`/api/courses/${selectedCourseId}/modules`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: newModuleTitle.trim() }),
      });

      const data = (await response.json()) as { ok: boolean; error?: string; module?: { id: string } };
      if (!response.ok || !data.ok) {
        setError(data.error ?? "Could not create module.");
        return;
      }

      setNewModuleTitle("");
      await loadCourseDetail(selectedCourseId);
      if (data.module?.id) {
        setSelectedModuleId(data.module.id);
      }
    } catch {
      setError("Could not create module.");
    }
  }, [loadCourseDetail, newModuleTitle, selectedCourseId]);

  const createLesson = useCallback(async () => {
    if (!selectedCourseId || !selectedModuleId) {
      setError("Select a module first.");
      return;
    }

    if (!newLessonTitle.trim()) {
      setError("Lesson title is required.");
      return;
    }

    setError(null);

    try {
      const response = await fetch(
        `/api/courses/${selectedCourseId}/modules/${selectedModuleId}/lessons`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: newLessonTitle.trim(),
            video_url: newLessonVideoUrl.trim() || null,
          }),
        },
      );

      const data = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !data.ok) {
        setError(data.error ?? "Could not create lesson.");
        return;
      }

      setNewLessonTitle("");
      setNewLessonVideoUrl("");
      await loadCourseDetail(selectedCourseId);
    } catch {
      setError("Could not create lesson.");
    }
  }, [loadCourseDetail, newLessonTitle, newLessonVideoUrl, selectedCourseId, selectedModuleId]);

  const archiveCourse = useCallback(async (courseId: string) => {
    setError(null);

    try {
      const response = await fetch(`/api/courses/${courseId}`, { method: "DELETE" });
      const data = (await response.json()) as { ok: boolean; error?: string };

      if (!response.ok || !data.ok) {
        setError(data.error ?? "Could not archive course.");
        return;
      }

      await loadCourses();
      setSelectedCourseId(null);
      setDetail(null);
    } catch {
      setError("Could not archive course.");
    }
  }, [loadCourses]);

  const archiveModule = useCallback(async (moduleId: string) => {
    if (!selectedCourseId) return;

    setError(null);

    try {
      const response = await fetch(`/api/courses/${selectedCourseId}/modules/${moduleId}`, {
        method: "DELETE",
      });

      const data = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !data.ok) {
        setError(data.error ?? "Could not archive module.");
        return;
      }

      await loadCourseDetail(selectedCourseId);
    } catch {
      setError("Could not archive module.");
    }
  }, [loadCourseDetail, selectedCourseId]);

  const archiveLesson = useCallback(async (moduleId: string, lessonId: string) => {
    if (!selectedCourseId) return;

    setError(null);

    try {
      const response = await fetch(
        `/api/courses/${selectedCourseId}/modules/${moduleId}/lessons/${lessonId}`,
        {
          method: "DELETE",
        },
      );

      const data = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !data.ok) {
        setError(data.error ?? "Could not archive lesson.");
        return;
      }

      await loadCourseDetail(selectedCourseId);
    } catch {
      setError("Could not archive lesson.");
    }
  }, [loadCourseDetail, selectedCourseId]);

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Course Admin Panel</h1>
          <p className="mt-2 text-sm text-gray-600">
            Manage courses, modules, and lessons for your brand.
          </p>
        </div>

        <div className="flex gap-2">
          <Link href="/courses" className="rounded border border-gray-300 px-3 py-2 text-sm">
            Student View
          </Link>
          <Link href="/dashboard/courses" className="rounded border border-gray-300 px-3 py-2 text-sm">
            Dashboard
          </Link>
        </div>
      </header>

      {loading ? <p className="text-sm text-gray-600">Loading admin data...</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <section className="rounded border border-gray-200 bg-white p-4">
        <h2 className="text-lg font-semibold">Create Course</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <input
            className="rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="Course title"
            value={courseTitle}
            onChange={(event) => setCourseTitle(event.target.value)}
          />
          <input
            className="rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="Description"
            value={courseDescription}
            onChange={(event) => setCourseDescription(event.target.value)}
          />
          <input
            className="rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="Level (beginner/intermediate/etc)"
            value={courseLevel}
            onChange={(event) => setCourseLevel(event.target.value)}
          />
        </div>

        <button
          type="button"
          className="mt-3 rounded bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          onClick={() => {
            void createCourse();
          }}
          disabled={creatingCourse}
        >
          {creatingCourse ? "Creating..." : "Create Course"}
        </button>
      </section>

      <section className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="rounded border border-gray-200 bg-white p-4">
          <h2 className="text-lg font-semibold">Courses</h2>

          <ul className="mt-3 space-y-2">
            {courses.map((course) => (
              <li key={course.id}>
                <button
                  type="button"
                  className={`w-full rounded border px-3 py-2 text-left text-sm ${
                    selectedCourseId === course.id
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 bg-white"
                  }`}
                  onClick={() => setSelectedCourseId(course.id)}
                >
                  {course.title}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="space-y-4">
          {!selectedCourse || !detail ? (
            <p className="rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
              Select a course to manage modules and lessons.
            </p>
          ) : (
            <>
              <section className="rounded border border-gray-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold">{selectedCourse.title}</h2>
                    <p className="mt-1 text-sm text-gray-600">
                      {selectedCourse.description ?? "No description"}
                    </p>
                  </div>

                  <button
                    type="button"
                    className="rounded border border-red-300 px-3 py-2 text-sm text-red-700"
                    onClick={() => {
                      void archiveCourse(selectedCourse.id);
                    }}
                  >
                    Archive Course
                  </button>
                </div>
              </section>

              <section className="rounded border border-gray-200 bg-white p-4">
                <h3 className="text-lg font-semibold">Add Module</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  <input
                    className="min-w-[260px] flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Module title"
                    value={newModuleTitle}
                    onChange={(event) => setNewModuleTitle(event.target.value)}
                  />
                  <button
                    type="button"
                    className="rounded bg-gray-900 px-3 py-2 text-sm font-medium text-white"
                    onClick={() => {
                      void createModule();
                    }}
                  >
                    Add Module
                  </button>
                </div>
              </section>

              <section className="rounded border border-gray-200 bg-white p-4">
                <h3 className="text-lg font-semibold">Add Lesson</h3>

                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  <select
                    className="rounded border border-gray-300 px-3 py-2 text-sm"
                    value={selectedModuleId ?? ""}
                    onChange={(event) => setSelectedModuleId(event.target.value || null)}
                  >
                    <option value="">Select module</option>
                    {detail.modules.map((module) => (
                      <option key={module.id} value={module.id}>
                        {module.title}
                      </option>
                    ))}
                  </select>

                  <input
                    className="rounded border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Lesson title"
                    value={newLessonTitle}
                    onChange={(event) => setNewLessonTitle(event.target.value)}
                  />

                  <input
                    className="rounded border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Video URL or VideoNest embed"
                    value={newLessonVideoUrl}
                    onChange={(event) => setNewLessonVideoUrl(event.target.value)}
                  />
                </div>

                <button
                  type="button"
                  className="mt-3 rounded bg-gray-900 px-3 py-2 text-sm font-medium text-white"
                  onClick={() => {
                    void createLesson();
                  }}
                >
                  Add Lesson
                </button>
              </section>

              <section className="rounded border border-gray-200 bg-white p-4">
                <h3 className="text-lg font-semibold">Current Structure</h3>
                <div className="mt-3 space-y-4">
                  {detail.modules.map((module) => (
                    <article key={module.id} className="rounded border border-gray-200 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="font-semibold">{module.title}</h4>
                        <button
                          type="button"
                          className="rounded border border-red-300 px-2 py-1 text-xs text-red-700"
                          onClick={() => {
                            void archiveModule(module.id);
                          }}
                        >
                          Archive Module
                        </button>
                      </div>

                      <ul className="mt-2 space-y-1">
                        {module.lessons.map((lesson) => (
                          <li key={lesson.id} className="flex items-center justify-between gap-2 rounded bg-gray-50 px-2 py-2 text-sm">
                            <span>{lesson.title}</span>
                            <button
                              type="button"
                              className="rounded border border-red-300 px-2 py-1 text-xs text-red-700"
                              onClick={() => {
                                void archiveLesson(module.id, lesson.id);
                              }}
                            >
                              Archive Lesson
                            </button>
                          </li>
                        ))}

                        {module.lessons.length === 0 ? (
                          <li className="rounded bg-gray-50 px-2 py-2 text-sm text-gray-500">
                            No lessons yet.
                          </li>
                        ) : null}
                      </ul>
                    </article>
                  ))}

                  {detail.modules.length === 0 ? (
                    <p className="rounded bg-gray-50 px-3 py-2 text-sm text-gray-500">
                      No modules yet.
                    </p>
                  ) : null}
                </div>
              </section>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
