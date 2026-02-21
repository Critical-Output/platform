---
id: WO-2026-013
title: Instructor Admin — Course & Content Upload
goal: Build an instructor-facing interface for creating and managing courses, uploading video lessons via VideoNest, organizing modules, and controlling access per membership tier.
context: []
acceptance_criteria:
  - Create course with title, description, thumbnail, and category
  - Add and reorder modules within a course
  - Add and reorder lessons within a module
  - Video upload via VideoNest SDK with chunked upload and progress bar
  - Video preview after upload using VideonestPreview component
  - "Set lesson visibility: free preview, members-only, or specific tier"
  - Publish and unpublish courses
  - Edit existing course content
  - Course thumbnail image upload
  - View course enrollment count and completion stats
non_goals: []
stop_conditions:
  - All acceptance criteria passing
  - No TypeScript errors
  - Builds successfully
priority: 1
tags:
  - instructor
  - admin
  - courses
  - videonest
estimate_hours: 0.5
status: ready
created_at: 2026-02-21
updated_at: 2026-02-21
depends_on:
  - WO-2026-004
era: null
---
## Notes
- 
