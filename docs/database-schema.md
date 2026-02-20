# Database Schema (Supabase)

This project uses a multi-tenant Postgres schema where a `brand` is the tenant boundary.

## Extensions

- `pgcrypto` (for `gen_random_uuid()`)
- `vector` (pgvector; enabled for future semantic search use cases)

## Common Conventions

All tables use:

- `id uuid primary key default gen_random_uuid()`
- Soft deletes: `deleted_at timestamptz` (no hard-deletes via API; delete policies are not defined)
- Audit columns: `created_at`, `updated_at`, `created_by`
- Extensibility: `metadata jsonb not null default '{}'::jsonb`
- `updated_at` is maintained by the `public.set_updated_at()` trigger on every table.

## Multi-Tenancy Model

- `public.brands` is the tenant root.
- Most business tables include a `brand_id` foreign key to `public.brands(id)`.
- Tenant-safe relationships: when a brand-scoped table references another brand-scoped table, it uses a composite foreign key on `(referenced_id, brand_id) -> (id, brand_id)` to prevent cross-tenant links.
- Brand admin access is defined by `public.brand_members`:
  - `role in ('owner','admin')` for the current `auth.uid()`.

## Tables

### `public.brands`

- `id uuid`
- `slug text` (lowercase slug format; unique for non-deleted rows)
- `name text`
- `support_email text`
- `logo_url text`
- `metadata jsonb`
- `created_at timestamptz`
- `updated_at timestamptz`
- `created_by uuid -> auth.users(id)`
- `deleted_at timestamptz`

Indexes:

- `brands_slug_unique` on `(slug)` where `deleted_at is null`

### `public.brand_members`

- `id uuid`
- `brand_id uuid -> public.brands(id)`
- `user_id uuid -> auth.users(id)`
- `role text` (`owner|admin|member`)
- `metadata jsonb`
- `created_at timestamptz`
- `updated_at timestamptz`
- `created_by uuid -> auth.users(id)`
- `deleted_at timestamptz`

Indexes:

- `brand_members_brand_user_unique` on `(brand_id, user_id)` where `deleted_at is null`

### `public.customers`

- `id uuid`
- `brand_id uuid -> public.brands(id)`
- `auth_user_id uuid -> auth.users(id)`
- `email text`
- `first_name text`
- `last_name text`
- `phone text`
- `metadata jsonb`
- `created_at timestamptz`
- `updated_at timestamptz`
- `created_by uuid -> auth.users(id)`
- `deleted_at timestamptz`

Indexes:

- `customers_brand_email_lookup_idx` on `(brand_id, lower(email))` where `deleted_at is null`
- `customers_auth_user_idx` on `(auth_user_id)` where `deleted_at is null`

### `public.instructors`

- `id uuid`
- `brand_id uuid -> public.brands(id)`
- `email text`
- `first_name text`
- `last_name text`
- `bio text`
- `metadata jsonb`
- `created_at timestamptz`
- `updated_at timestamptz`
- `created_by uuid -> auth.users(id)`
- `deleted_at timestamptz`

Indexes:

- `instructors_brand_email_lookup_idx` on `(brand_id, lower(email))` where `deleted_at is null`

### `public.instructors_brands`

- `id uuid`
- `brand_id uuid -> public.brands(id)`
- `instructor_id uuid` (FK: `(instructor_id, brand_id) -> public.instructors(id, brand_id)`)
- `metadata jsonb`
- `created_at timestamptz`
- `updated_at timestamptz`
- `created_by uuid -> auth.users(id)`
- `deleted_at timestamptz`

Indexes:

- `instructors_brands_unique` on `(brand_id, instructor_id)` where `deleted_at is null`

### `public.courses`

- `id uuid`
- `brand_id uuid -> public.brands(id)`
- `title text`
- `description text`
- `level text`
- `duration_minutes integer`
- `metadata jsonb`
- `created_at timestamptz`
- `updated_at timestamptz`
- `created_by uuid -> auth.users(id)`
- `deleted_at timestamptz`

Indexes:

- `courses_brand_title_idx` on `(brand_id, title)` where `deleted_at is null`

### `public.courses_brands`

