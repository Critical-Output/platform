---
id: WO-2026-007
title: RudderStack + ClickHouse Event Pipeline Setup
goal: Set up the event collection and analytics pipeline using RudderStack (open-source CDP) and ClickHouse for clickstream storage. This is the foundation of the Customer Intelligence engine.
context: []
acceptance_criteria:
  - RudderStack data plane deployed (self-hosted or cloud free tier)
  - RudderStack JavaScript SDK integrated into Next.js app (lib/rudderstack/client.ts)
  - ClickHouse instance provisioned (ClickHouse Cloud free tier or self-hosted)
  - Events table created in ClickHouse following Segment spec (event_id, anonymous_id, user_id, session_id, event_name, properties, context, timestamp)
  - Identity graph table created in ClickHouse
  - RudderStack warehouse destination configured to pipe events into ClickHouse
  - "Client-side tracking working: page_view, video_play, course_enrolled, booking_created events firing"
  - Server-side event API route (/api/events) for backend event emission
  - Anonymous ID generation and persistence (localStorage + first-party cookie)
  - Cross-domain tracking via link decoration (append anonymous_id to outbound links between brand sites)
  - "Basic materialized views: user_activity_summary, course_engagement_metrics"
non_goals: []
stop_conditions:
  - If RudderStack self-hosted deployment exceeds 3 hours, use RudderStack Cloud free tier instead
  - If ClickHouse Cloud signup is blocked, use ClickHouse local Docker for dev
  - If cross-domain tracking requires DNS changes not yet available, skip and note blocker
priority: 1
tags: []
estimate_hours: 0.5
status: ready
created_at: 2026-02-17
updated_at: 2026-02-18
depends_on:
  - WO-2026-001
era: v1
---
## Notes
- 
