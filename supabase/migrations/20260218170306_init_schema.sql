-- PursuitsHQ CRM Brain + Platform Core
-- WO-2026-002: Supabase Database Schema & Multi-Tenant Foundation

-- Extensions
create schema if not exists extensions;
create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "vector" with schema extensions;

-- Ensure extensions schema is on the search_path so gen_random_uuid() resolves.
set search_path = public, extensions;

-- Trigger: keep updated_at current
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Core tables
create table public.brands (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  support_email text,
  logo_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  deleted_at timestamptz,
  constraint brands_slug_format check (slug = lower(slug) and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

-- Partial uniqueness to allow slug reuse after soft delete.
create unique index brands_slug_unique
on public.brands (slug)
where deleted_at is null;

-- Brand memberships (supports multi-tenant admin access)
create table public.brand_members (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id),
  user_id uuid not null references auth.users (id),
  role text not null default 'member',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  deleted_at timestamptz,
  constraint brand_members_role check (role in ('owner', 'admin', 'member'))
);

create unique index brand_members_brand_user_unique
on public.brand_members (brand_id, user_id)
where deleted_at is null;

-- Helper: brand admin check (used by RLS policies)
create or replace function public.is_brand_admin(p_brand_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.brand_members bm
    where bm.brand_id = p_brand_id
      and bm.user_id = auth.uid()
      and bm.role in ('owner', 'admin')
      and bm.deleted_at is null
  );
$$;

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id),
  auth_user_id uuid references auth.users (id) on delete set null,
  email text,
  first_name text,
  last_name text,
  phone text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  deleted_at timestamptz
);

create index customers_brand_email_lookup_idx
on public.customers (brand_id, lower(email))
where deleted_at is null;

create index customers_auth_user_idx
on public.customers (auth_user_id)
where deleted_at is null;

alter table public.customers
add constraint customers_id_brand_id_unique unique (id, brand_id);

create table public.instructors (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id),
  email text,
  first_name text,
  last_name text,
  bio text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  deleted_at timestamptz
);

create index instructors_brand_email_lookup_idx
on public.instructors (brand_id, lower(email))
where deleted_at is null;

alter table public.instructors
add constraint instructors_id_brand_id_unique unique (id, brand_id);

create table public.instructors_brands (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id),
  instructor_id uuid not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  deleted_at timestamptz,
  constraint instructors_brands_instructor_brand_fk foreign key (instructor_id, brand_id)
    references public.instructors (id, brand_id)
);

create unique index instructors_brands_unique
on public.instructors_brands (brand_id, instructor_id)
where deleted_at is null;

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id),
  title text not null,
  description text,
  level text,
  duration_minutes integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  deleted_at timestamptz
);

create index courses_brand_title_idx
on public.courses (brand_id, title)
where deleted_at is null;

alter table public.courses
add constraint courses_id_brand_id_unique unique (id, brand_id);

create table public.courses_brands (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id),
  course_id uuid not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  deleted_at timestamptz,
  constraint courses_brands_course_brand_fk foreign key (course_id, brand_id)
    references public.courses (id, brand_id)
);

create unique index courses_brands_unique
on public.courses_brands (brand_id, course_id)
where deleted_at is null;

create table public.modules (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id),
  course_id uuid not null,
  title text not null,
  position integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  deleted_at timestamptz,
  constraint modules_course_brand_fk foreign key (course_id, brand_id)
    references public.courses (id, brand_id)
);

create index modules_course_position_idx
on public.modules (course_id, position)
where deleted_at is null;

alter table public.modules
add constraint modules_id_brand_id_unique unique (id, brand_id);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id),
  module_id uuid not null,
  title text not null,
  content text,
  video_url text,
  duration_minutes integer,
  position integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  deleted_at timestamptz,
  constraint lessons_module_brand_fk foreign key (module_id, brand_id)
    references public.modules (id, brand_id)
);

create index lessons_module_position_idx
on public.lessons (module_id, position)
where deleted_at is null;

