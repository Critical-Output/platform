import { runVideoNestUploadPatch, runVideoNestUploadPost } from "./upload-route";

export async function POST(request: Request) {
  return runVideoNestUploadPost(request);
}

export async function PATCH(request: Request) {
  return runVideoNestUploadPatch(request);
}
