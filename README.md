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
.env.example         # Required environment variables
```