alter table public.lessons
add constraint lessons_id_brand_id_unique unique (id, brand_id);

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id),
  customer_id uuid not null,
  course_id uuid not null,
  status text not null default 'active',
  enrolled_at timestamptz not null default now(),
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  deleted_at timestamptz,
  constraint enrollments_customer_brand_fk foreign key (customer_id, brand_id)
    references public.customers (id, brand_id),
  constraint enrollments_course_brand_fk foreign key (course_id, brand_id)
    references public.courses (id, brand_id),
  constraint enrollments_status check (status in ('active', 'completed', 'cancelled'))
);

create index enrollments_customer_lookup_idx
on public.enrollments (brand_id, customer_id, status)
where deleted_at is null;

create index enrollments_course_lookup_idx
on public.enrollments (brand_id, course_id, status)
where deleted_at is null;

alter table public.enrollments
add constraint enrollments_id_brand_id_unique unique (id, brand_id);

create table public.progress (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id),
  enrollment_id uuid not null,
  lesson_id uuid not null,
  percent_complete numeric(5, 2) not null default 0,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  deleted_at timestamptz,
  constraint progress_enrollment_brand_fk foreign key (enrollment_id, brand_id)
    references public.enrollments (id, brand_id),
  constraint progress_lesson_brand_fk foreign key (lesson_id, brand_id)
    references public.lessons (id, brand_id),
  constraint progress_percent_range check (percent_complete >= 0 and percent_complete <= 100)
);

create unique index progress_unique_lesson_per_enrollment
on public.progress (enrollment_id, lesson_id)
where deleted_at is null;

create index progress_enrollment_idx
on public.progress (enrollment_id)
where deleted_at is null;

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id),
  customer_id uuid not null,
  instructor_id uuid,
  course_id uuid,
  status text not null default 'scheduled',
  start_at timestamptz not null,
  end_at timestamptz not null,
  location text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  deleted_at timestamptz,
  constraint bookings_customer_brand_fk foreign key (customer_id, brand_id)
    references public.customers (id, brand_id),
  constraint bookings_instructor_brand_fk foreign key (instructor_id, brand_id)
    references public.instructors (id, brand_id),
  constraint bookings_course_brand_fk foreign key (course_id, brand_id)
    references public.courses (id, brand_id),
  constraint bookings_status check (status in ('scheduled', 'completed', 'cancelled', 'no_show')),
  constraint bookings_time_range check (end_at > start_at)
);

create index bookings_instructor_schedule_idx
on public.bookings (brand_id, instructor_id, start_at)
where deleted_at is null;

create index bookings_customer_schedule_idx
on public.bookings (brand_id, customer_id, start_at)
where deleted_at is null;

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id),
  customer_id uuid not null,
  provider text not null default 'stripe',
  provider_subscription_id text,
  plan_name text,
  status text not null default 'active',
  started_at timestamptz not null default now(),
  current_period_start timestamptz,
  current_period_end timestamptz,
  canceled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  deleted_at timestamptz,
  constraint subscriptions_customer_brand_fk foreign key (customer_id, brand_id)
    references public.customers (id, brand_id),
  constraint subscriptions_status check (status in ('trialing', 'active', 'past_due', 'canceled', 'incomplete', 'incomplete_expired'))
);

create index subscriptions_provider_id_idx
on public.subscriptions (provider, provider_subscription_id)
where deleted_at is null;

alter table public.subscriptions
add constraint subscriptions_id_brand_id_unique unique (id, brand_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id),
  customer_id uuid not null,
  subscription_id uuid,
  provider text not null default 'stripe',
  provider_payment_id text,
  amount_cents integer not null,
  currency text not null default 'USD',
  status text not null default 'succeeded',
  paid_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  deleted_at timestamptz,
  constraint payments_customer_brand_fk foreign key (customer_id, brand_id)
    references public.customers (id, brand_id),
  constraint payments_subscription_brand_fk foreign key (subscription_id, brand_id)
    references public.subscriptions (id, brand_id),
  constraint payments_amount_nonnegative check (amount_cents >= 0),
  constraint payments_status check (status in ('requires_payment_method', 'requires_confirmation', 'requires_action', 'processing', 'succeeded', 'failed', 'canceled', 'refunded'))
);

