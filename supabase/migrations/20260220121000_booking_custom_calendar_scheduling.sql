-- WO-2026-005: Booking System - Custom Calendar & Scheduling

set search_path = public, extensions;

create or replace function public.is_brand_customer(p_brand_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.customers c
    where c.brand_id = p_brand_id
      and c.auth_user_id = auth.uid()
      and c.deleted_at is null
  );
$$;

create or replace function public.instructor_in_brand(p_instructor_id uuid, p_brand_id uuid)
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
          where ib.instructor_id = p_instructor_id
            and ib.brand_id = p_brand_id
            and ib.deleted_at is null
        )
      )
  );
$$;

create or replace function public.is_instructor_self(p_instructor_id uuid, p_brand_id uuid)
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
      and public.instructor_in_brand(i.id, p_brand_id)
      and lower(coalesce(i.email, '')) = lower(coalesce((auth.jwt() ->> 'email')::text, ''))
  );
$$;

create or replace function public.enforce_instructor_brand_membership()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.instructor_id is null then
    return new;
  end if;

  if not public.instructor_in_brand(new.instructor_id, new.brand_id) then
    raise exception 'Instructor % is not assigned to brand %', new.instructor_id, new.brand_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

alter table public.instructors_brands
drop constraint if exists instructors_brands_instructor_brand_fk;

alter table public.instructors_brands
add constraint instructors_brands_instructor_fk
foreign key (instructor_id) references public.instructors (id);

insert into public.instructors_brands (brand_id, instructor_id, metadata)
select i.brand_id, i.id, '{}'::jsonb
from public.instructors i
where i.deleted_at is null
  and not exists (
    select 1
    from public.instructors_brands ib
    where ib.brand_id = i.brand_id
      and ib.instructor_id = i.id
      and ib.deleted_at is null
  );

alter table public.bookings
drop constraint if exists bookings_instructor_brand_fk;

alter table public.bookings
add constraint bookings_instructor_fk
foreign key (instructor_id) references public.instructors (id);

alter table public.bookings
alter column status set default 'pending';

update public.bookings
set status = 'confirmed'
where status = 'scheduled';

alter table public.bookings
drop constraint if exists bookings_status;

alter table public.bookings
add constraint bookings_status
check (status in ('pending', 'confirmed', 'completed', 'cancelled', 'no_show'));

alter table public.bookings
add column if not exists student_timezone text not null default 'UTC',
add column if not exists instructor_timezone text not null default 'UTC',
add column if not exists payment_status text not null default 'unpaid',
add column if not exists payment_reference text,
add column if not exists confirmed_at timestamptz,
add column if not exists cancelled_at timestamptz,
add column if not exists completed_at timestamptz,
add column if not exists reminder_sent_at timestamptz,
add column if not exists instructor_notes text;

alter table public.bookings
drop constraint if exists bookings_payment_status;

alter table public.bookings
add constraint bookings_payment_status
check (payment_status in ('unpaid', 'paid', 'failed', 'refunded'));

alter table public.bookings
add constraint bookings_id_brand_id_unique unique (id, brand_id);

create index if not exists bookings_upcoming_instructor_idx
on public.bookings (brand_id, instructor_id, start_at)
where deleted_at is null and status in ('pending', 'confirmed');

create index if not exists bookings_confirmed_reminder_idx
on public.bookings (brand_id, start_at, reminder_sent_at)
where deleted_at is null and status = 'confirmed';

alter table public.payments
add column if not exists booking_id uuid;

alter table public.payments
drop constraint if exists payments_booking_brand_fk;

alter table public.payments
add constraint payments_booking_brand_fk
foreign key (booking_id, brand_id)
references public.bookings (id, brand_id);

create index if not exists payments_booking_lookup_idx
on public.payments (brand_id, booking_id)
where deleted_at is null and booking_id is not null;

create table public.instructor_scheduling_settings (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id),
  instructor_id uuid not null references public.instructors (id),
  timezone text not null default 'UTC',
  buffer_minutes integer not null default 15,
  advance_booking_days integer not null default 90,
  cancellation_cutoff_hours integer not null default 24,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  deleted_at timestamptz,
  constraint instructor_scheduling_settings_buffer_minutes check (buffer_minutes >= 0 and buffer_minutes <= 120),
  constraint instructor_scheduling_settings_advance_days check (advance_booking_days >= 1 and advance_booking_days <= 365),
  constraint instructor_scheduling_settings_cancel_cutoff check (cancellation_cutoff_hours >= 0 and cancellation_cutoff_hours <= 720)
);

