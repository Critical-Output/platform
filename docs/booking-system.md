# Booking System (WO-2026-005)

This work order ships an API-first custom booking system for 1:1 coaching sessions.

## Highlights

- Instructor scheduling settings per brand:
  - `timezone`
  - `buffer_minutes` (default `15`)
  - `advance_booking_days` (default `90`)
  - `cancellation_cutoff_hours` (default `24`)
- Availability management:
  - recurring weekly slots (`instructor_weekly_availability`)
  - date overrides (`instructor_date_overrides`)
- Booking lifecycle:
  - `pending -> confirmed -> completed|cancelled|no_show`
- Payment capture linkage:
  - `bookings.payment_status`
  - `payments.booking_id`
- Multi-brand instructor assignment:
  - instructors can be assigned across brands through `instructors_brands`
- Timezone-aware slot querying and booking metadata (`student_timezone`, `instructor_timezone`)
- Notifications:
  - Email confirmation via Resend on booking creation
  - SMS confirmation via Twilio on booking creation
  - 24-hour reminder SMS dispatch endpoint

## API Endpoints

- `GET /api/bookings/instructors`
  - List instructors assigned to current brand.

- `GET /api/bookings/availability?instructorId=...&startDate=YYYY-MM-DD&days=14&sessionMinutes=60&studentTimezone=...`
  - Returns instructor availability slots from recurring rules + overrides.

- `PUT /api/bookings/availability`
  - Upsert instructor scheduling settings.
  - Replace weekly slots and date overrides.

- `POST /api/bookings`
  - Student booking creation (`pending`) with overlap checks, buffer handling, and advance booking validation.
  - Sends booking confirmation email + SMS (best-effort; warnings returned when unavailable).

- `GET /api/bookings?instructorId=...&upcomingOnly=true`
  - Instructor calendar feed for upcoming sessions.

- `PATCH /api/bookings/:bookingId`
  - Booking lifecycle updates.
  - Confirm-and-pay flow: set `status=confirmed` with payment payload.
  - Supports post-session `instructorNotes`.

- `POST /api/bookings/reminders`
  - Sends 24h reminder SMS for confirmed bookings (`x-booking-cron-secret` when configured).

## Required/Optional Environment Variables

- `RESEND_FROM_EMAIL`
- `RESEND_API_KEY` (or `RESEND_SMTP_KEY` fallback)
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`
- `BOOKING_REMINDER_CRON_SECRET` (optional; recommended)

## Notes

- Calendar is delivered as API data (`GET /api/bookings?instructorId=...`) per WO stop condition.
- If Twilio credentials are missing/failing, booking creation continues and returns warnings while email still attempts delivery.