create index payments_provider_id_idx
on public.payments (provider, provider_payment_id)
where deleted_at is null;

create index payments_customer_paid_at_idx
on public.payments (brand_id, customer_id, paid_at)
where deleted_at is null;

create table public.content_access (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id),
  customer_id uuid not null,
  course_id uuid,
  module_id uuid,
  lesson_id uuid,
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  deleted_at timestamptz,
  constraint content_access_customer_brand_fk foreign key (customer_id, brand_id)
    references public.customers (id, brand_id),
  constraint content_access_course_brand_fk foreign key (course_id, brand_id)
    references public.courses (id, brand_id),
  constraint content_access_module_brand_fk foreign key (module_id, brand_id)
    references public.modules (id, brand_id),
  constraint content_access_lesson_brand_fk foreign key (lesson_id, brand_id)
    references public.lessons (id, brand_id),
  constraint content_access_one_target check (
    (course_id is not null and module_id is null and lesson_id is null)
    or (course_id is null and module_id is not null and lesson_id is null)
    or (course_id is null and module_id is null and lesson_id is not null)
  )
);

create index content_access_customer_idx
on public.content_access (brand_id, customer_id)
where deleted_at is null;

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id),
  name text not null,
  slug text not null,
  color text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  deleted_at timestamptz,
  constraint tags_slug_format check (slug = lower(slug) and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create unique index tags_brand_slug_unique
on public.tags (brand_id, slug)
where deleted_at is null;

create table public.certificates (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id),
  customer_id uuid not null,
  course_id uuid not null,
  issued_at timestamptz not null default now(),
  certificate_number text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  deleted_at timestamptz,
  constraint certificates_customer_brand_fk foreign key (customer_id, brand_id)
    references public.customers (id, brand_id),
  constraint certificates_course_brand_fk foreign key (course_id, brand_id)
    references public.courses (id, brand_id)
);

create index certificates_customer_idx
on public.certificates (brand_id, customer_id, issued_at)
where deleted_at is null;

-- updated_at triggers
create trigger set_updated_at_brands
before update on public.brands
for each row execute function public.set_updated_at();

create trigger set_updated_at_brand_members
before update on public.brand_members
for each row execute function public.set_updated_at();

create trigger set_updated_at_customers
before update on public.customers
for each row execute function public.set_updated_at();

create trigger set_updated_at_instructors
before update on public.instructors
for each row execute function public.set_updated_at();

create trigger set_updated_at_instructors_brands
before update on public.instructors_brands
for each row execute function public.set_updated_at();

create trigger set_updated_at_courses
before update on public.courses
for each row execute function public.set_updated_at();

create trigger set_updated_at_courses_brands
before update on public.courses_brands
for each row execute function public.set_updated_at();

create trigger set_updated_at_modules
before update on public.modules
for each row execute function public.set_updated_at();

create trigger set_updated_at_lessons
before update on public.lessons
for each row execute function public.set_updated_at();

create trigger set_updated_at_enrollments
before update on public.enrollments
for each row execute function public.set_updated_at();

create trigger set_updated_at_progress
before update on public.progress
for each row execute function public.set_updated_at();

create trigger set_updated_at_bookings
before update on public.bookings
for each row execute function public.set_updated_at();

create trigger set_updated_at_subscriptions
before update on public.subscriptions
for each row execute function public.set_updated_at();

create trigger set_updated_at_payments
before update on public.payments
for each row execute function public.set_updated_at();

create trigger set_updated_at_content_access
before update on public.content_access
for each row execute function public.set_updated_at();

create trigger set_updated_at_tags
before update on public.tags
for each row execute function public.set_updated_at();

create trigger set_updated_at_certificates
before update on public.certificates
for each row execute function public.set_updated_at();

-- RLS
alter table public.brands enable row level security;
alter table public.brand_members enable row level security;
alter table public.customers enable row level security;
alter table public.instructors enable row level security;
alter table public.instructors_brands enable row level security;
alter table public.courses enable row level security;
alter table public.courses_brands enable row level security;
alter table public.modules enable row level security;
alter table public.lessons enable row level security;
alter table public.enrollments enable row level security;
alter table public.progress enable row level security;
alter table public.bookings enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.content_access enable row level security;
alter table public.tags enable row level security;
alter table public.certificates enable row level security;