- `id uuid`
- `brand_id uuid -> public.brands(id)`
- `course_id uuid` (FK: `(course_id, brand_id) -> public.courses(id, brand_id)`)
- `metadata jsonb`
- `created_at timestamptz`
- `updated_at timestamptz`
- `created_by uuid -> auth.users(id)`
- `deleted_at timestamptz`

Indexes:

- `courses_brands_unique` on `(brand_id, course_id)` where `deleted_at is null`

### `public.modules`

- `id uuid`
- `brand_id uuid -> public.brands(id)`
- `course_id uuid` (FK: `(course_id, brand_id) -> public.courses(id, brand_id)`)
- `title text`
- `position integer`
- `metadata jsonb`
- `created_at timestamptz`
- `updated_at timestamptz`
- `created_by uuid -> auth.users(id)`
- `deleted_at timestamptz`

Indexes:

- `modules_course_position_idx` on `(course_id, position)` where `deleted_at is null`

### `public.lessons`

- `id uuid`
- `brand_id uuid -> public.brands(id)`
- `module_id uuid` (FK: `(module_id, brand_id) -> public.modules(id, brand_id)`)
- `title text`
- `content text`
- `video_url text`
- `duration_minutes integer`
- `position integer`
- `metadata jsonb`
- `created_at timestamptz`
- `updated_at timestamptz`
- `created_by uuid -> auth.users(id)`
- `deleted_at timestamptz`

Indexes:

- `lessons_module_position_idx` on `(module_id, position)` where `deleted_at is null`

### `public.enrollments`

- `id uuid`
- `brand_id uuid -> public.brands(id)`
- `customer_id uuid` (FK: `(customer_id, brand_id) -> public.customers(id, brand_id)`)
- `course_id uuid` (FK: `(course_id, brand_id) -> public.courses(id, brand_id)`)
- `status text` (`active|completed|cancelled`)
- `enrolled_at timestamptz`
- `completed_at timestamptz`
- `metadata jsonb`
- `created_at timestamptz`
- `updated_at timestamptz`
- `created_by uuid -> auth.users(id)`
- `deleted_at timestamptz`

Indexes:

- `enrollments_customer_lookup_idx` on `(brand_id, customer_id, status)` where `deleted_at is null`
- `enrollments_course_lookup_idx` on `(brand_id, course_id, status)` where `deleted_at is null`

### `public.progress`

- `id uuid`
- `brand_id uuid -> public.brands(id)`
- `enrollment_id uuid` (FK: `(enrollment_id, brand_id) -> public.enrollments(id, brand_id)`)
- `lesson_id uuid` (FK: `(lesson_id, brand_id) -> public.lessons(id, brand_id)`)
- `percent_complete numeric(5,2)` (0..100)
- `completed_at timestamptz`
- `metadata jsonb`
- `created_at timestamptz`
- `updated_at timestamptz`
- `created_by uuid -> auth.users(id)`
- `deleted_at timestamptz`

Indexes:

- `progress_unique_lesson_per_enrollment` on `(enrollment_id, lesson_id)` where `deleted_at is null`
- `progress_enrollment_idx` on `(enrollment_id)` where `deleted_at is null`

### `public.bookings`

- `id uuid`
- `brand_id uuid -> public.brands(id)`
- `customer_id uuid` (FK: `(customer_id, brand_id) -> public.customers(id, brand_id)`)
- `instructor_id uuid` (nullable; FK: `instructor_id -> public.instructors(id)`, brand assignment enforced via `public.instructor_in_brand(...)`)
- `course_id uuid` (nullable; FK: `(course_id, brand_id) -> public.courses(id, brand_id)`)
- `status text` (`pending|confirmed|completed|cancelled|no_show`)
- `payment_status text` (`unpaid|paid|failed|refunded`)
- `payment_reference text`
- `start_at timestamptz`
- `end_at timestamptz` (`end_at > start_at`)
- `student_timezone text` (default `UTC`)
- `instructor_timezone text` (default `UTC`)
- `confirmed_at timestamptz`
- `cancelled_at timestamptz`
- `completed_at timestamptz`
- `reminder_sent_at timestamptz`
- `location text`
- `notes text`
- `instructor_notes text`
- `metadata jsonb`
- `created_at timestamptz`
- `updated_at timestamptz`
- `created_by uuid -> auth.users(id)`
- `deleted_at timestamptz`

