# Booking System (WO-2026-005)

This work order implements an API-first custom scheduling system for 1:1 coaching sessions.

## Included Scope

- Instructor availability management:
  - Recurring weekly availability slots
  - Date overrides (block date or custom date window)
- Booking flow API:
  - Student selects instructor
  - Student selects date/time
  - Booking is created (`pending`), and auto-promoted to `confirmed` when payment is marked paid
- Booking lifecycle statuses:
  - `pending -> confirmed -> completed|cancelled|no_show`
- Instructor scheduling controls (per instructor + brand):
  - `buffer_minutes` (default `15`)
  - `advance_booking_days` (default `90`)
  - `cancellation_cutoff_hours`
- Timezone-aware scheduling:
  - Stores both `student_timezone` and `instructor_timezone`
  - Availability checks run in instructor timezone
- Notifications:
  - Booking creation email via Resend
  - Booking creation SMS via Twilio
  - 24h reminder via Twilio SMS
  - If Twilio is unavailable/fails, email-only fallback is returned with `sms_blocker`
- Instructor calendar API for upcoming sessions
- Instructor/admin booking notes via `instructor_notes`
- Multi-brand support:
  - Bookings are `brand_id` scoped
  - Instructors can be attached to multiple brands via `instructors_brands`

## API Endpoints

- `GET /api/instructors?brand_id=...`
  - Returns instructors available for a brand
- `GET /api/instructors/:instructorId/availability?brand_id=...&from=YYYY-MM-DD&to=YYYY-MM-DD`
  - Returns scheduling settings + weekly rules + overrides
- `PUT /api/instructors/:instructorId/availability`
  - Upserts settings, replaces weekly slots, applies date overrides
- `GET /api/instructors/:instructorId/calendar?brand_id=...`
  - API calendar view of upcoming instructor sessions
- `GET /api/bookings?brand_id=...`
  - Returns bookings visible to authenticated user
- `POST /api/bookings`
  - Creates booking and triggers confirmation notifications
- `PATCH /api/bookings/:bookingId`
  - Updates booking status and/or notes (with lifecycle + policy checks)
- `POST /api/bookings/reminders`
  - Sends 24h reminders to confirmed bookings
  - Requires header `x-booking-reminder-key: $BOOKING_REMINDER_API_KEY`

## Required Environment Variables

- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`
- `BOOKING_REMINDER_API_KEY`

## Migration

Apply:

- `supabase/migrations/20260220143000_booking_system_scheduling.sql`

This migration adds scheduling tables, booking lifecycle fields, notification log table, and multi-brand instructor linkage enforcement.
