---
id: WO-2026-004
title: Course Hosting & VideoNest Integration
goal: Build the course hosting system (Teachable-style) with VideoNest for video delivery. Courses organized as Courses → Modules → Lessons with progress tracking, drip scheduling, and completion certificates.
context: []
acceptance_criteria:
  - Course CRUD API routes (create, read, update, archive)
  - Module and Lesson CRUD nested under courses
  - VideoNest embedded player for video lessons
  - Video progress tracking (last position, watch time, completion %)
  - Drip scheduling (release lessons based on enrollment date or sequential unlock)
  - Course enrollment flow with access control
  - Student dashboard showing enrolled courses, progress bars, resume-learning
  - Lesson completion tracking (manual, time-based, quiz-pass)
  - Course completion certificates (auto-generated PDF with unique verification code)
  - Multi-brand course visibility (courses_brands table controls which brands show which courses)
  - Course admin panel for instructors to manage their content
non_goals: []
stop_conditions:
  - If VideoNest API is unavailable or undocumented, implement with placeholder video player and note blocker
  - If certificate PDF generation is complex, skip and create a follow-up WO
  - If drip scheduling logic exceeds 4 hours, implement basic sequential unlock only
priority: 1
tags: []
estimate_hours: 0.5
status: ready
created_at: 2026-02-17
updated_at: 2026-02-19
depends_on:
  - WO-2026-002
  - WO-2026-003
era: v1
---
## Notes
- 
