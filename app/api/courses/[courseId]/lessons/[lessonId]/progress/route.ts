import { runLessonProgressPost } from "./progress-post";

export async function POST(
  request: Request,
  { params }: { params: { courseId: string; lessonId: string } },
) {
  return runLessonProgressPost(request, { params });
}
