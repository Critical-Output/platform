---
id: WO-2026-015
title: "[Auto] Revert unrelated certificate helper refactor"
goal: "Evaluate and implement if appropriate: Revert unrelated certificate helper refactor"
context:
  - Surfaced during WO-2026-013 review
  - "File: lib/courses/certificates.ts (23-30)"
  - "Change: Revert unrelated certificate helper refactor"
  - "Rationale: Type-cast broadening in certificate lookup helper is outside this WO scope and weakens type safety without clear linkage to acceptance criteria."
acceptance_criteria: []
non_goals: []
stop_conditions: []
priority: 3
tags:
  - auto-generated
  - from-scope-creep
estimate_hours: 0.5
status: backlog
created_at: 2026-02-21
updated_at: 2026-02-21
depends_on: []
era: null
---
## Notes
- 
