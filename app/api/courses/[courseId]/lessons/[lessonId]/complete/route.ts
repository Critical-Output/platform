import { runLessonCompletePost } from "./complete-post";

export async function POST(
  request: Request,
  { params }: { params: { courseId: string; lessonId: string } },
) {
  return runLessonCompletePost(request, { params });
}