-- Policies: brands
create policy brands_select_admin
on public.brands
for select
to authenticated
using (deleted_at is null and public.is_brand_admin(id));

create policy brands_select_customer
on public.brands
for select
to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.customers c
    where c.brand_id = brands.id
      and c.auth_user_id = auth.uid()
      and c.deleted_at is null
  )
);

create policy brands_update_admin
on public.brands
for update
to authenticated
using (deleted_at is null and public.is_brand_admin(id))
with check (public.is_brand_admin(id));

-- Policies: brand_members
create policy brand_members_select_self_or_admin
on public.brand_members
for select
to authenticated
using (
  deleted_at is null
  and (
    user_id = auth.uid()
    or public.is_brand_admin(brand_id)
  )
);

create policy brand_members_insert_admin
on public.brand_members
for insert
to authenticated
with check (deleted_at is null and public.is_brand_admin(brand_id));

create policy brand_members_update_admin
on public.brand_members
for update
to authenticated
using (deleted_at is null and public.is_brand_admin(brand_id))
with check (public.is_brand_admin(brand_id));

-- Policies: customers
create policy customers_select_self
on public.customers
for select
to authenticated
using (deleted_at is null and auth.uid() = auth_user_id);

create policy customers_select_admin
on public.customers
for select
to authenticated
using (deleted_at is null and public.is_brand_admin(brand_id));

create policy customers_insert_admin
on public.customers
for insert
to authenticated
with check (deleted_at is null and public.is_brand_admin(brand_id));

create policy customers_update_admin
on public.customers
for update
to authenticated
using (deleted_at is null and public.is_brand_admin(brand_id))
with check (public.is_brand_admin(brand_id));

-- Policies: instructors
create policy instructors_select_admin
on public.instructors
for select
to authenticated
using (
  deleted_at is null
  and public.is_brand_admin(brand_id)
);

create policy instructors_insert_admin
on public.instructors
for insert
to authenticated
with check (deleted_at is null and public.is_brand_admin(brand_id));

create policy instructors_update_admin
on public.instructors
for update
to authenticated
using (deleted_at is null and public.is_brand_admin(brand_id))
with check (public.is_brand_admin(brand_id));

-- Policies: instructors_brands
create policy instructors_brands_select_admin
on public.instructors_brands
for select
to authenticated
using (deleted_at is null and public.is_brand_admin(brand_id));

create policy instructors_brands_insert_admin
on public.instructors_brands
for insert
to authenticated
with check (deleted_at is null and public.is_brand_admin(brand_id));

create policy instructors_brands_update_admin
on public.instructors_brands
for update
to authenticated
using (deleted_at is null and public.is_brand_admin(brand_id))
with check (public.is_brand_admin(brand_id));

-- Policies: courses
create policy courses_select_admin_or_enrolled_customer
on public.courses
for select
to authenticated
using (
  deleted_at is null
  and (
    public.is_brand_admin(brand_id)
    or exists (
      select 1
      from public.enrollments e
      join public.customers c on c.id = e.customer_id
      where e.course_id = courses.id
        and e.deleted_at is null
        and c.deleted_at is null
        and c.auth_user_id = auth.uid()
    )
    or exists (
      select 1
      from public.content_access ca
      join public.customers c on c.id = ca.customer_id
      where ca.course_id = courses.id
        and ca.deleted_at is null
        and c.deleted_at is null
        and c.auth_user_id = auth.uid()
    )
  )
);

create policy courses_insert_admin
on public.courses
for insert
to authenticated
with check (deleted_at is null and public.is_brand_admin(brand_id));

create policy courses_update_admin
on public.courses
for update
to authenticated
using (deleted_at is null and public.is_brand_admin(brand_id))
with check (public.is_brand_admin(brand_id));

-- Policies: courses_brands
create policy courses_brands_select_admin
on public.courses_brands
for select
to authenticated
using (deleted_at is null and public.is_brand_admin(brand_id));

