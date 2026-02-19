---
id: WO-2026-003
title: Auth & User Management (Supabase Auth)
goal: Implement authentication and user management using Supabase Auth. Users should be able to sign up, log in, and have their auth identity linked to the customers table. Support multi-brand login (same user can access multiple brand sites).
context: []
acceptance_criteria:
  - Supabase Auth configured with email/password and OAuth (Google) providers
  - Sign up flow creates entry in both auth.users and public.customers table
  - Login flow works across all brand domains (shared auth, brand-specific sessions)
  - Protected routes middleware using Supabase auth helpers
  - User profile page showing customer data from Supabase
  - Password reset flow via email (Resend integration)
  - Session management (JWT refresh, logout)
  - RLS policies working correctly with auth.uid()
  - Anonymous ID (from localStorage) linked to customer record on first login
non_goals: []
stop_conditions:
  - If Supabase Auth config fails, stop and report
  - If OAuth provider setup requires domain verification not yet available, note it and continue with email/password only
  - If RLS policies conflict with auth flow, stop and report
priority: 1
tags: []
estimate_hours: 0.5
status: ready
created_at: 2026-02-17
updated_at: 2026-02-18
depends_on:
  - WO-2026-002
era: v0
---
## Notes
- 
