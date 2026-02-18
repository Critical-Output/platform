---
id: WO-2026-009
title: Intelligence Engine — Cross-Sell & Offer Selection
goal: Build the intelligence engine that decides what offers to show each customer based on their journey, behavior, and profile. This is the brain that powers personalized cross-sell across all brands and channels.
context: []
acceptance_criteria:
  - "Offer catalog: define offers with targeting rules (audience segment, trigger event, channel, priority)"
  - "Customer journey stage detection: new → engaged → customer → advocate (based on event history)"
  - "Cross-sell rules engine: bought CTI beginner course → recommend Karen Miles advanced coaching"
  - "Funnel logic: free content → paid course → group coaching → 1:1 coaching → equipment"
  - "Multi-channel delivery: offers can be delivered via email (Resend), SMS (Twilio), push notification, in-app banner, or QR code"
  - "Offer selection API: given a customer_id and channel, return the best offer to show"
  - "Trigger-based offers: course_completed → send upsell email within 24h"
  - "Inactivity re-engagement: no activity for 14 days → trigger win-back sequence"
  - A/B testing framework for offer variants
  - "Offer performance tracking: impressions, clicks, conversions, revenue attributed"
  - "Affiliate attribution: track which instructor/channel drove each conversion with rev share calculation"
non_goals: []
stop_conditions:
  - If A/B testing framework exceeds scope, implement simple random assignment and note for v2
  - If multi-channel delivery integration takes too long, implement email-only first
priority: 2
tags: []
estimate_hours: 0.5
status: backlog
created_at: 2026-02-17
updated_at: 2026-02-17
depends_on:
  - WO-2026-008
  - WO-2026-004
era: v1
---
## Notes
- 