create unique index instructor_scheduling_settings_brand_instructor_unique
on public.instructor_scheduling_settings (brand_id, instructor_id)
where deleted_at is null;

create table public.instructor_weekly_availability (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id),
  instructor_id uuid not null references public.instructors (id),
  day_of_week smallint not null,
  start_time time not null,
  end_time time not null,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  deleted_at timestamptz,
  constraint instructor_weekly_availability_day check (day_of_week >= 0 and day_of_week <= 6),
  constraint instructor_weekly_availability_range check (end_time > start_time)
);

create index instructor_weekly_availability_lookup_idx
on public.instructor_weekly_availability (brand_id, instructor_id, day_of_week)
where deleted_at is null and is_active = true;

create table public.instructor_date_overrides (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id),
  instructor_id uuid not null references public.instructors (id),
  override_date date not null,
  is_available boolean not null default false,
  start_time time,
  end_time time,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  deleted_at timestamptz,
  constraint instructor_date_overrides_window
    check (
      (is_available = false and start_time is null and end_time is null)
      or (is_available = true and start_time is not null and end_time is not null and end_time > start_time)
    )
);

create unique index instructor_date_overrides_unique
on public.instructor_date_overrides (brand_id, instructor_id, override_date)
where deleted_at is null;

create index instructor_date_overrides_lookup_idx
on public.instructor_date_overrides (brand_id, instructor_id, override_date)
where deleted_at is null;

create trigger set_updated_at_instructor_scheduling_settings
before update on public.instructor_scheduling_settings
for each row execute procedure public.set_updated_at();

create trigger set_updated_at_instructor_weekly_availability
before update on public.instructor_weekly_availability
for each row execute procedure public.set_updated_at();

create trigger set_updated_at_instructor_date_overrides
before update on public.instructor_date_overrides
for each row execute procedure public.set_updated_at();

create trigger enforce_bookings_instructor_brand_membership
before insert or update of instructor_id, brand_id on public.bookings
for each row execute procedure public.enforce_instructor_brand_membership();

create trigger enforce_settings_instructor_brand_membership
before insert or update of instructor_id, brand_id on public.instructor_scheduling_settings
for each row execute procedure public.enforce_instructor_brand_membership();

create trigger enforce_weekly_availability_instructor_brand_membership
before insert or update of instructor_id, brand_id on public.instructor_weekly_availability
for each row execute procedure public.enforce_instructor_brand_membership();

create trigger enforce_date_overrides_instructor_brand_membership
before insert or update of instructor_id, brand_id on public.instructor_date_overrides
for each row execute procedure public.enforce_instructor_brand_membership();

create or replace function public.enforce_booking_lifecycle()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_cutoff_hours integer := 24;
begin
  if tg_op = 'INSERT' then
    if new.status = 'confirmed' and new.payment_status <> 'paid' then
      raise exception 'Confirmed bookings require payment_status=paid'
        using errcode = '23514';
    end if;
    if new.status = 'confirmed' and new.confirmed_at is null then
      new.confirmed_at = now();
    end if;
    if new.status = 'completed' and new.completed_at is null then
      new.completed_at = now();
    end if;
    if new.status = 'cancelled' and new.cancelled_at is null then
      new.cancelled_at = now();
    end if;
    return new;
  end if;

  if new.status <> old.status then
    if not (
      (old.status = 'pending' and new.status in ('confirmed', 'cancelled'))
      or (old.status = 'confirmed' and new.status in ('completed', 'cancelled', 'no_show'))
    ) then
      raise exception 'Invalid booking status transition % -> %', old.status, new.status
        using errcode = '23514';
    end if;

    if new.status = 'cancelled' then
      select coalesce(s.cancellation_cutoff_hours, 24)
      into v_cutoff_hours
      from public.instructor_scheduling_settings s
      where s.brand_id = old.brand_id
        and s.instructor_id = old.instructor_id
        and s.deleted_at is null
      limit 1;

      if old.start_at - now() < make_interval(hours => v_cutoff_hours) then
        raise exception 'Cancellation cutoff passed for this booking'
          using errcode = '23514';
      end if;

      if new.cancelled_at is null then
        new.cancelled_at = now();
      end if;
    end if;

    if new.status = 'confirmed' then
      if new.payment_status <> 'paid' then
        raise exception 'Confirmed bookings require payment_status=paid'
          using errcode = '23514';
      end if;
      if new.confirmed_at is null then
        new.confirmed_at = now();
      end if;
    end if;

    if new.status = 'completed' and new.completed_at is null then
      new.completed_at = now();
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_booking_lifecycle_trigger on public.bookings;

