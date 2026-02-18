---
id: WO-2026-001
title: Scaffold Platform with Next.js 14, TypeScript, Tailwind CSS, and Supabase
goal: Initialize the platform repository with a production-ready Next.js 14 (App Router) boilerplate including TypeScript, Tailwind CSS, Supabase client configuration, RudderStack analytics wrapper, and proper project structure.
context: []
acceptance_criteria:
  - Next.js 14 with App Router initialized in the repo
  - TypeScript configured with strict mode
  - Tailwind CSS installed and configured with base styles
  - Supabase client helpers created for both client and server components (@supabase/auth-helpers-nextjs)
  - RudderStack analytics wrapper created (lib/rudderstack/client.ts)
  - Environment configuration (.env.example) with all required variables (Supabase, RudderStack, ClickHouse, Brand Config)
  - "Project folder structure created: lib/supabase/, lib/rudderstack/, app/api/events/, docs/"
  - README.md with setup instructions, tech stack, and project structure
  - All dependencies installed and project builds without errors (npm run build passes)
  - Code committed and pushed to Critical-Output/platform main branch
non_goals: []
stop_conditions:
  - If Next.js create-next-app fails, report the error and stop
  - If npm install fails for any dependency, report which one and stop
  - If git push fails due to permissions, report and stop
  - Do not modify any existing code in the repo beyond the scaffold
priority: 1
tags:
  - network:full
estimate_hours: 0.5
status: done
created_at: 2026-02-17
updated_at: 2026-02-18
depends_on: []
era: v0
---
## Notes
- 
