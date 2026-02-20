-- WO-2026-005: Booking System - Custom Calendar & Scheduling

set search_path = public, extensions;

alter table public.instructors
add column if not exists auth_user_id uuid references auth.users (id) on delete set null;

create index if not exists instructors_auth_user_idx
on public.instructors (auth_user_id)
where deleted_at is null;

-- Allow instructors to work across brands through the join table.
alter table public.instructors_brands
  drop constraint if exists instructors_brands_instructor_brand_fk;

alter table public.instructors_brands
  add constraint instructors_brands_instructor_fk foreign key (instructor_id)
    references public.instructors (id);

-- Booking lifecycle evolution.
update public.bookings
set status = 'confirmed'
where status = 'scheduled';

alter table public.bookings
  drop constraint if exists bookings_instructor_brand_fk;

alter table public.bookings
  add constraint bookings_instructor_fk foreign key (instructor_id)
    references public.instructors (id);

alter table public.bookings
  drop constraint if exists bookings_status;

alter table public.bookings
  add constraint bookings_status check (status in ('pending', 'confirmed', 'completed', 'cancelled', 'no_show'));

alter table public.bookings
  alter column status set default 'pending';

alter table public.bookings
  add column if not exists student_timezone text not null default 'UTC',
  add column if not exists instructor_timezone text not null default 'UTC',
  add column if not exists cancellation_reason text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists confirmed_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists no_show_at timestamptz,
  add column if not exists payment_status text not null default 'pending',
  add column if not exists payment_reference text,
  add column if not exists reminder_24h_sent_at timestamptz,
  add column if not exists instructor_notes text;

alter table public.bookings
  drop constraint if exists bookings_payment_status;

alter table public.bookings
  add constraint bookings_payment_status check (payment_status in ('pending', 'paid', 'failed', 'refunded', 'waived'));

create index if not exists bookings_status_start_idx
on public.bookings (brand_id, status, start_at)
where deleted_at is null;

create or replace function public.instructor_works_for_brand(p_instructor_id uuid, p_brand_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.instructors i
    where i.id = p_instructor_id
      and i.deleted_at is null
      and (
        i.brand_id = p_brand_id
        or exists (
          select 1
          from public.instructors_brands ib
          where ib.instructor_id = i.id
            and ib.brand_id = p_brand_id
            and ib.deleted_at is null
        )
      )
  );
$$;

create or replace function public.enforce_instructor_brand_scope()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.instructor_id is null then
    return new;
  end if;

  if not public.instructor_works_for_brand(new.instructor_id, new.brand_id) then
    raise exception 'Instructor % is not linked to brand %', new.instructor_id, new.brand_id;
  end if;

  return new;
end;
$$;

create table if not exists public.instructor_scheduling_settings (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id),
  instructor_id uuid not null references public.instructors (id),
  timezone text not null default 'UTC',
  session_duration_minutes integer not null default 60,
  buffer_minutes integer not null default 15,
  advance_booking_days integer not null default 90,
  cancellation_cutoff_hours integer not null default 24,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  deleted_at timestamptz,
  constraint instructor_scheduling_settings_duration check (session_duration_minutes > 0 and session_duration_minutes <= 480),
  constraint instructor_scheduling_settings_buffer check (buffer_minutes >= 0 and buffer_minutes <= 180),
  constraint instructor_scheduling_settings_advance check (advance_booking_days >= 1 and advance_booking_days <= 365),
  constraint instructor_scheduling_settings_cutoff check (cancellation_cutoff_hours >= 0 and cancellation_cutoff_hours <= 720)
);

create unique index if not exists instructor_scheduling_settings_unique
on public.instructor_scheduling_settings (brand_id, instructor_id)
where deleted_at is null;

create table if not exists public.instructor_availability_rules (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id),
  instructor_id uuid not null references public.instructors (id),
  weekday integer not null,
  start_time time not null,
  end_time time not null,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  deleted_at timestamptz,
  constraint instructor_availability_rules_weekday check (weekday >= 0 and weekday <= 6),
  constraint instructor_availability_rules_time check (end_time > start_time)
);