create trigger enforce_booking_lifecycle_trigger
before insert or update of status, payment_status, start_at, instructor_id, brand_id on public.bookings
for each row execute procedure public.enforce_booking_lifecycle();

create or replace function public.get_instructor_available_slots(
  p_brand_id uuid,
  p_instructor_id uuid,
  p_start_date date default current_date,
  p_days integer default 14,
  p_session_minutes integer default 60
)
returns table (
  start_at timestamptz,
  end_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with authorization as (
    select (
      public.is_brand_admin(p_brand_id)
      or public.is_brand_customer(p_brand_id)
      or public.is_instructor_self(p_instructor_id, p_brand_id)
    ) as ok
  ),
  settings as (
    select
      coalesce(max(s.timezone), 'UTC') as timezone,
      coalesce(max(s.buffer_minutes), 15) as buffer_minutes,
      coalesce(max(s.advance_booking_days), 90) as advance_booking_days
    from public.instructor_scheduling_settings s
    where s.brand_id = p_brand_id
      and s.instructor_id = p_instructor_id
      and s.deleted_at is null
  ),
  normalized as (
    select
      greatest(coalesce(p_days, 14), 1) as days,
      greatest(coalesce(p_session_minutes, 60), 15) as session_minutes
  ),
  date_span as (
    select d::date as slot_date
    from settings st
    cross join normalized n
    cross join generate_series(
      greatest(coalesce(p_start_date, current_date), (now() at time zone st.timezone)::date),
      least(
        greatest(coalesce(p_start_date, current_date), (now() at time zone st.timezone)::date) + (n.days - 1),
        (now() at time zone st.timezone)::date + st.advance_booking_days
      ),
      interval '1 day'
    ) d
  ),
  override_days as (
    select o.override_date, o.is_available
    from public.instructor_date_overrides o
    where o.brand_id = p_brand_id
      and o.instructor_id = p_instructor_id
      and o.deleted_at is null
      and o.override_date in (select slot_date from date_span)
  ),
  override_windows as (
    select
      d.slot_date,
      o.start_time,
      o.end_time,
      st.timezone,
      st.buffer_minutes
    from date_span d
    join public.instructor_date_overrides o
      on o.brand_id = p_brand_id
      and o.instructor_id = p_instructor_id
      and o.override_date = d.slot_date
      and o.deleted_at is null
      and o.is_available = true
    cross join settings st
  ),
  weekly_windows as (
    select
      d.slot_date,
      w.start_time,
      w.end_time,
      st.timezone,
      st.buffer_minutes
    from date_span d
    join public.instructor_weekly_availability w
      on w.brand_id = p_brand_id
      and w.instructor_id = p_instructor_id
      and w.deleted_at is null
      and w.is_active = true
      and w.day_of_week = extract(dow from d.slot_date)
    cross join settings st
    where not exists (
      select 1
      from override_days od
      where od.override_date = d.slot_date
    )
  ),
  availability_windows as (
    select * from override_windows
    union all
    select * from weekly_windows
  ),
  candidate_slots as (
    select
      (slot_start_local at time zone aw.timezone) as start_at,
      ((slot_start_local + make_interval(mins => n.session_minutes)) at time zone aw.timezone) as end_at,
      aw.buffer_minutes
    from availability_windows aw
    cross join normalized n
    cross join lateral generate_series(
      aw.slot_date + aw.start_time,
      aw.slot_date + aw.end_time - make_interval(mins => n.session_minutes),
      interval '15 minutes'
    ) as slot_start_local
    where (slot_start_local at time zone aw.timezone) >= now()
  )
  select cs.start_at, cs.end_at
  from candidate_slots cs
  cross join authorization auth
  where auth.ok = true
    and not exists (
      select 1
      from public.bookings b
      where b.brand_id = p_brand_id
        and b.instructor_id = p_instructor_id
        and b.deleted_at is null
        and b.status in ('pending', 'confirmed')
        and tstzrange(cs.start_at, cs.end_at, '[)')
          && tstzrange(
            b.start_at - make_interval(mins => cs.buffer_minutes),
            b.end_at + make_interval(mins => cs.buffer_minutes),
            '[)'
          )
    )
  order by cs.start_at;
$$;

alter table public.instructor_scheduling_settings enable row level security;
alter table public.instructor_weekly_availability enable row level security;
alter table public.instructor_date_overrides enable row level security;

create policy instructors_select_customer
on public.instructors
for select
to authenticated
using (deleted_at is null and public.is_brand_customer(brand_id));

create policy instructors_select_self
on public.instructors
for select
to authenticated
using (deleted_at is null and public.is_instructor_self(id, brand_id));

create policy instructors_brands_select_customer
on public.instructors_brands
for select
to authenticated
using (deleted_at is null and public.is_brand_customer(brand_id));

create policy instructors_brands_select_self
on public.instructors_brands
for select
to authenticated
using (deleted_at is null and public.is_instructor_self(instructor_id, brand_id));

create policy instructor_scheduling_settings_select
on public.instructor_scheduling_settings
for select
to authenticated
using (
  deleted_at is null
  and (
    public.is_brand_admin(brand_id)
    or public.is_brand_customer(brand_id)
    or public.is_instructor_self(instructor_id, brand_id)
  )
);

create policy instructor_scheduling_settings_insert
on public.instructor_scheduling_settings
for insert
to authenticated
with check (
  deleted_at is null
  and (
    public.is_brand_admin(brand_id)
    or public.is_instructor_self(instructor_id, brand_id)
  )
);

create policy instructor_scheduling_settings_update
on public.instructor_scheduling_settings
for update
to authenticated
using (
  deleted_at is null
  and (
    public.is_brand_admin(brand_id)
    or public.is_instructor_self(instructor_id, brand_id)
  )
)
with check (
  public.is_brand_admin(brand_id)
  or public.is_instructor_self(instructor_id, brand_id)
);

create policy instructor_weekly_availability_select
on public.instructor_weekly_availability
for select
to authenticated
using (
  deleted_at is null
  and (
    public.is_brand_admin(brand_id)
    or public.is_brand_customer(brand_id)
    or public.is_instructor_self(instructor_id, brand_id)
  )
);

create policy instructor_weekly_availability_insert
on public.instructor_weekly_availability
for insert
to authenticated
with check (
  deleted_at is null
  and (
    public.is_brand_admin(brand_id)
    or public.is_instructor_self(instructor_id, brand_id)
  )
);

create policy instructor_weekly_availability_update
on public.instructor_weekly_availability
for update
to authenticated
using (
  deleted_at is null
  and (
    public.is_brand_admin(brand_id)
    or public.is_instructor_self(instructor_id, brand_id)
  )
)
with check (
  public.is_brand_admin(brand_id)
  or public.is_instructor_self(instructor_id, brand_id)
);

create policy instructor_date_overrides_select
on public.instructor_date_overrides
for select
to authenticated
using (
  deleted_at is null
  and (
    public.is_brand_admin(brand_id)
    or public.is_brand_customer(brand_id)
    or public.is_instructor_self(instructor_id, brand_id)
  )
);

create policy instructor_date_overrides_insert
on public.instructor_date_overrides
for insert
to authenticated
with check (
  deleted_at is null
  and (
    public.is_brand_admin(brand_id)
    or public.is_instructor_self(instructor_id, brand_id)
  )
);

create policy instructor_date_overrides_update
on public.instructor_date_overrides
for update
to authenticated
using (
  deleted_at is null
  and (
    public.is_brand_admin(brand_id)
    or public.is_instructor_self(instructor_id, brand_id)
  )
)
with check (
  public.is_brand_admin(brand_id)
  or public.is_instructor_self(instructor_id, brand_id)
);

create policy bookings_select_instructor
on public.bookings
for select
to authenticated
using (
  deleted_at is null
  and instructor_id is not null
  and public.is_instructor_self(instructor_id, brand_id)
);

create policy bookings_update_instructor
on public.bookings
for update
to authenticated
using (
  deleted_at is null
  and instructor_id is not null
  and public.is_instructor_self(instructor_id, brand_id)
)
with check (
  instructor_id is not null
  and public.is_instructor_self(instructor_id, brand_id)
);

grant execute on function public.is_brand_customer(uuid) to authenticated;
grant execute on function public.instructor_in_brand(uuid, uuid) to authenticated;
grant execute on function public.is_instructor_self(uuid, uuid) to authenticated;
grant execute on function public.get_instructor_available_slots(uuid, uuid, date, integer, integer) to authenticated;

grant select, insert, update on public.instructor_scheduling_settings to authenticated;
grant select, insert, update on public.instructor_weekly_availability to authenticated;
grant select, insert, update on public.instructor_date_overrides to authenticated;