create policy courses_brands_insert_admin
on public.courses_brands
for insert
to authenticated
with check (deleted_at is null and public.is_brand_admin(brand_id));

create policy courses_brands_update_admin
on public.courses_brands
for update
to authenticated
using (deleted_at is null and public.is_brand_admin(brand_id))
with check (public.is_brand_admin(brand_id));

-- Policies: modules
create policy modules_select_admin_or_enrolled_customer
on public.modules
for select
to authenticated
using (
  deleted_at is null
  and (
    public.is_brand_admin(brand_id)
    or exists (
      select 1
      from public.enrollments e
      join public.customers c on c.id = e.customer_id
      where e.course_id = modules.course_id
        and e.deleted_at is null
        and c.deleted_at is null
        and c.auth_user_id = auth.uid()
    )
    or exists (
      select 1
      from public.content_access ca
      join public.customers c on c.id = ca.customer_id
      where ca.module_id = modules.id
        and ca.deleted_at is null
        and c.deleted_at is null
        and c.auth_user_id = auth.uid()
    )
    or exists (
      select 1
      from public.content_access ca
      join public.customers c on c.id = ca.customer_id
      where ca.course_id = modules.course_id
        and ca.deleted_at is null
        and c.deleted_at is null
        and c.auth_user_id = auth.uid()
    )
  )
);

create policy modules_insert_admin
on public.modules
for insert
to authenticated
with check (deleted_at is null and public.is_brand_admin(brand_id));

create policy modules_update_admin
on public.modules
for update
to authenticated
using (deleted_at is null and public.is_brand_admin(brand_id))
with check (public.is_brand_admin(brand_id));

-- Policies: lessons
create policy lessons_select_admin_or_enrolled_customer
on public.lessons
for select
to authenticated
using (
  deleted_at is null
  and (
    public.is_brand_admin(brand_id)
    or exists (
      select 1
      from public.enrollments e
      join public.customers c on c.id = e.customer_id
      join public.modules m on m.course_id = e.course_id
      where m.id = lessons.module_id
        and e.deleted_at is null
        and c.deleted_at is null
        and m.deleted_at is null
        and c.auth_user_id = auth.uid()
    )
	    or exists (
	      select 1
	      from public.content_access ca
	      join public.customers c on c.id = ca.customer_id
	      where ca.lesson_id = lessons.id
	        and ca.deleted_at is null
	        and c.deleted_at is null
	        and c.auth_user_id = auth.uid()
	    )
	    or exists (
	      select 1
	      from public.content_access ca
	      join public.customers c on c.id = ca.customer_id
	      join public.modules m on m.id = lessons.module_id
	      where ca.module_id = m.id
	        and ca.deleted_at is null
	        and c.deleted_at is null
	        and m.deleted_at is null
	        and c.auth_user_id = auth.uid()
	    )
	    or exists (
	      select 1
	      from public.content_access ca
	      join public.customers c on c.id = ca.customer_id
	      join public.modules m on m.id = lessons.module_id
	      where ca.course_id = m.course_id
	        and ca.deleted_at is null
	        and c.deleted_at is null
	        and m.deleted_at is null
	        and c.auth_user_id = auth.uid()
	    )
	  )
	);

create policy lessons_insert_admin
on public.lessons
for insert
to authenticated
with check (deleted_at is null and public.is_brand_admin(brand_id));

create policy lessons_update_admin
on public.lessons
for update
to authenticated
using (deleted_at is null and public.is_brand_admin(brand_id))
with check (public.is_brand_admin(brand_id));

-- Policies: enrollments
create policy enrollments_select_admin
on public.enrollments
for select
to authenticated
using (deleted_at is null and public.is_brand_admin(brand_id));

create policy enrollments_select_customer
on public.enrollments
for select
to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.customers c
    where c.id = enrollments.customer_id
      and c.auth_user_id = auth.uid()
      and c.deleted_at is null
  )
);

create policy enrollments_insert_admin
on public.enrollments
for insert
to authenticated
with check (deleted_at is null and public.is_brand_admin(brand_id));

