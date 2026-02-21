---
id: WO-2026-008
title: Identity Resolution Engine — Cross-Domain User Stitching
goal: Build the identity resolution system that stitches anonymous visitors across multiple brand domains into unified customer profiles using deterministic and probabilistic matching.
context: []
acceptance_criteria:
  - "Identity graph in ClickHouse tracking: anonymous_id, user_id, email, phone, device_fingerprint"
  - Deterministic merge on login (anonymous_id to user_id, confidence 1.0)
  - Deterministic merge on email match across brands (confidence 1.0)
  - Deterministic merge on phone match (confidence 1.0)
  - Probabilistic merge on device fingerprint (confidence 0.7-0.85)
  - "Alias API: when user identifies with email/phone, merge all anonymous sessions"
  - Cross-domain link decoration working
  - Identity resolution runs every 15 min
  - Canonical user ID resolved for all events
  - Admin view for all identifiers linked to a customer profile
  - "GDPR: delete all identity graph entries on request"
non_goals: []
stop_conditions:
  - If probabilistic matching produces >5% false merge rate, disable and keep deterministic only
  - If dbt setup exceeds 3 hours, implement as simple SQL cron job instead
priority: 2
tags: []
estimate_hours: 0.5
status: done
created_at: 2026-02-17
updated_at: 2026-02-21
depends_on:
  - WO-2026-007
  - WO-2026-003
era: v1
---
## Notes
- 
