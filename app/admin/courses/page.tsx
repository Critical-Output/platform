"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { VideonestPreview, uploadVideo } from "videonest-sdk";

type JsonObject = Record<string, unknown>;

type CourseSummary = {
  id: string;
  title: string;
  description: string | null;
  level: string | null;
  duration_minutes: number | null;
  metadata: JsonObject | null;
  visible_on_brand?: boolean;
  enrollment_count?: number;
  completion_count?: number;
  completion_rate_percent?: number;
  category?: string | null;
  thumbnail_url?: string | null;
  published_at?: string | null;
};

type LessonRecord = {
  id: string;
  title: string;
  content: string | null;
  video_url: string | null;
  position: number;
  metadata: JsonObject | null;
};

type ModuleWithLessons = {
  id: string;
  title: string;
  position: number;
  metadata: JsonObject | null;
  lessons: LessonRecord[];
};

type CourseDetail = {
  course: CourseSummary;
  modules: ModuleWithLessons[];
};

type LessonVisibility = "free_preview" | "members_only" | "specific_tier";

type LessonDraft = {
  title: string;
  content: string;
  videoUrl: string;
  videonestVideoId: string;
  visibility: LessonVisibility;
  requiredTier: string;
};

type UploadStatusLabel = "idle" | "uploading" | "finalizing" | "failed" | "completed";

const asMetadataObject = (value: unknown): JsonObject => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as JsonObject;
};

const readMetadataString = (metadata: JsonObject | null, key: string): string => {
  const raw = asMetadataObject(metadata)[key];
  return typeof raw === "string" ? raw : "";
};

const toLessonVisibility = (metadata: JsonObject | null): LessonVisibility => {
  const raw = readMetadataString(metadata, "visibility");
  if (raw === "free_preview" || raw === "specific_tier") {
    return raw;
  }

  return "members_only";
};

const toLessonDraft = (lesson: LessonRecord): LessonDraft => {
  return {
    title: lesson.title,
    content: lesson.content ?? "",
    videoUrl: lesson.video_url ?? "",
    videonestVideoId: readMetadataString(lesson.metadata, "videonest_video_id"),
    visibility: toLessonVisibility(lesson.metadata),
    requiredTier: readMetadataString(lesson.metadata, "required_tier"),
  };
};

const fileToDataUrl = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Could not read image."));
      }
    };
    reader.onerror = () => reject(new Error("Could not read image."));
    reader.readAsDataURL(file);
  });
};

