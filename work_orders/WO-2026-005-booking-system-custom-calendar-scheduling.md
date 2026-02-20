---
id: WO-2026-005
title: Booking System — Custom Calendar & Scheduling
goal: Build a custom booking system for 1:1 coaching sessions (NOT Calendly). Instructors set availability, students book sessions, confirmations sent via SMS and email.
context: []
acceptance_criteria:
  - Instructor availability management (recurring weekly slots + date overrides)
  - "Booking creation flow: student selects instructor → picks date/time → confirms → pays"
  - "Booking status lifecycle: pending → confirmed → completed/cancelled/no-show"
  - Buffer time between sessions (configurable per instructor, default 15 min)
  - Advance booking limit (configurable, default 90 days)
  - Cancellation policy enforcement (configurable hours-before cutoff)
  - SMS confirmation via Twilio on booking creation and 24h reminder
  - Email confirmation via Resend on booking creation
  - Calendar view for instructors showing upcoming sessions
  - "Booking admin: instructors can add notes post-session"
  - "Multi-brand: bookings tagged with brand_id, instructors can work across brands"
  - Timezone-aware (instructor and student timezones respected)
non_goals: []
stop_conditions:
  - If Twilio SMS integration fails, implement email-only and note blocker
  - If calendar UI exceeds scope, build API only and skip calendar frontend
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