create policy enrollments_update_admin
on public.enrollments
for update
to authenticated
using (deleted_at is null and public.is_brand_admin(brand_id))
with check (public.is_brand_admin(brand_id));

-- Policies: progress
create policy progress_select_admin
on public.progress
for select
to authenticated
using (deleted_at is null and public.is_brand_admin(brand_id));

create policy progress_select_customer
on public.progress
for select
to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.enrollments e
    join public.customers c on c.id = e.customer_id
    where e.id = progress.enrollment_id
      and e.deleted_at is null
      and c.deleted_at is null
      and c.auth_user_id = auth.uid()
  )
);

create policy progress_insert_customer
on public.progress
for insert
to authenticated
with check (
  deleted_at is null
  and exists (
    select 1
    from public.enrollments e
    join public.customers c on c.id = e.customer_id
    join public.lessons l on l.id = progress.lesson_id
    join public.modules m on m.id = l.module_id
    where e.id = progress.enrollment_id
      and progress.brand_id = e.brand_id
      and m.course_id = e.course_id
      and e.deleted_at is null
      and c.deleted_at is null
      and l.deleted_at is null
      and m.deleted_at is null
      and c.auth_user_id = auth.uid()
  )
);

create policy progress_update_customer
on public.progress
for update
to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.enrollments e
    join public.customers c on c.id = e.customer_id
    join public.lessons l on l.id = progress.lesson_id
    join public.modules m on m.id = l.module_id
    where e.id = progress.enrollment_id
      and progress.brand_id = e.brand_id
      and m.course_id = e.course_id
      and e.deleted_at is null
      and c.deleted_at is null
      and l.deleted_at is null
      and m.deleted_at is null
      and c.auth_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.enrollments e
    join public.customers c on c.id = e.customer_id
    join public.lessons l on l.id = progress.lesson_id
    join public.modules m on m.id = l.module_id
    where e.id = progress.enrollment_id
      and progress.brand_id = e.brand_id
      and m.course_id = e.course_id
      and e.deleted_at is null
      and c.deleted_at is null
      and l.deleted_at is null
      and m.deleted_at is null
      and c.auth_user_id = auth.uid()
  )
);

create policy progress_insert_admin
on public.progress
for insert
to authenticated
with check (deleted_at is null and public.is_brand_admin(brand_id));

create policy progress_update_admin
on public.progress
for update
to authenticated
using (deleted_at is null and public.is_brand_admin(brand_id))
with check (public.is_brand_admin(brand_id));

-- Policies: bookings
create policy bookings_select_admin
on public.bookings
for select
to authenticated
using (deleted_at is null and public.is_brand_admin(brand_id));

create policy bookings_select_customer
on public.bookings
for select
to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.customers c
    where c.id = bookings.customer_id
      and c.auth_user_id = auth.uid()
      and c.deleted_at is null
  )
);

create policy bookings_insert_customer
on public.bookings
for insert
to authenticated
with check (
  deleted_at is null
  and exists (
    select 1
    from public.customers c
    where c.id = bookings.customer_id
      and c.brand_id = bookings.brand_id
      and c.auth_user_id = auth.uid()
      and c.deleted_at is null
  )
);

create policy bookings_update_customer
on public.bookings
for update
to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.customers c
    where c.id = bookings.customer_id
      and c.auth_user_id = auth.uid()
      and c.deleted_at is null
  )
)
with check (
  exists (
    select 1
    from public.customers c
    where c.id = bookings.customer_id
      and c.auth_user_id = auth.uid()
      and c.deleted_at is null
  )
);

create policy bookings_insert_admin
on public.bookings
for insert
to authenticated
with check (deleted_at is null and public.is_brand_admin(brand_id));

create policy bookings_update_admin
on public.bookings
for update
to authenticated
using (deleted_at is null and public.is_brand_admin(brand_id))
with check (public.is_brand_admin(brand_id));

-- Policies: subscriptions
create policy subscriptions_select_admin
on public.subscriptions
for select
to authenticated
using (deleted_at is null and public.is_brand_admin(brand_id));

create policy subscriptions_select_customer
on public.subscriptions
for select
to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.customers c
    where c.id = subscriptions.customer_id
      and c.auth_user_id = auth.uid()
      and c.deleted_at is null
  )
);