Indexes:

- `bookings_instructor_schedule_idx` on `(brand_id, instructor_id, start_at)` where `deleted_at is null`
- `bookings_customer_schedule_idx` on `(brand_id, customer_id, start_at)` where `deleted_at is null`
- `bookings_upcoming_instructor_idx` on `(brand_id, instructor_id, start_at)` where `deleted_at is null and status in ('pending','confirmed')`
- `bookings_confirmed_reminder_idx` on `(brand_id, start_at, reminder_sent_at)` where `deleted_at is null and status = 'confirmed'`

### `public.subscriptions`

- `id uuid`
- `brand_id uuid -> public.brands(id)`
- `customer_id uuid` (FK: `(customer_id, brand_id) -> public.customers(id, brand_id)`)
- `provider text` (default `stripe`)
- `provider_subscription_id text`
- `plan_name text`
- `status text`
- `started_at timestamptz`
- `current_period_start timestamptz`
- `current_period_end timestamptz`
- `canceled_at timestamptz`
- `metadata jsonb`
- `created_at timestamptz`
- `updated_at timestamptz`
- `created_by uuid -> auth.users(id)`
- `deleted_at timestamptz`

Indexes:

- `subscriptions_provider_id_idx` on `(provider, provider_subscription_id)` where `deleted_at is null`

### `public.payments`

- `id uuid`
- `brand_id uuid -> public.brands(id)`
- `customer_id uuid` (FK: `(customer_id, brand_id) -> public.customers(id, brand_id)`)
- `subscription_id uuid` (nullable; FK: `(subscription_id, brand_id) -> public.subscriptions(id, brand_id)`)
- `booking_id uuid` (nullable; FK: `(booking_id, brand_id) -> public.bookings(id, brand_id)`)
- `provider text` (default `stripe`)
- `provider_payment_id text`
- `amount_cents integer`
- `currency text` (default `USD`)
- `status text`
- `paid_at timestamptz`
- `metadata jsonb`
- `created_at timestamptz`
- `updated_at timestamptz`
- `created_by uuid -> auth.users(id)`
- `deleted_at timestamptz`

Indexes:

- `payments_provider_id_idx` on `(provider, provider_payment_id)` where `deleted_at is null`
- `payments_customer_paid_at_idx` on `(brand_id, customer_id, paid_at)` where `deleted_at is null`
- `payments_booking_lookup_idx` on `(brand_id, booking_id)` where `deleted_at is null and booking_id is not null`

### `public.instructor_scheduling_settings`

- `id uuid`
- `brand_id uuid -> public.brands(id)`
- `instructor_id uuid -> public.instructors(id)` (brand membership validated by trigger)
- `timezone text` (default `UTC`)
- `buffer_minutes integer` (default `15`)
- `advance_booking_days integer` (default `90`)
- `cancellation_cutoff_hours integer` (default `24`)
- `metadata jsonb`
- `created_at timestamptz`
- `updated_at timestamptz`
- `created_by uuid -> auth.users(id)`
- `deleted_at timestamptz`

Indexes:

- `instructor_scheduling_settings_brand_instructor_unique` on `(brand_id, instructor_id)` where `deleted_at is null`

### `public.instructor_weekly_availability`

- `id uuid`
- `brand_id uuid -> public.brands(id)`
- `instructor_id uuid -> public.instructors(id)` (brand membership validated by trigger)
- `day_of_week smallint` (`0..6`)
- `start_time time`
- `end_time time`
- `is_active boolean`
- `metadata jsonb`
- `created_at timestamptz`
- `updated_at timestamptz`
- `created_by uuid -> auth.users(id)`
- `deleted_at timestamptz`

Indexes:

- `instructor_weekly_availability_lookup_idx` on `(brand_id, instructor_id, day_of_week)` where `deleted_at is null and is_active = true`

### `public.instructor_date_overrides`

