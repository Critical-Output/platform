---
id: WO-2026-006
title: Stripe Payments & Subscription Management
goal: Integrate Stripe Connect Standard for payment processing. Support one-time payments (courses, bookings), subscriptions (membership tiers), coupons, and affiliate revenue tracking.
context: []
acceptance_criteria:
  - Stripe Connect Standard integration (instructors connect their own Stripe accounts)
  - Checkout flow for course purchases (one-time payment)
  - Checkout flow for booking deposits
  - Subscription management (create, upgrade, downgrade, cancel)
  - Coupon/promo code system (percentage, fixed amount, free trial)
  - Stripe webhook handler for payment events (payment_intent.succeeded, subscription.updated, etc.)
  - Payment history stored in payments table with Stripe IDs
  - Automatic sales tax via Stripe Tax API
  - Refund processing flow
  - Revenue dashboard showing total revenue, MRR, by brand
non_goals: []
stop_conditions:
  - If Stripe Connect onboarding requires business verification docs, implement basic Stripe Checkout instead
  - If tax API setup is complex, skip and create follow-up WO
priority: 2
tags: []
estimate_hours: 0.5
status: backlog
created_at: 2026-02-17
updated_at: 2026-02-17
depends_on:
  - WO-2026-002
  - WO-2026-003
era: v1
---
## Notes
- 
