# Auth & User Management (Supabase Auth)

Implemented for `WO-2026-003`.

## Features

- Email/password signup and login
- Google OAuth login
- Password reset via email (`/auth/forgot-password`)
- Protected profile route (`/profile`) with middleware session checks
- Logout via server action
- Customer sync between `auth.users` and `public.customers`
- Multi-brand login support via hostname -> brand slug resolution
- Anonymous ID linking from browser storage/cookie to `customers.metadata.anonymous_ids`

## Core Routes

- `/auth/signup`
- `/auth/login`
- `/auth/forgot-password`
- `/auth/reset-password`
- `/auth/callback`
- `/profile`
- `POST /api/auth/link-anonymous`

## Brand Resolution

Brand slug is resolved in this order:

1. `BRAND_DOMAIN_MAP` entry for request host
2. Subdomain-derived slug (e.g. `cti.example.com` -> `cti`)
3. `NEXT_PUBLIC_BRAND_SLUG`

## Database Helpers

Migration: `supabase/migrations/20260218184500_auth_customer_sync.sql`

- `public.sync_customer_for_current_brand(p_brand_slug, p_anonymous_id)`
- `public.sync_customer_for_user_id(p_user_id, p_brand_slug, p_anonymous_id)`
- Trigger: `on_auth_user_created_sync_customer` on `auth.users`

These functions are `SECURITY DEFINER` and use `auth.uid()` for authenticated RPC access.

## Password Reset Email (Resend)

`supabase/config.toml` configures Supabase Auth SMTP to use Resend:

- host: `smtp.resend.com`
- user: `resend`
- pass: `env(RESEND_SMTP_KEY)`
- sender: `env(RESEND_FROM_EMAIL)`

## OAuth Notes

Google OAuth is configured in `supabase/config.toml`.
If provider/domain verification is pending, continue with email/password login until OAuth is verified.