- `id uuid`
- `brand_id uuid -> public.brands(id)`
- `instructor_id uuid -> public.instructors(id)` (brand membership validated by trigger)
- `override_date date`
- `is_available boolean`
- `start_time time` (required when `is_available = true`)
- `end_time time` (required when `is_available = true`)
- `metadata jsonb`
- `created_at timestamptz`
- `updated_at timestamptz`
- `created_by uuid -> auth.users(id)`
- `deleted_at timestamptz`

Indexes:

- `instructor_date_overrides_unique` on `(brand_id, instructor_id, override_date)` where `deleted_at is null`
- `instructor_date_overrides_lookup_idx` on `(brand_id, instructor_id, override_date)` where `deleted_at is null`

### `public.content_access`

- `id uuid`
- `brand_id uuid -> public.brands(id)`
- `customer_id uuid` (FK: `(customer_id, brand_id) -> public.customers(id, brand_id)`)
- `course_id uuid` (nullable; FK: `(course_id, brand_id) -> public.courses(id, brand_id)`)
- `module_id uuid` (nullable; FK: `(module_id, brand_id) -> public.modules(id, brand_id)`)
- `lesson_id uuid` (nullable; FK: `(lesson_id, brand_id) -> public.lessons(id, brand_id)`)
- `granted_at timestamptz`
- `expires_at timestamptz`
- `metadata jsonb`
- `created_at timestamptz`
- `updated_at timestamptz`
- `created_by uuid -> auth.users(id)`
- `deleted_at timestamptz`

Constraint:

- Exactly one of `course_id|module_id|lesson_id` must be non-null.

Indexes:

- `content_access_customer_idx` on `(brand_id, customer_id)` where `deleted_at is null`

### `public.tags`

- `id uuid`
- `brand_id uuid -> public.brands(id)`
- `name text`
- `slug text` (lowercase slug format; unique per brand for non-deleted rows)
- `color text`
- `metadata jsonb`
- `created_at timestamptz`
- `updated_at timestamptz`
- `created_by uuid -> auth.users(id)`
- `deleted_at timestamptz`

Indexes:

- `tags_brand_slug_unique` on `(brand_id, slug)` where `deleted_at is null`

### `public.certificates`

- `id uuid`
- `brand_id uuid -> public.brands(id)`
- `customer_id uuid` (FK: `(customer_id, brand_id) -> public.customers(id, brand_id)`)
- `course_id uuid` (FK: `(course_id, brand_id) -> public.courses(id, brand_id)`)
- `issued_at timestamptz`
- `certificate_number text`
- `metadata jsonb`
- `created_at timestamptz`
- `updated_at timestamptz`
- `created_by uuid -> auth.users(id)`
- `deleted_at timestamptz`

Indexes:

- `certificates_customer_idx` on `(brand_id, customer_id, issued_at)` where `deleted_at is null`

## Auth Customer Sync Helpers (WO-2026-003)

Migration `supabase/migrations/20260218184500_auth_customer_sync.sql` adds:

- `customers_brand_auth_user_unique` partial unique index on `(brand_id, auth_user_id)` where active and linked.
- `public.sync_customer_for_user_id(...)` for internal auth/customer linking.
- `public.sync_customer_for_current_brand(...)` callable by authenticated users (uses `auth.uid()`).
- Trigger `on_auth_user_created_sync_customer` on `auth.users` to sync customer row on signup when `raw_user_meta_data.brand_slug` is provided.

These helpers attach anonymous IDs to `customers.metadata.anonymous_ids` and preserve RLS semantics by using `auth.uid()` at the entrypoint function.

## Row Level Security (RLS)

RLS is enabled on all tables listed above.

Policies implement:

- Customer self-access: authenticated users can select their own rows for customer-linked tables (e.g. `customers`, `enrollments`, `bookings`, `payments`, etc.)
- Brand admin access: authenticated users with a `brand_members` row for a brand and `role in ('owner','admin')` can read/write data within that brand.
- Lessons customer access: authenticated users can select lessons via enrollments or `content_access` grants at the lesson, module, or course scope.

## Seed Data

`supabase/seed.sql` seeds four brands:

- `cti` (CTI)
- `karen-miles` (Karen Miles)
- `gebben-miles` (Gebben Miles)
- `sporting-clays-academy` (Sporting Clays Academy)
