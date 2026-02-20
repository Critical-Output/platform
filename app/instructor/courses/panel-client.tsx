"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type AdminLesson = {
  id: string;
  title: string;
  position: number;
  video_url: string | null;
};

type AdminModule = {
  id: string;
  title: string;
  position: number;
  lessons: AdminLesson[];
};

type AdminCourse = {
  id: string;
  title: string;
  description: string | null;
  level: string | null;
  duration_minutes: number | null;
  is_visible: boolean;
  modules: AdminModule[];
};

type PanelClientProps = {
  courses: AdminCourse[];
};

type ApiResponse = {
  ok: boolean;
  error?: string;
};

export default function PanelClient({ courses }: PanelClientProps) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const callApi = async (
    key: string,
    path: string,
    method: "POST" | "PATCH" | "DELETE",
    body: Record<string, unknown>,
    successMessage: string,
  ) => {
    setBusyKey(key);
    setStatus(null);
    setError(null);

    try {
      const response = await fetch(path, {
        method,
        headers: {
          "content-type": "application/json",
        },
        body: method === "DELETE" ? undefined : JSON.stringify(body),
      });

      const json = (await response.json()) as ApiResponse;
      if (!response.ok || !json.ok) {
        setError(json.error ?? "Request failed.");
        return;
      }

      setStatus(successMessage);
      router.refresh();
    } catch {
      setError("Request failed.");
    } finally {
      setBusyKey(null);
    }
  };

  const handleCreateCourse = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    const title = form.get("title")?.toString().trim();
    if (!title) {
      setError("Course title is required.");
      return;
    }

    void callApi(
      "create-course",
      "/api/courses",
      "POST",
      {
        title,
        description: form.get("description")?.toString() ?? "",
        level: form.get("level")?.toString() ?? "",
        duration_minutes: Number(form.get("duration_minutes")?.toString() ?? "0"),
        is_visible: form.get("is_visible") === "on",
      },
      "Course created.",
    );
  };

  return (
    <section className="space-y-8">
      {status ? (
        <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700">{status}</p>
      ) : null}
      {error ? (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <section className="rounded border border-gray-200 p-4">
        <h2 className="text-lg font-semibold">Create course</h2>
        <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={handleCreateCourse}>
          <label className="text-sm">
            <span className="block font-medium text-gray-700">Title</span>
            <input name="title" className="mt-1 w-full rounded border border-gray-300 px-3 py-2" required />
          </label>
          <label className="text-sm">
            <span className="block font-medium text-gray-700">Level</span>
            <input name="level" className="mt-1 w-full rounded border border-gray-300 px-3 py-2" />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="block font-medium text-gray-700">Description</span>
            <textarea name="description" className="mt-1 w-full rounded border border-gray-300 px-3 py-2" rows={3} />
          </label>
          <label className="text-sm">
            <span className="block font-medium text-gray-700">Duration (min)</span>
            <input
              name="duration_minutes"
              type="number"
              min={0}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input name="is_visible" type="checkbox" defaultChecked />
            Visible to students
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={busyKey === "create-course"}
              className="rounded border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busyKey === "create-course" ? "Saving..." : "Create course"}
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Manage courses</h2>
        {courses.length === 0 ? (
          <p className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
            No courses found for this brand.
          </p>
        ) : null}

        {courses.map((course) => (
          <article key={course.id} className="space-y-4 rounded border border-gray-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">{course.title}</h3>
                <p className="text-sm text-gray-600">{course.description ?? "No description set."}</p>
                <p className="mt-1 text-xs text-gray-500">
                  Level: {course.level ?? "N/A"} | Duration: {course.duration_minutes ?? "N/A"} min | Visibility:{" "}
                  {course.is_visible ? "Visible" : "Hidden"}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busyKey === `visibility-${course.id}`}
                  onClick={() => {
                    void callApi(
                      `visibility-${course.id}`,
                      `/api/courses/${course.id}`,
                      "PATCH",
                      { is_visible: !course.is_visible },
                      "Course visibility updated.",
                    );
                  }}
                  className="rounded border border-gray-300 px-3 py-2 text-xs font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {course.is_visible ? "Hide" : "Show"}
                </button>
                <button
                  type="button"
                  disabled={busyKey === `archive-course-${course.id}`}
                  onClick={() => {
                    void callApi(
                      `archive-course-${course.id}`,
                      `/api/courses/${course.id}`,
                      "DELETE",
                      {},
                      "Course archived.",
                    );
                  }}
                  className="rounded border border-red-300 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Archive
                </button>
              </div>
            </div>

            <form
              className="grid gap-2 rounded border border-gray-100 p-3 sm:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void callApi(
                  `update-course-${course.id}`,
                  `/api/courses/${course.id}`,
                  "PATCH",
                  {
                    title: form.get("title")?.toString() ?? "",
                    description: form.get("description")?.toString() ?? "",
                    level: form.get("level")?.toString() ?? "",
                    duration_minutes: Number(form.get("duration_minutes")?.toString() ?? "0"),
                  },
                  "Course updated.",
                );
              }}
            >
              <label className="text-sm">
                <span className="block font-medium text-gray-700">Title</span>
                <input
                  name="title"
                  defaultValue={course.title}
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                />
              </label>
              <label className="text-sm">
                <span className="block font-medium text-gray-700">Level</span>
                <input
                  name="level"
                  defaultValue={course.level ?? ""}
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                />
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="block font-medium text-gray-700">Description</span>
                <textarea
                  name="description"
                  defaultValue={course.description ?? ""}
                  rows={2}
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                />
              </label>
              <label className="text-sm">
                <span className="block font-medium text-gray-700">Duration (min)</span>
                <input
                  name="duration_minutes"
                  type="number"
                  min={0}
                  defaultValue={course.duration_minutes ?? 0}
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                />
              </label>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={busyKey === `update-course-${course.id}`}
                  className="rounded border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Update course
                </button>
              </div>
            </form>

            <section className="space-y-3">
              <h4 className="text-sm font-semibold text-gray-800">Modules</h4>
              <form
                className="grid gap-2 rounded border border-gray-100 p-3 sm:grid-cols-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  const title = form.get("title")?.toString().trim();
                  if (!title) {
                    setError("Module title is required.");
                    return;
                  }
                  void callApi(
                    `create-module-${course.id}`,
                    `/api/courses/${course.id}/modules`,
                    "POST",
                    {
                      title,
                      position: Number(form.get("position")?.toString() ?? "0"),
                    },
                    "Module created.",
                  );
                }}
              >
                <label className="text-sm sm:col-span-2">
                  <span className="block font-medium text-gray-700">New module title</span>
                  <input name="title" className="mt-1 w-full rounded border border-gray-300 px-3 py-2" />
                </label>
                <label className="text-sm">
                  <span className="block font-medium text-gray-700">Position</span>
                  <input
                    name="position"
                    type="number"
                    min={0}
                    defaultValue={0}
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                  />
                </label>
                <div className="sm:col-span-3">
                  <button
                    type="submit"
                    disabled={busyKey === `create-module-${course.id}`}
                    className="rounded border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Add module
                  </button>
                </div>
              </form>

              {course.modules.map((module) => (
                <div key={module.id} className="space-y-3 rounded border border-gray-100 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">
                      {module.title} (position {module.position})
                    </p>
                    <button
                      type="button"
                      disabled={busyKey === `archive-module-${module.id}`}
                      onClick={() => {
                        void callApi(
                          `archive-module-${module.id}`,
                          `/api/courses/${course.id}/modules/${module.id}`,
                          "DELETE",
                          {},
                          "Module archived.",
                        );
                      }}
                      className="rounded border border-red-300 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Archive module
                    </button>
                  </div>

                  <form
                    className="grid gap-2 sm:grid-cols-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      void callApi(
                        `update-module-${module.id}`,
                        `/api/courses/${course.id}/modules/${module.id}`,
                        "PATCH",
                        {
                          title: form.get("title")?.toString() ?? "",
                          position: Number(form.get("position")?.toString() ?? "0"),
                        },
                        "Module updated.",
                      );
                    }}
                  >
                    <label className="text-sm sm:col-span-2">
                      <span className="block font-medium text-gray-700">Module title</span>
                      <input
                        name="title"
                        defaultValue={module.title}
                        className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                      />
                    </label>
                    <label className="text-sm">
                      <span className="block font-medium text-gray-700">Position</span>
                      <input
                        name="position"
                        type="number"
                        min={0}
                        defaultValue={module.position}
                        className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                      />
                    </label>
                    <div className="sm:col-span-3">
                      <button
                        type="submit"
                        disabled={busyKey === `update-module-${module.id}`}
                        className="rounded border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Update module
                      </button>
                    </div>
                  </form>

                  <form
                    className="grid gap-2 rounded border border-gray-100 p-3 sm:grid-cols-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      const title = form.get("title")?.toString().trim();
                      if (!title) {
                        setError("Lesson title is required.");
                        return;
                      }
                      void callApi(
                        `create-lesson-${module.id}`,
                        `/api/courses/${course.id}/modules/${module.id}/lessons`,
                        "POST",
                        {
                          title,
                          position: Number(form.get("position")?.toString() ?? "0"),
                          video_url: form.get("video_url")?.toString() ?? "",
                        },
                        "Lesson created.",
                      );
                    }}
                  >
                    <label className="text-sm sm:col-span-2">
                      <span className="block font-medium text-gray-700">New lesson title</span>
                      <input name="title" className="mt-1 w-full rounded border border-gray-300 px-3 py-2" />
                    </label>
                    <label className="text-sm">
                      <span className="block font-medium text-gray-700">Position</span>
                      <input
                        name="position"
                        type="number"
                        min={0}
                        defaultValue={0}
                        className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                      />
                    </label>
                    <label className="text-sm">
                      <span className="block font-medium text-gray-700">Video URL</span>
                      <input name="video_url" className="mt-1 w-full rounded border border-gray-300 px-3 py-2" />
                    </label>
                    <div className="sm:col-span-4">
                      <button
                        type="submit"
                        disabled={busyKey === `create-lesson-${module.id}`}
                        className="rounded border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Add lesson
                      </button>
                    </div>
                  </form>

                  {module.lessons.map((lesson) => (
                    <form
                      key={lesson.id}
                      className="grid gap-2 rounded border border-gray-100 p-3 sm:grid-cols-4"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const form = new FormData(event.currentTarget);
                        void callApi(
                          `update-lesson-${lesson.id}`,
                          `/api/courses/${course.id}/modules/${module.id}/lessons/${lesson.id}`,
                          "PATCH",
                          {
                            title: form.get("title")?.toString() ?? "",
                            position: Number(form.get("position")?.toString() ?? "0"),
                            video_url: form.get("video_url")?.toString() ?? "",
                          },
                          "Lesson updated.",
                        );
                      }}
                    >
                      <label className="text-sm sm:col-span-2">
                        <span className="block font-medium text-gray-700">Lesson title</span>
                        <input
                          name="title"
                          defaultValue={lesson.title}
                          className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                        />
                      </label>
                      <label className="text-sm">
                        <span className="block font-medium text-gray-700">Position</span>
                        <input
                          name="position"
                          type="number"
                          min={0}
                          defaultValue={lesson.position}
                          className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                        />
                      </label>
                      <label className="text-sm">
                        <span className="block font-medium text-gray-700">Video URL</span>
                        <input
                          name="video_url"
                          defaultValue={lesson.video_url ?? ""}
                          className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                        />
                      </label>
                      <div className="sm:col-span-4 flex gap-2">
                        <button
                          type="submit"
                          disabled={busyKey === `update-lesson-${lesson.id}`}
                          className="rounded border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Update lesson
                        </button>
                        <button
                          type="button"
                          disabled={busyKey === `archive-lesson-${lesson.id}`}
                          onClick={() => {
                            void callApi(
                              `archive-lesson-${lesson.id}`,
                              `/api/courses/${course.id}/modules/${module.id}/lessons/${lesson.id}`,
                              "DELETE",
                              {},
                              "Lesson archived.",
                            );
                          }}
                          className="rounded border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Archive lesson
                        </button>
                      </div>
                    </form>
                  ))}
                </div>
              ))}
            </section>
          </article>
        ))}
      </section>
    </section>
  );
}
