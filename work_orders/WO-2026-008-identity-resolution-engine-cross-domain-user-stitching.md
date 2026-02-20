---
id: WO-2026-008
title: Identity Resolution Engine — Cross-Domain User Stitching
goal: Build the identity resolution system that stitches anonymous visitors across multiple brand domains into unified customer profiles. Supports deterministic (email, phone, login) and probabilistic (device fingerprint, IP) matching.
context: []
acceptance_criteria:
  - "Identity graph in ClickHouse tracking: anonymous_id, user_id, email, phone, device_fingerprint"
  - Deterministic merge on login (anonymous_id → user_id, confidence 1.0)
  - Deterministic merge on email match across brands (confidence 1.0)
  - Deterministic merge on phone match (confidence 1.0)
  - Probabilistic merge on device fingerprint (confidence 0.7-0.85)
  - "Alias API: when user identifies with email/phone, merge all their anonymous sessions"
  - Cross-domain link decoration working (anonymous_id passed via URL params between brand sites)
  - Identity resolution runs as dbt transformation in ClickHouse (batch, every 15 min)
  - Canonical user ID resolved for all events (backfill anonymous events when user identifies)
  - "Admin view: see all identifiers linked to a customer profile"
  - "GDPR compliance: delete all identity graph entries when customer requests deletion"
non_goals: []
stop_conditions:
  - If probabilistic matching produces too many false merges (>5% error rate), disable and keep deterministic only
  - If dbt setup exceeds 3 hours, implement identity resolution as a simple SQL cron job
priority: 2
tags: []
estimate_hours: 0.5
status: ready
created_at: 2026-02-17
updated_at: 2026-02-19
depends_on:
  - WO-2026-007
  - WO-2026-003
era: v1
---
## Notes
- 