create index if not exists instructor_availability_rules_lookup_idx
on public.instructor_availability_rules (brand_id, instructor_id, weekday)
where deleted_at is null;

create table if not exists public.instructor_availability_overrides (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id),
  instructor_id uuid not null references public.instructors (id),
  override_date date not null,
  is_available boolean not null default false,
  start_time time,
  end_time time,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  deleted_at timestamptz,
  constraint instructor_availability_overrides_shape check (
    (
      is_available = false
      and start_time is null
      and end_time is null
    )
    or (
      is_available = true
      and start_time is not null
      and end_time is not null
      and end_time > start_time
    )
  )
);

create index if not exists instructor_availability_overrides_lookup_idx
on public.instructor_availability_overrides (brand_id, instructor_id, override_date)
where deleted_at is null;

create table if not exists public.booking_notifications (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id),
  brand_id uuid not null references public.brands (id),
  channel text not null,
  template text not null,
  provider text not null,
  recipient text not null,
  status text not null default 'pending',
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  deleted_at timestamptz,
  constraint booking_notifications_channel check (channel in ('sms', 'email')),
  constraint booking_notifications_template check (template in ('booking_created', 'booking_reminder_24h')),
  constraint booking_notifications_provider check (provider in ('twilio', 'resend', 'internal')),
  constraint booking_notifications_status check (status in ('pending', 'sent', 'failed', 'skipped'))
);

create index if not exists booking_notifications_booking_idx
on public.booking_notifications (brand_id, booking_id, template, channel)
where deleted_at is null;

create index if not exists booking_notifications_status_idx
on public.booking_notifications (status, created_at)
where deleted_at is null;

-- Keep instructor brand links valid for booking/scheduling records.
drop trigger if exists enforce_booking_instructor_brand_scope on public.bookings;
create trigger enforce_booking_instructor_brand_scope
before insert or update of instructor_id, brand_id on public.bookings
for each row execute function public.enforce_instructor_brand_scope();

drop trigger if exists enforce_settings_instructor_brand_scope on public.instructor_scheduling_settings;
create trigger enforce_settings_instructor_brand_scope
before insert or update of instructor_id, brand_id on public.instructor_scheduling_settings
for each row execute function public.enforce_instructor_brand_scope();

drop trigger if exists enforce_rules_instructor_brand_scope on public.instructor_availability_rules;
create trigger enforce_rules_instructor_brand_scope
before insert or update of instructor_id, brand_id on public.instructor_availability_rules
for each row execute function public.enforce_instructor_brand_scope();

drop trigger if exists enforce_overrides_instructor_brand_scope on public.instructor_availability_overrides;
create trigger enforce_overrides_instructor_brand_scope
before insert or update of instructor_id, brand_id on public.instructor_availability_overrides
for each row execute function public.enforce_instructor_brand_scope();

-- updated_at triggers
drop trigger if exists set_updated_at_instructor_scheduling_settings on public.instructor_scheduling_settings;
create trigger set_updated_at_instructor_scheduling_settings
before update on public.instructor_scheduling_settings
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_instructor_availability_rules on public.instructor_availability_rules;
create trigger set_updated_at_instructor_availability_rules
before update on public.instructor_availability_rules
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_instructor_availability_overrides on public.instructor_availability_overrides;
create trigger set_updated_at_instructor_availability_overrides
before update on public.instructor_availability_overrides
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_booking_notifications on public.booking_notifications;
create trigger set_updated_at_booking_notifications
before update on public.booking_notifications
for each row execute function public.set_updated_at();

-- RLS
alter table public.instructor_scheduling_settings enable row level security;
alter table public.instructor_availability_rules enable row level security;
alter table public.instructor_availability_overrides enable row level security;
alter table public.booking_notifications enable row level security;

-- Instructor visibility for bookings.
drop policy if exists bookings_select_instructor on public.bookings;
create policy bookings_select_instructor
on public.bookings
for select
to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.instructors i
    where i.id = bookings.instructor_id
      and i.auth_user_id = auth.uid()
      and i.deleted_at is null
  )
);

