# Intelligence Engine (WO-2026-009)

This module powers personalized cross-sell and offer selection.

## What It Implements

- Offer catalog with targeting rules:
  - audience segment
  - trigger event
  - channel
  - priority
- Journey stage detection: `new -> engaged -> customer -> advocate`
- Funnel progression logic: `free_content -> paid_course -> group_coaching -> one_on_one_coaching -> equipment`
- Cross-sell rule: CTI beginner completion routes to Karen Miles advanced coaching
- Trigger rules:
  - `course_completed` within 24h
  - `inactivity_14_days`
- Multi-channel offer support:
  - `email` (Resend)
  - `sms` (Twilio)
  - `push`
  - `in_app`
  - `qr`
- Offer selection API: `POST /api/offers/select`
- Performance tracking API: `POST /api/offers/track`
- Affiliate attribution with rev-share calculation (basis points)

## API: Select Best Offer

Endpoint: `POST /api/offers/select`

Required body fields:

- `customer_id`
- `channel` (`email|sms|push|in_app|qr`)

Optional body fields:

- `brand_id`
- `event_history[]` (manual context override)
- `profile` (segments, referral count, last activity)
- `now` (ISO datetime for deterministic testing)

Headers:

- `x-offers-api-key` must match `OFFERS_API_KEY` outside development.

Response includes journey stage, funnel stage, active triggers, and selected offer variant.

## API: Track Offer Performance

Endpoint: `POST /api/offers/track`

Required body fields:

- `customer_id`
- `offer_id`
- `channel`
- `event_type` (`impression|click|conversion`)

Optional body fields:

- `variant_id`
- `revenue_cents`
- `attributed_instructor_id`
- `attribution_channel`
- `affiliate_rate_bps`
- `occurred_at`

Tracking records are written to ClickHouse `analytics.events` as `offer_*` events when configured.

## A/B Testing v1

The current framework uses deterministic weighted assignment per `customer_id + offer_id`.
A richer experimentation system can be added in v2.