create policy subscriptions_insert_admin
on public.subscriptions
for insert
to authenticated
with check (deleted_at is null and public.is_brand_admin(brand_id));

create policy subscriptions_update_admin
on public.subscriptions
for update
to authenticated
using (deleted_at is null and public.is_brand_admin(brand_id))
with check (public.is_brand_admin(brand_id));

-- Policies: payments
create policy payments_select_admin
on public.payments
for select
to authenticated
using (deleted_at is null and public.is_brand_admin(brand_id));

create policy payments_select_customer
on public.payments
for select
to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.customers c
    where c.id = payments.customer_id
      and c.auth_user_id = auth.uid()
      and c.deleted_at is null
  )
);

create policy payments_insert_admin
on public.payments
for insert
to authenticated
with check (deleted_at is null and public.is_brand_admin(brand_id));

create policy payments_update_admin
on public.payments
for update
to authenticated
using (deleted_at is null and public.is_brand_admin(brand_id))
with check (public.is_brand_admin(brand_id));

-- Policies: content_access
create policy content_access_select_admin
on public.content_access
for select
to authenticated
using (deleted_at is null and public.is_brand_admin(brand_id));

create policy content_access_select_customer
on public.content_access
for select
to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.customers c
    where c.id = content_access.customer_id
      and c.auth_user_id = auth.uid()
      and c.deleted_at is null
  )
);

create policy content_access_insert_admin
on public.content_access
for insert
to authenticated
with check (deleted_at is null and public.is_brand_admin(brand_id));

create policy content_access_update_admin
on public.content_access
for update
to authenticated
using (deleted_at is null and public.is_brand_admin(brand_id))
with check (public.is_brand_admin(brand_id));

-- Policies: tags
create policy tags_select_admin
on public.tags
for select
to authenticated
using (deleted_at is null and public.is_brand_admin(brand_id));

create policy tags_select_customer
on public.tags
for select
to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.customers c
    where c.brand_id = tags.brand_id
      and c.auth_user_id = auth.uid()
      and c.deleted_at is null
  )
);

create policy tags_insert_admin
on public.tags
for insert
to authenticated
with check (deleted_at is null and public.is_brand_admin(brand_id));

create policy tags_update_admin
on public.tags
for update
to authenticated
using (deleted_at is null and public.is_brand_admin(brand_id))
with check (public.is_brand_admin(brand_id));

-- Policies: certificates
create policy certificates_select_admin
on public.certificates
for select
to authenticated
using (deleted_at is null and public.is_brand_admin(brand_id));

create policy certificates_select_customer
on public.certificates
for select
to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.customers c
    where c.id = certificates.customer_id
      and c.auth_user_id = auth.uid()
      and c.deleted_at is null
  )
);

create policy certificates_insert_admin
on public.certificates
for insert
to authenticated
with check (deleted_at is null and public.is_brand_admin(brand_id));

create policy certificates_update_admin
on public.certificates
for update
to authenticated
using (deleted_at is null and public.is_brand_admin(brand_id))
with check (public.is_brand_admin(brand_id));

-- Grants: allow API access (RLS still applies)
grant usage on schema public to authenticated;

grant select, insert, update on public.brands to authenticated;
grant select, insert, update on public.brand_members to authenticated;
grant select, insert, update on public.customers to authenticated;
grant select, insert, update on public.instructors to authenticated;
grant select, insert, update on public.instructors_brands to authenticated;
grant select, insert, update on public.courses to authenticated;
grant select, insert, update on public.courses_brands to authenticated;
grant select, insert, update on public.modules to authenticated;
grant select, insert, update on public.lessons to authenticated;
grant select, insert, update on public.enrollments to authenticated;
grant select, insert, update on public.progress to authenticated;
grant select, insert, update on public.bookings to authenticated;
grant select, insert, update on public.subscriptions to authenticated;
grant select, insert, update on public.payments to authenticated;
grant select, insert, update on public.content_access to authenticated;
grant select, insert, update on public.tags to authenticated;
grant select, insert, update on public.certificates to authenticated;