export default function CourseAdminPage() {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CourseDetail | null>(null);

  const [creatingCourse, setCreatingCourse] = useState<boolean>(false);
  const [savingCourse, setSavingCourse] = useState<boolean>(false);
  const [publishingCourse, setPublishingCourse] = useState<boolean>(false);

  const [courseTitle, setCourseTitle] = useState<string>("");
  const [courseDescription, setCourseDescription] = useState<string>("");
  const [courseCategory, setCourseCategory] = useState<string>("");
  const [courseThumbnailDataUrl, setCourseThumbnailDataUrl] = useState<string>("");
  const [createAsPublished, setCreateAsPublished] = useState<boolean>(false);

  const [editCourseTitle, setEditCourseTitle] = useState<string>("");
  const [editCourseDescription, setEditCourseDescription] = useState<string>("");
  const [editCourseCategory, setEditCourseCategory] = useState<string>("");
  const [editCourseThumbnailDataUrl, setEditCourseThumbnailDataUrl] = useState<string>("");
  const [editCoursePublished, setEditCoursePublished] = useState<boolean>(false);

  const [newModuleTitle, setNewModuleTitle] = useState<string>("");
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);

  const [newLessonTitle, setNewLessonTitle] = useState<string>("");
  const [newLessonContent, setNewLessonContent] = useState<string>("");
  const [newLessonVideoUrl, setNewLessonVideoUrl] = useState<string>("");
  const [newLessonVideonestId, setNewLessonVideonestId] = useState<string>("");
  const [newLessonVisibility, setNewLessonVisibility] = useState<LessonVisibility>("members_only");
  const [newLessonRequiredTier, setNewLessonRequiredTier] = useState<string>("");

  const [uploadingVideo, setUploadingVideo] = useState<boolean>(false);
  const [uploadVideoFile, setUploadVideoFile] = useState<File | null>(null);
  const [uploadThumbnailFile, setUploadThumbnailFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadStatus, setUploadStatus] = useState<UploadStatusLabel>("idle");
  const [uploadMessage, setUploadMessage] = useState<string>("");

  const [moduleDrafts, setModuleDrafts] = useState<Record<string, string>>({});
  const [lessonDrafts, setLessonDrafts] = useState<Record<string, LessonDraft>>({});

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

      const loadedCourses = data.courses ?? [];
      setCourses(loadedCourses);

      setSelectedCourseId((currentId) => {
        if (!loadedCourses.length) return null;
        if (currentId && loadedCourses.some((course) => course.id === currentId)) return currentId;
        return loadedCourses[0]?.id ?? null;
      });
    } catch {
      setError("Could not load admin courses.");
      setCourses([]);
    } finally {
      setLoading(false);
    }
  }, []);

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

      setSelectedModuleId((currentModuleId) => {
        if (!modules.length) return null;
        if (currentModuleId && modules.some((moduleRow) => moduleRow.id === currentModuleId)) {
          return currentModuleId;
        }
        return modules[0]?.id ?? null;
      });

      const nextModuleDrafts: Record<string, string> = {};
      const nextLessonDrafts: Record<string, LessonDraft> = {};

      for (const moduleRow of modules) {
        nextModuleDrafts[moduleRow.id] = moduleRow.title;
        for (const lesson of moduleRow.lessons) {
          nextLessonDrafts[lesson.id] = toLessonDraft(lesson);
        }
      }

      setModuleDrafts(nextModuleDrafts);
      setLessonDrafts(nextLessonDrafts);
    } catch {
      setError("Could not load course detail.");
      setDetail(null);
    }
  }, []);

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

  useEffect(() => {
    if (!selectedCourse) {
      setEditCourseTitle("");
      setEditCourseDescription("");
      setEditCourseCategory("");
      setEditCourseThumbnailDataUrl("");
      setEditCoursePublished(false);
      return;
    }

    setEditCourseTitle(selectedCourse.title ?? "");
    setEditCourseDescription(selectedCourse.description ?? "");
    setEditCourseCategory(
      selectedCourse.category ?? readMetadataString(selectedCourse.metadata, "category"),
    );
    setEditCourseThumbnailDataUrl(
      selectedCourse.thumbnail_url ?? readMetadataString(selectedCourse.metadata, "thumbnail_url"),
    );
    setEditCoursePublished(Boolean(selectedCourse.visible_on_brand));
  }, [selectedCourse]);

  const createCourse = useCallback(async () => {
    if (!courseTitle.trim()) {
      setError("Course title is required.");
      return;
    }

    if (!courseCategory.trim()) {
      setError("Course category is required.");
      return;
    }

    if (!courseThumbnailDataUrl.trim()) {
      setError("Course thumbnail image is required.");
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
          category: courseCategory.trim(),
          thumbnail_url: courseThumbnailDataUrl,
          publish: createAsPublished,
          visible_on_brand: createAsPublished,
          metadata: {
            category: courseCategory.trim(),
            thumbnail_url: courseThumbnailDataUrl,
          },
        }),
      });

      const data = (await response.json()) as { ok: boolean; error?: string; course?: CourseSummary };
      if (!response.ok || !data.ok || !data.course) {
        setError(data.error ?? "Could not create course.");
        return;
      }

      setCourseTitle("");
      setCourseDescription("");
      setCourseCategory("");
      setCourseThumbnailDataUrl("");
      setCreateAsPublished(false);
      await loadCourses();
      setSelectedCourseId(data.course.id);
      await loadCourseDetail(data.course.id);
    } catch {
      setError("Could not create course.");
    } finally {
      setCreatingCourse(false);
    }
  }, [
    courseCategory,
    courseDescription,
    courseThumbnailDataUrl,
    courseTitle,
    createAsPublished,
    loadCourseDetail,
    loadCourses,
  ]);

  const saveCourse = useCallback(async () => {
    if (!selectedCourseId) {
      setError("Select a course first.");
      return;
    }

    if (!editCourseTitle.trim()) {
      setError("Course title is required.");
      return;
    }

    setSavingCourse(true);
    setError(null);

    try {
      const response = await fetch(`/api/courses/${selectedCourseId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title: editCourseTitle.trim(),
          description: editCourseDescription.trim() || null,
          category: editCourseCategory.trim() || null,
          thumbnail_url: editCourseThumbnailDataUrl.trim() || null,
          publish: editCoursePublished,
          visible_on_brand: editCoursePublished,
        }),
      });

      const data = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !data.ok) {
        setError(data.error ?? "Could not save course.");
        return;
      }

      await loadCourses();
      await loadCourseDetail(selectedCourseId);
    } catch {
      setError("Could not save course.");
    } finally {
      setSavingCourse(false);
    }
  }, [
    editCourseCategory,
    editCourseDescription,
    editCoursePublished,
    editCourseThumbnailDataUrl,
    editCourseTitle,
    loadCourseDetail,
    loadCourses,
    selectedCourseId,
  ]);

  const togglePublishCourse = useCallback(async () => {
    if (!selectedCourseId || !selectedCourse) {
      setError("Select a course first.");
      return;
    }

    const nextPublished = !Boolean(selectedCourse.visible_on_brand);
    setPublishingCourse(true);
    setError(null);

    try {
      const response = await fetch(`/api/courses/${selectedCourseId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          publish: nextPublished,
          visible_on_brand: nextPublished,
        }),
      });

      const data = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !data.ok) {
        setError(data.error ?? "Could not update publish state.");
        return;
      }

      setEditCoursePublished(nextPublished);
      await loadCourses();
      await loadCourseDetail(selectedCourseId);
    } catch {
      setError("Could not update publish state.");
    } finally {
      setPublishingCourse(false);
    }
  }, [loadCourseDetail, loadCourses, selectedCourse, selectedCourseId]);

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

  const saveModule = useCallback(async (moduleId: string) => {
    if (!selectedCourseId) return;

    const title = moduleDrafts[moduleId]?.trim() ?? "";
    if (!title) {
      setError("Module title is required.");
      return;
    }

    setError(null);

    try {
      const response = await fetch(`/api/courses/${selectedCourseId}/modules/${moduleId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title }),
      });

      const data = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !data.ok) {
        setError(data.error ?? "Could not save module.");
        return;
      }

      await loadCourseDetail(selectedCourseId);
    } catch {
      setError("Could not save module.");
    }
  }, [loadCourseDetail, moduleDrafts, selectedCourseId]);

  const reorderModule = useCallback(async (moduleId: string, direction: -1 | 1) => {
    if (!selectedCourseId || !detail) return;

    const modules = detail.modules;
    const index = modules.findIndex((moduleRow) => moduleRow.id === moduleId);
    const swapIndex = index + direction;
    if (index < 0 || swapIndex < 0 || swapIndex >= modules.length) {
      return;
    }

    const current = modules[index];
    const target = modules[swapIndex];

    setError(null);

    try {
      const responses = await Promise.all([
        fetch(`/api/courses/${selectedCourseId}/modules/${current.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ position: target.position }),
        }),
        fetch(`/api/courses/${selectedCourseId}/modules/${target.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ position: current.position }),
        }),
      ]);

      for (const response of responses) {
        const payload = (await response.json()) as { ok: boolean; error?: string };
        if (!response.ok || !payload.ok) {
          setError(payload.error ?? "Could not reorder modules.");
          return;
        }
      }

      await loadCourseDetail(selectedCourseId);
    } catch {
      setError("Could not reorder modules.");
    }
  }, [detail, loadCourseDetail, selectedCourseId]);

  const createLesson = useCallback(async () => {
    if (!selectedCourseId || !selectedModuleId) {
      setError("Select a module first.");
      return;
    }

    if (!newLessonTitle.trim()) {
      setError("Lesson title is required.");
      return;
    }

    if (newLessonVisibility === "specific_tier" && !newLessonRequiredTier.trim()) {
      setError("Specific tier lessons require a tier name.");
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
            content: newLessonContent.trim() || null,
            video_url: newLessonVideoUrl.trim() || null,
            metadata: {
              visibility: newLessonVisibility,
              required_tier:
                newLessonVisibility === "specific_tier" ? newLessonRequiredTier.trim() : null,
              videonest_video_id: newLessonVideonestId.trim() || null,
            },
          }),
        },
      );

      const data = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !data.ok) {
        setError(data.error ?? "Could not create lesson.");
        return;
      }

      setNewLessonTitle("");
      setNewLessonContent("");
      setNewLessonVideoUrl("");
      setNewLessonVideonestId("");
      setNewLessonVisibility("members_only");
      setNewLessonRequiredTier("");
      setUploadVideoFile(null);
      setUploadThumbnailFile(null);
      setUploadProgress(0);
      setUploadStatus("idle");
      setUploadMessage("");
      await loadCourseDetail(selectedCourseId);
    } catch {
      setError("Could not create lesson.");
    }
  }, [
    loadCourseDetail,
    newLessonContent,
    newLessonRequiredTier,
    newLessonTitle,
    newLessonVideoUrl,
    newLessonVideonestId,
    newLessonVisibility,
    selectedCourseId,
    selectedModuleId,
  ]);

  const uploadLessonVideo = useCallback(async () => {
    if (!uploadVideoFile) {
      setError("Select a video file before uploading.");
      return;
    }

    setUploadingVideo(true);
    setUploadProgress(0);
    setUploadStatus("uploading");
    setUploadMessage("");
    setError(null);

    try {
      const result = await uploadVideo(uploadVideoFile, {
        metadata: {
          title: newLessonTitle.trim() || uploadVideoFile.name,
          description: newLessonContent.trim() || undefined,
          tags:
            newLessonVisibility === "specific_tier" && newLessonRequiredTier.trim()
              ? [newLessonRequiredTier.trim()]
              : [],
        },
        thumbnail: uploadThumbnailFile,
        onProgress: (progress, status) => {
          setUploadProgress(progress);
          if (status === "uploading") {
            setUploadStatus("uploading");
          } else if (status === "finalizing") {
            setUploadStatus("finalizing");
          } else if (status === "failed" || status === "stalled") {
            setUploadStatus("failed");
          }
        },
      });

      if (!result.success || !result.video?.id) {
        setUploadStatus("failed");
        setUploadMessage(result.message ?? "Video upload failed.");
        return;
      }

      setNewLessonVideonestId(result.video.id);
      setNewLessonVideoUrl("");
      setUploadStatus("completed");
      setUploadProgress(100);
      setUploadMessage(`Uploaded video ${result.video.id}`);
    } catch {
      setUploadStatus("failed");
      setUploadMessage("Video upload failed.");
    } finally {
      setUploadingVideo(false);
    }
  }, [
    newLessonContent,
    newLessonRequiredTier,
    newLessonTitle,
    newLessonVisibility,
    uploadThumbnailFile,
    uploadVideoFile,
  ]);

  const updateLessonDraft = useCallback((lessonId: string, patch: Partial<LessonDraft>) => {
    setLessonDrafts((current) => ({
      ...current,
      [lessonId]: {
        ...(current[lessonId] ?? {
          title: "",
          content: "",
          videoUrl: "",
          videonestVideoId: "",
          visibility: "members_only" as LessonVisibility,
          requiredTier: "",
        }),
        ...patch,
      },
    }));
  }, []);

  const saveLesson = useCallback(async (moduleId: string, lesson: LessonRecord) => {
    if (!selectedCourseId) return;

    const draft = lessonDrafts[lesson.id] ?? toLessonDraft(lesson);
    if (!draft.title.trim()) {
      setError("Lesson title is required.");
      return;
    }

    if (draft.visibility === "specific_tier" && !draft.requiredTier.trim()) {
      setError("Specific tier lessons require a tier name.");
      return;
    }

    const metadata = {
      ...asMetadataObject(lesson.metadata),
      visibility: draft.visibility,
      required_tier: draft.visibility === "specific_tier" ? draft.requiredTier.trim() : null,
      videonest_video_id: draft.videonestVideoId.trim() || null,
    };

    setError(null);

    try {
      const response = await fetch(
        `/api/courses/${selectedCourseId}/modules/${moduleId}/lessons/${lesson.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: draft.title.trim(),
            content: draft.content.trim() || null,
            video_url: draft.videoUrl.trim() || null,
            metadata,
          }),
        },
      );

      const data = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !data.ok) {
        setError(data.error ?? "Could not save lesson.");
        return;
      }

      await loadCourseDetail(selectedCourseId);
    } catch {
      setError("Could not save lesson.");
    }
  }, [lessonDrafts, loadCourseDetail, selectedCourseId]);

  const reorderLesson = useCallback(async (moduleId: string, lessonId: string, direction: -1 | 1) => {
    if (!selectedCourseId || !detail) return;

    const moduleRow = detail.modules.find((row) => row.id === moduleId);
    if (!moduleRow) return;

    const lessons = moduleRow.lessons;
    const index = lessons.findIndex((lesson) => lesson.id === lessonId);
    const swapIndex = index + direction;
    if (index < 0 || swapIndex < 0 || swapIndex >= lessons.length) {
      return;
    }

    const current = lessons[index];
    const target = lessons[swapIndex];

    setError(null);

    try {
      const responses = await Promise.all([
        fetch(`/api/courses/${selectedCourseId}/modules/${moduleId}/lessons/${current.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ position: target.position }),
        }),
        fetch(`/api/courses/${selectedCourseId}/modules/${moduleId}/lessons/${target.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ position: current.position }),
        }),
      ]);

      for (const response of responses) {
        const payload = (await response.json()) as { ok: boolean; error?: string };
        if (!response.ok || !payload.ok) {
          setError(payload.error ?? "Could not reorder lessons.");
          return;
        }
      }

      await loadCourseDetail(selectedCourseId);
    } catch {
      setError("Could not reorder lessons.");
    }
  }, [detail, loadCourseDetail, selectedCourseId]);

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
    <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Instructor Course Admin</h1>
          <p className="mt-2 text-sm text-gray-600">
            Create courses, upload VideoNest lessons, control access tiers, and manage publishing.
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
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <input
            className="rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="Course title"
            value={courseTitle}
            onChange={(event) => setCourseTitle(event.target.value)}
          />
          <input
            className="rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="Category"
            value={courseCategory}
            onChange={(event) => setCourseCategory(event.target.value)}
          />
          <textarea
            className="rounded border border-gray-300 px-3 py-2 text-sm md:col-span-2"
            rows={3}
            placeholder="Description"
            value={courseDescription}
            onChange={(event) => setCourseDescription(event.target.value)}
          />
          <label className="rounded border border-gray-300 px-3 py-2 text-sm">
            Thumbnail Image
            <input
              className="mt-2 block w-full text-xs"
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                if (!file) {
                  setCourseThumbnailDataUrl("");
                  return;
                }

                void fileToDataUrl(file)
                  .then((dataUrl) => {
                    setCourseThumbnailDataUrl(dataUrl);
                  })
                  .catch(() => {
                    setError("Could not read thumbnail image.");
                  });
              }}
            />
          </label>
          <label className="flex items-center gap-2 rounded border border-gray-300 px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={createAsPublished}
              onChange={(event) => setCreateAsPublished(event.target.checked)}
            />
            Publish immediately
          </label>
        </div>

        {courseThumbnailDataUrl ? (
          <img
            src={courseThumbnailDataUrl}
            alt="Course thumbnail preview"
            className="mt-3 h-36 w-64 rounded border border-gray-200 object-cover"
          />
        ) : null}

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

      <section className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <aside className="rounded border border-gray-200 bg-white p-4">
          <h2 className="text-lg font-semibold">Courses</h2>

          <ul className="mt-3 space-y-2">
            {courses.map((course) => {
              const published = Boolean(course.visible_on_brand);
              const thumbnail = course.thumbnail_url ?? readMetadataString(course.metadata, "thumbnail_url");

              return (
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
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{course.title}</span>
                      <span className={`rounded px-2 py-0.5 text-xs ${published ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>
                        {published ? "Published" : "Draft"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-600">
                      Enrollments: {course.enrollment_count ?? 0} • Completions: {course.completion_count ?? 0}
                    </p>
                    <p className="text-xs text-gray-500">
                      Completion rate: {(course.completion_rate_percent ?? 0).toFixed(2)}%
                    </p>
                    {thumbnail ? (
                      <img
                        src={thumbnail}
                        alt={`${course.title} thumbnail`}
                        className="mt-2 h-20 w-full rounded border border-gray-200 object-cover"
                      />
                    ) : null}
                  </button>
                </li>
              );
            })}
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
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <h2 className="text-xl font-semibold">Edit Course</h2>
                    <div className="grid gap-2 md:grid-cols-2">
                      <input
                        className="rounded border border-gray-300 px-3 py-2 text-sm"
                        value={editCourseTitle}
                        onChange={(event) => setEditCourseTitle(event.target.value)}
                        placeholder="Course title"
                      />
                      <input
                        className="rounded border border-gray-300 px-3 py-2 text-sm"
                        value={editCourseCategory}
                        onChange={(event) => setEditCourseCategory(event.target.value)}
                        placeholder="Category"
                      />
                      <textarea
                        className="rounded border border-gray-300 px-3 py-2 text-sm md:col-span-2"
                        rows={3}
                        value={editCourseDescription}
                        onChange={(event) => setEditCourseDescription(event.target.value)}
                        placeholder="Description"
                      />
                    </div>
                    <label className="rounded border border-gray-300 px-3 py-2 text-sm">
                      Update Thumbnail
                      <input
                        className="mt-2 block w-full text-xs"
                        type="file"
                        accept="image/*"
                        onChange={(event) => {
                          const file = event.target.files?.[0] ?? null;
                          if (!file) return;

                          void fileToDataUrl(file)
                            .then((dataUrl) => {
                              setEditCourseThumbnailDataUrl(dataUrl);
                            })
                            .catch(() => {
                              setError("Could not read thumbnail image.");
                            });
                        }}
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={editCoursePublished}
                        onChange={(event) => setEditCoursePublished(event.target.checked)}
                      />
                      Published
                    </label>
                  </div>

                  <div className="w-full max-w-xs space-y-2">
                    {editCourseThumbnailDataUrl ? (
                      <img
                        src={editCourseThumbnailDataUrl}
                        alt="Current thumbnail"
                        className="h-36 w-full rounded border border-gray-200 object-cover"
                      />
                    ) : null}
                    <div className="rounded border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
                      <p>Enrollment count: {selectedCourse.enrollment_count ?? 0}</p>
                      <p>Completions: {selectedCourse.completion_count ?? 0}</p>
                      <p>Completion rate: {(selectedCourse.completion_rate_percent ?? 0).toFixed(2)}%</p>
                    </div>
                    <button
                      type="button"
                      className="w-full rounded bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                      onClick={() => {
                        void saveCourse();
                      }}
                      disabled={savingCourse}
                    >
                      {savingCourse ? "Saving..." : "Save Course"}
                    </button>
                    <button
                      type="button"
                      className="w-full rounded border border-blue-300 px-3 py-2 text-sm text-blue-700 disabled:opacity-50"
                      onClick={() => {
                        void togglePublishCourse();
                      }}
                      disabled={publishingCourse}
                    >
                      {publishingCourse
                        ? "Updating..."
                        : selectedCourse.visible_on_brand
                          ? "Unpublish Course"
                          : "Publish Course"}
                    </button>
                    <button
                      type="button"
                      className="w-full rounded border border-red-300 px-3 py-2 text-sm text-red-700"
                      onClick={() => {
                        void archiveCourse(selectedCourse.id);
                      }}
                    >
                      Archive Course
                    </button>
                  </div>
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

                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  <select
                    className="rounded border border-gray-300 px-3 py-2 text-sm"
                    value={selectedModuleId ?? ""}
                    onChange={(event) => setSelectedModuleId(event.target.value || null)}
                  >
                    <option value="">Select module</option>
                    {detail.modules.map((moduleRow) => (
                      <option key={moduleRow.id} value={moduleRow.id}>
                        {moduleRow.title}
                      </option>
                    ))}
                  </select>

                  <input
                    className="rounded border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Lesson title"
                    value={newLessonTitle}
                    onChange={(event) => setNewLessonTitle(event.target.value)}
                  />

                  <textarea
                    className="rounded border border-gray-300 px-3 py-2 text-sm md:col-span-2"
                    rows={3}
                    placeholder="Lesson content"
                    value={newLessonContent}
                    onChange={(event) => setNewLessonContent(event.target.value)}
                  />

                  <input
                    className="rounded border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Video URL (optional)"
                    value={newLessonVideoUrl}
                    onChange={(event) => setNewLessonVideoUrl(event.target.value)}
                  />

                  <input
                    className="rounded border border-gray-300 px-3 py-2 text-sm"
                    placeholder="VideoNest video ID (auto-filled after upload)"
                    value={newLessonVideonestId}
                    onChange={(event) => setNewLessonVideonestId(event.target.value)}
                  />

                  <select
                    className="rounded border border-gray-300 px-3 py-2 text-sm"
                    value={newLessonVisibility}
                    onChange={(event) => setNewLessonVisibility(event.target.value as LessonVisibility)}
                  >
                    <option value="free_preview">Free Preview</option>
                    <option value="members_only">Members Only</option>
                    <option value="specific_tier">Specific Tier</option>
                  </select>

                  <input
                    className="rounded border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Required tier (for specific tier visibility)"
                    value={newLessonRequiredTier}
                    onChange={(event) => setNewLessonRequiredTier(event.target.value)}
                    disabled={newLessonVisibility !== "specific_tier"}
                  />
                </div>

                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  <label className="rounded border border-gray-300 px-3 py-2 text-sm">
                    Video File (VideoNest upload)
                    <input
                      className="mt-2 block w-full text-xs"
                      type="file"
                      accept="video/*"
                      onChange={(event) => {
                        setUploadVideoFile(event.target.files?.[0] ?? null);
                      }}
                    />
                  </label>

                  <label className="rounded border border-gray-300 px-3 py-2 text-sm">
                    Video Thumbnail (optional)
                    <input
                      className="mt-2 block w-full text-xs"
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        setUploadThumbnailFile(event.target.files?.[0] ?? null);
                      }}
                    />
                  </label>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded border border-gray-300 px-3 py-2 text-sm font-medium"
                    disabled={uploadingVideo}
                    onClick={() => {
                      void uploadLessonVideo();
                    }}
                  >
                    {uploadingVideo ? "Uploading..." : "Upload via VideoNest"}
                  </button>

                  <button
                    type="button"
                    className="rounded bg-gray-900 px-3 py-2 text-sm font-medium text-white"
                    onClick={() => {
                      void createLesson();
                    }}
                  >
                    Add Lesson
                  </button>
                </div>

                {uploadStatus !== "idle" ? (
                  <div className="mt-3 space-y-1">
                    <div className="h-2 rounded bg-gray-200">
                      <div
                        className="h-2 rounded bg-blue-600"
                        style={{ width: `${Math.max(0, Math.min(100, uploadProgress))}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-600">
                      {uploadStatus === "completed"
                        ? "Upload complete"
                        : uploadStatus === "failed"
                          ? "Upload failed"
                          : uploadStatus === "finalizing"
                            ? "Finalizing upload"
                            : "Uploading chunks"}
                      {uploadMessage ? ` — ${uploadMessage}` : ""}
                    </p>
                  </div>
                ) : null}

                {newLessonVideonestId ? (
                  <div className="mt-3">
                    <p className="mb-2 text-xs font-medium text-gray-600">VideoNest Preview</p>
                    <VideonestPreview videoId={newLessonVideonestId} style={{ height: 260 }} />
                  </div>
                ) : null}
              </section>

              <section className="rounded border border-gray-200 bg-white p-4">
                <h3 className="text-lg font-semibold">Current Structure</h3>
                <div className="mt-3 space-y-4">
                  {detail.modules.map((moduleRow, moduleIndex) => (
                    <article key={moduleRow.id} className="space-y-3 rounded border border-gray-200 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          className="min-w-[220px] flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
                          value={moduleDrafts[moduleRow.id] ?? moduleRow.title}
                          onChange={(event) => {
                            setModuleDrafts((current) => ({
                              ...current,
                              [moduleRow.id]: event.target.value,
                            }));
                          }}
                        />
                        <button
                          type="button"
                          className="rounded border border-gray-300 px-2 py-1 text-xs"
                          onClick={() => {
                            void saveModule(moduleRow.id);
                          }}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="rounded border border-gray-300 px-2 py-1 text-xs disabled:opacity-50"
                          disabled={moduleIndex === 0}
                          onClick={() => {
                            void reorderModule(moduleRow.id, -1);
                          }}
                        >
                          Move Up
                        </button>
                        <button
                          type="button"
                          className="rounded border border-gray-300 px-2 py-1 text-xs disabled:opacity-50"
                          disabled={moduleIndex === detail.modules.length - 1}
                          onClick={() => {
                            void reorderModule(moduleRow.id, 1);
                          }}
                        >
                          Move Down
                        </button>
                        <button
                          type="button"
                          className="rounded border border-red-300 px-2 py-1 text-xs text-red-700"
                          onClick={() => {
                            void archiveModule(moduleRow.id);
                          }}
                        >
                          Archive Module
                        </button>
                      </div>

                      <ul className="space-y-2">
                        {moduleRow.lessons.map((lesson, lessonIndex) => {
                          const draft = lessonDrafts[lesson.id] ?? toLessonDraft(lesson);

                          return (
                            <li
                              key={lesson.id}
                              className="space-y-2 rounded border border-gray-200 bg-gray-50 px-2 py-2 text-sm"
                            >
                              <div className="grid gap-2 md:grid-cols-2">
                                <input
                                  className="rounded border border-gray-300 px-2 py-1"
                                  value={draft.title}
                                  onChange={(event) => {
                                    updateLessonDraft(lesson.id, { title: event.target.value });
                                  }}
                                  placeholder="Lesson title"
                                />
                                <input
                                  className="rounded border border-gray-300 px-2 py-1"
                                  value={draft.videoUrl}
                                  onChange={(event) => {
                                    updateLessonDraft(lesson.id, { videoUrl: event.target.value });
                                  }}
                                  placeholder="Video URL"
                                />
                                <input
                                  className="rounded border border-gray-300 px-2 py-1"
                                  value={draft.videonestVideoId}
                                  onChange={(event) => {
                                    updateLessonDraft(lesson.id, { videonestVideoId: event.target.value });
                                  }}
                                  placeholder="VideoNest video ID"
                                />
                                <select
                                  className="rounded border border-gray-300 px-2 py-1"
                                  value={draft.visibility}
                                  onChange={(event) => {
                                    updateLessonDraft(lesson.id, {
                                      visibility: event.target.value as LessonVisibility,
                                    });
                                  }}
                                >
                                  <option value="free_preview">Free Preview</option>
                                  <option value="members_only">Members Only</option>
                                  <option value="specific_tier">Specific Tier</option>
                                </select>
                                <input
                                  className="rounded border border-gray-300 px-2 py-1 md:col-span-2"
                                  value={draft.requiredTier}
                                  onChange={(event) => {
                                    updateLessonDraft(lesson.id, { requiredTier: event.target.value });
                                  }}
                                  placeholder="Required tier"
                                  disabled={draft.visibility !== "specific_tier"}
                                />
                                <textarea
                                  className="rounded border border-gray-300 px-2 py-1 md:col-span-2"
                                  rows={2}
                                  value={draft.content}
                                  onChange={(event) => {
                                    updateLessonDraft(lesson.id, { content: event.target.value });
                                  }}
                                  placeholder="Lesson content"
                                />
                              </div>

                              {draft.videonestVideoId ? (
                                <VideonestPreview videoId={draft.videonestVideoId} style={{ height: 220 }} />
                              ) : null}

                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  className="rounded border border-gray-300 px-2 py-1 text-xs"
                                  onClick={() => {
                                    void saveLesson(moduleRow.id, lesson);
                                  }}
                                >
                                  Save Lesson
                                </button>
                                <button
                                  type="button"
                                  className="rounded border border-gray-300 px-2 py-1 text-xs disabled:opacity-50"
                                  disabled={lessonIndex === 0}
                                  onClick={() => {
                                    void reorderLesson(moduleRow.id, lesson.id, -1);
                                  }}
                                >
                                  Move Up
                                </button>
                                <button
                                  type="button"
                                  className="rounded border border-gray-300 px-2 py-1 text-xs disabled:opacity-50"
                                  disabled={lessonIndex === moduleRow.lessons.length - 1}
                                  onClick={() => {
                                    void reorderLesson(moduleRow.id, lesson.id, 1);
                                  }}
                                >
                                  Move Down
                                </button>
                                <button
                                  type="button"
                                  className="rounded border border-red-300 px-2 py-1 text-xs text-red-700"
                                  onClick={() => {
                                    void archiveLesson(moduleRow.id, lesson.id);
                                  }}
                                >
                                  Archive Lesson
                                </button>
                              </div>
                            </li>
                          );
                        })}

                        {moduleRow.lessons.length === 0 ? (
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