drop policy if exists bookings_update_instructor on public.bookings;
create policy bookings_update_instructor
on public.bookings
for update
to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.instructors i
    where i.id = bookings.instructor_id
      and i.auth_user_id = auth.uid()
      and i.deleted_at is null
  )
)
with check (
  exists (
    select 1
    from public.instructors i
    where i.id = bookings.instructor_id
      and i.auth_user_id = auth.uid()
      and i.deleted_at is null
  )
);

-- Policies: instructor_scheduling_settings
drop policy if exists instructor_scheduling_settings_select_admin on public.instructor_scheduling_settings;
create policy instructor_scheduling_settings_select_admin
on public.instructor_scheduling_settings
for select
to authenticated
using (deleted_at is null and public.is_brand_admin(brand_id));

drop policy if exists instructor_scheduling_settings_insert_admin on public.instructor_scheduling_settings;
create policy instructor_scheduling_settings_insert_admin
on public.instructor_scheduling_settings
for insert
to authenticated
with check (deleted_at is null and public.is_brand_admin(brand_id));

drop policy if exists instructor_scheduling_settings_update_admin on public.instructor_scheduling_settings;
create policy instructor_scheduling_settings_update_admin
on public.instructor_scheduling_settings
for update
to authenticated
using (deleted_at is null and public.is_brand_admin(brand_id))
with check (public.is_brand_admin(brand_id));

drop policy if exists instructor_scheduling_settings_select_instructor on public.instructor_scheduling_settings;
create policy instructor_scheduling_settings_select_instructor
on public.instructor_scheduling_settings
for select
to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.instructors i
    where i.id = instructor_scheduling_settings.instructor_id
      and i.auth_user_id = auth.uid()
      and i.deleted_at is null
  )
);

drop policy if exists instructor_scheduling_settings_insert_instructor on public.instructor_scheduling_settings;
create policy instructor_scheduling_settings_insert_instructor
on public.instructor_scheduling_settings
for insert
to authenticated
with check (
  deleted_at is null
  and exists (
    select 1
    from public.instructors i
    where i.id = instructor_scheduling_settings.instructor_id
      and i.auth_user_id = auth.uid()
      and i.deleted_at is null
  )
);

drop policy if exists instructor_scheduling_settings_update_instructor on public.instructor_scheduling_settings;
create policy instructor_scheduling_settings_update_instructor
on public.instructor_scheduling_settings
for update
to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.instructors i
    where i.id = instructor_scheduling_settings.instructor_id
      and i.auth_user_id = auth.uid()
      and i.deleted_at is null
  )
)
with check (
  exists (
    select 1
    from public.instructors i
    where i.id = instructor_scheduling_settings.instructor_id
      and i.auth_user_id = auth.uid()
      and i.deleted_at is null
  )
);

-- Policies: instructor_availability_rules
drop policy if exists instructor_availability_rules_select_admin on public.instructor_availability_rules;
create policy instructor_availability_rules_select_admin
on public.instructor_availability_rules
for select
to authenticated
using (deleted_at is null and public.is_brand_admin(brand_id));

drop policy if exists instructor_availability_rules_insert_admin on public.instructor_availability_rules;
create policy instructor_availability_rules_insert_admin
on public.instructor_availability_rules
for insert
to authenticated
with check (deleted_at is null and public.is_brand_admin(brand_id));

drop policy if exists instructor_availability_rules_update_admin on public.instructor_availability_rules;
create policy instructor_availability_rules_update_admin
on public.instructor_availability_rules
for update
to authenticated
using (deleted_at is null and public.is_brand_admin(brand_id))
with check (public.is_brand_admin(brand_id));

drop policy if exists instructor_availability_rules_select_instructor on public.instructor_availability_rules;
create policy instructor_availability_rules_select_instructor
on public.instructor_availability_rules
for select
to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.instructors i
    where i.id = instructor_availability_rules.instructor_id
      and i.auth_user_id = auth.uid()
      and i.deleted_at is null
  )
);

drop policy if exists instructor_availability_rules_insert_instructor on public.instructor_availability_rules;
create policy instructor_availability_rules_insert_instructor
on public.instructor_availability_rules
for insert
to authenticated
with check (
  deleted_at is null
  and exists (
    select 1
    from public.instructors i
    where i.id = instructor_availability_rules.instructor_id
      and i.auth_user_id = auth.uid()
      and i.deleted_at is null
  )
);

