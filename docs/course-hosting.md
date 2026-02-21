# Course Hosting (WO-2026-004)

This repository now includes a Teachable-style course hosting baseline with:

- Course -> Module -> Lesson API CRUD
- Student enrollment and access checks
- Lesson progress tracking (`last_position_seconds`, `watch_time_seconds`, `% complete`)
- Drip unlock (sequential + optional enrollment-day delay from lesson metadata)
- Manual/time-based/quiz-pass lesson completion
- Auto-issued certificates with unique verification code and PDF download
- Brand-scoped visibility using `courses_brands`
- Student dashboard and instructor admin UI

## API Routes

- `GET|POST /api/courses`
- `GET|PATCH|DELETE /api/courses/:courseId`
- `POST /api/courses/:courseId/enroll`
- `GET|POST /api/courses/:courseId/modules`
- `GET|PATCH|DELETE /api/courses/:courseId/modules/:moduleId`
- `GET|POST /api/courses/:courseId/modules/:moduleId/lessons`
- `GET|PATCH|DELETE /api/courses/:courseId/modules/:moduleId/lessons/:lessonId`
- `POST /api/courses/:courseId/lessons/:lessonId/progress`
- `POST /api/courses/:courseId/lessons/:lessonId/complete`
- `GET /api/certificates/:certificateId/pdf`
- `GET /api/certificates/verify/:code`

## UI Routes

- Student catalog: `/courses`
- Student course dashboard: `/dashboard/courses`
- Course learning view: `/courses/:courseId`
- Instructor admin panel: `/admin/courses`

## VideoNest note

Instructor admin now includes VideoNest upload wiring via `uploadVideo()` with chunked client upload, progress callbacks, and `VideonestPreview` playback after upload.

Implemented endpoints/components:

- `POST|PATCH /api/videonest/upload` for authenticated admin upload chunking + finalize
- Local `videonest-sdk` compatibility module at `lib/videonest/sdk.tsx`
- Lesson metadata linkage through `metadata.videonest_video_id`

Learner playback continues to support both direct `video_url` HTML5 video and VideoNest embed IDs.
