# Platform

Production-ready scaffold for the PursuitsHQ CRM Brain + Platform Core.

## Tech Stack

- Next.js 14 (App Router)
- TypeScript (strict)
- Tailwind CSS
- Supabase helpers (`@supabase/auth-helpers-nextjs`)
- RudderStack analytics wrapper (`@rudderstack/analytics-js`)

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Then open `http://localhost:3000`.

## Auth Setup (WO-2026-003)

This repo now includes Supabase Auth user management:

- Email/password login + signup
- Google OAuth login
- Protected `/profile` route via middleware
- Password reset flow (`/auth/forgot-password` -> `/auth/reset-password`)
- Customer sync to `public.customers` on signup/login (multi-brand aware)

### Environment variables

Copy `.env.example` to `.env.local` and set:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (used by other work orders; auth flow itself uses RPC + RLS-safe functions)
- `NEXT_PUBLIC_SITE_URL` (auth callback base URL)
- One of:
  - `NEXT_PUBLIC_BRAND_SLUG` (single brand deploy)
  - `BRAND_DOMAIN_MAP` (multi-brand host -> slug mapping)
- `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`
- `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`
- `RESEND_SMTP_KEY`
- `RESEND_FROM_EMAIL`

### Supabase notes

- Run migrations to install auth/customer sync helpers and trigger:
  `supabase/migrations/20260218184500_auth_customer_sync.sql`
- Google OAuth can require provider/domain configuration in Supabase dashboard.
  If domain verification is pending, email/password auth still works.

## Build

```bash
npm run build
```

## Project Structure

```text
app/                 # Next.js App Router (routes, layouts, etc.)
app/api/events/      # Events ingestion endpoint
docs/                # Project documentation
lib/supabase/        # Supabase client helpers
lib/rudderstack/     # RudderStack client wrapper
clickhouse/          # ClickHouse schema (local dev init)
docker-compose.analytics.yml # Local ClickHouse for analytics
.env.example         # Required environment variables
```
