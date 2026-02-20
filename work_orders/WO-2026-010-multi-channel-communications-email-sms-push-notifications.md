---
id: WO-2026-010
title: Multi-Channel Communications — Email, SMS, Push Notifications
goal: Build the multi-channel communication system using Resend (email), Twilio (SMS/voice), and web push notifications. Support transactional messages, marketing sequences, and event-triggered automations.
context: []
acceptance_criteria:
  - Resend integration for transactional email (welcome, booking confirmation, password reset, course enrollment)
  - Email template system with brand-specific theming (CTI, Karen Miles, etc.)
  - Twilio SMS integration for booking reminders, OTP verification, and marketing messages
  - "Notification preferences: customers can opt in/out per channel per brand"
  - "Event-triggered automations: course_completed → send email with next steps"
  - "Weekly digest email: top community posts, new content, upcoming events"
  - "Re-engagement sequence: 14 days inactive → email → 21 days → SMS"
  - QR code generation for physical retail (links to free course signup with UTM tracking)
  - Coupon code system for physical retail and events
  - Notification queue with retry logic and delivery tracking
  - Unsubscribe handling (one-click unsubscribe, CAN-SPAM compliant)
non_goals: []
stop_conditions:
  - If Twilio setup requires number verification delays, implement email-only first
  - If push notification implementation exceeds 3 hours, skip for follow-up WO
priority: 2
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
