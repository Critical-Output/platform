import { buildModuleOrderById, sortLessonsForUnlock } from "./drip";
import type { LessonRecord, ModuleRecord } from "./types";

export type DashboardModuleOrderingRow = Pick<ModuleRecord, "id" | "position" | "created_at">;
export type DashboardLessonOrderingRow = Pick<
  LessonRecord,
  "id" | "module_id" | "position" | "created_at"
>;

export const orderDashboardLessonIds = (
  modules: DashboardModuleOrderingRow[],
  lessons: DashboardLessonOrderingRow[],
): string[] => {
  const moduleOrderById = buildModuleOrderById(modules);
  return sortLessonsForUnlock(lessons, moduleOrderById).map((lesson) => lesson.id);
};
