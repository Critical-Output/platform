---
id: WO-2026-002
title: Supabase Database Schema & Multi-Tenant Foundation
goal: Create the complete Supabase database schema for PursuitsHQ multi-tenant CRM platform. This is the data foundation everything else builds on.
context: []
acceptance_criteria:
  - Supabase project created and pgvector extension enabled
  - "All core tables created: brands, customers, instructors, instructors_brands, courses, courses_brands, modules, lessons, enrollments, progress, bookings, subscriptions, payments, content_access, tags, certificates"
  - "Multi-tenant architecture: brand_id on all relevant tables with proper foreign keys"
  - Row Level Security (RLS) enabled on all tables with policies for customer self-access and brand admin access
  - Soft deletes (deleted_at) on all tables — never hard delete
  - Audit trails (created_at, updated_at, created_by) on all tables
  - updated_at trigger function applied to all tables
  - UUID primary keys on all tables (gen_random_uuid)
  - JSONB metadata columns for extensibility
  - Proper indexes for common query patterns (email lookup, enrollment queries, booking schedules)
  - "Seed data: 4 brands (CTI, Karen Miles, Gebben Miles, Sporting Clays Academy)"
  - Supabase client configured in Next.js app (env vars for URL and anon key)
  - Schema documentation in docs/database-schema.md matches actual deployed schema
non_goals: []
stop_conditions:
  - If Supabase project creation fails, stop and report
  - If any migration fails, stop and report the specific SQL error
  - If RLS policies break basic CRUD operations, stop and report
priority: 1
tags: []
estimate_hours: 0.5
status: ready
created_at: 2026-02-17
updated_at: 2026-02-18
depends_on:
  - WO-2026-001
era: v0
---
## Notes
- 