drop policy if exists instructor_availability_rules_update_instructor on public.instructor_availability_rules;
create policy instructor_availability_rules_update_instructor
on public.instructor_availability_rules
for update
to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.instructors i
    where i.id = instructor_availability_rules.instructor_id
      and i.auth_user_id = auth.uid()
      and i.deleted_at is null
  )
)
with check (
  exists (
    select 1
    from public.instructors i
    where i.id = instructor_availability_rules.instructor_id
      and i.auth_user_id = auth.uid()
      and i.deleted_at is null
  )
);

-- Policies: instructor_availability_overrides
drop policy if exists instructor_availability_overrides_select_admin on public.instructor_availability_overrides;
create policy instructor_availability_overrides_select_admin
on public.instructor_availability_overrides
for select
to authenticated
using (deleted_at is null and public.is_brand_admin(brand_id));

drop policy if exists instructor_availability_overrides_insert_admin on public.instructor_availability_overrides;
create policy instructor_availability_overrides_insert_admin
on public.instructor_availability_overrides
for insert
to authenticated
with check (deleted_at is null and public.is_brand_admin(brand_id));

drop policy if exists instructor_availability_overrides_update_admin on public.instructor_availability_overrides;
create policy instructor_availability_overrides_update_admin
on public.instructor_availability_overrides
for update
to authenticated
using (deleted_at is null and public.is_brand_admin(brand_id))
with check (public.is_brand_admin(brand_id));

drop policy if exists instructor_availability_overrides_select_instructor on public.instructor_availability_overrides;
create policy instructor_availability_overrides_select_instructor
on public.instructor_availability_overrides
for select
to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.instructors i
    where i.id = instructor_availability_overrides.instructor_id
      and i.auth_user_id = auth.uid()
      and i.deleted_at is null
  )
);

drop policy if exists instructor_availability_overrides_insert_instructor on public.instructor_availability_overrides;
create policy instructor_availability_overrides_insert_instructor
on public.instructor_availability_overrides
for insert
to authenticated
with check (
  deleted_at is null
  and exists (
    select 1
    from public.instructors i
    where i.id = instructor_availability_overrides.instructor_id
      and i.auth_user_id = auth.uid()
      and i.deleted_at is null
  )
);

drop policy if exists instructor_availability_overrides_update_instructor on public.instructor_availability_overrides;
create policy instructor_availability_overrides_update_instructor
on public.instructor_availability_overrides
for update
to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.instructors i
    where i.id = instructor_availability_overrides.instructor_id
      and i.auth_user_id = auth.uid()
      and i.deleted_at is null
  )
)
with check (
  exists (
    select 1
    from public.instructors i
    where i.id = instructor_availability_overrides.instructor_id
      and i.auth_user_id = auth.uid()
      and i.deleted_at is null
  )
);

-- Policies: booking_notifications
drop policy if exists booking_notifications_select_admin on public.booking_notifications;
create policy booking_notifications_select_admin
on public.booking_notifications
for select
to authenticated
using (deleted_at is null and public.is_brand_admin(brand_id));

drop policy if exists booking_notifications_insert_admin on public.booking_notifications;
create policy booking_notifications_insert_admin
on public.booking_notifications
for insert
to authenticated
with check (deleted_at is null and public.is_brand_admin(brand_id));

drop policy if exists booking_notifications_update_admin on public.booking_notifications;
create policy booking_notifications_update_admin
on public.booking_notifications
for update
to authenticated
using (deleted_at is null and public.is_brand_admin(brand_id))
with check (public.is_brand_admin(brand_id));

grant execute on function public.instructor_works_for_brand(uuid, uuid) to authenticated;

grant select, insert, update on public.instructor_scheduling_settings to authenticated;
grant select, insert, update on public.instructor_availability_rules to authenticated;
grant select, insert, update on public.instructor_availability_overrides to authenticated;
grant select, insert, update on public.booking_notifications to authenticated;
