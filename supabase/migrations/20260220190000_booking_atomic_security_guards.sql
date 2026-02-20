-- WO-2026-005 iteration 4:
-- - secure confirm_booking_with_payment execution surface
-- - atomic instructor availability replacement
-- - race-safe pending booking creation

set search_path = public, extensions;

create or replace function public.confirm_booking_with_payment(
  p_brand_id uuid,
  p_booking_id uuid,
  p_provider text,
  p_provider_payment_id text,
  p_amount_cents integer,
  p_currency text,
  p_notes text default null,
  p_instructor_notes text default null
)
returns table (
  id uuid,
  status text,
  payment_status text,
  payment_reference text,
  start_at timestamptz,
  end_at timestamptz,
  notes text,
  instructor_notes text,
  confirmed_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_status text;
  v_customer_id uuid;
  v_instructor_id uuid;
  v_actor_authorized boolean;
begin
  if coalesce(p_amount_cents, 0) <= 0 then
    raise exception 'Payment amount must be greater than zero'
      using errcode = '23514';
  end if;

  if coalesce(trim(p_provider), '') = '' then
    raise exception 'Payment provider is required'
      using errcode = '23514';
  end if;

  if coalesce(trim(p_currency), '') = '' then
    raise exception 'Payment currency is required'
      using errcode = '23514';
  end if;

  select b.status, b.customer_id, b.instructor_id
  into v_current_status, v_customer_id, v_instructor_id
  from public.bookings b
  where b.id = p_booking_id
    and b.brand_id = p_brand_id
    and b.deleted_at is null
  for update;

  if not found then
    raise exception 'Booking not found'
      using errcode = 'P0002';
  end if;

  select (
    auth.role() = 'service_role'
    or public.is_brand_admin(p_brand_id)
    or exists (
      select 1
      from public.customers c
      where c.id = v_customer_id
        and c.brand_id = p_brand_id
        and c.auth_user_id = auth.uid()
        and c.deleted_at is null
    )
    or (
      v_instructor_id is not null
      and public.is_instructor_self(v_instructor_id, p_brand_id)
    )
  )
  into v_actor_authorized;

  if coalesce(v_actor_authorized, false) = false then
    raise exception 'Not authorized to confirm this booking'
      using errcode = '42501';
  end if;

  if v_current_status <> 'pending' then
    raise exception 'Only pending bookings can be confirmed'
      using errcode = '23514';
  end if;

  insert into public.payments (
    brand_id,
    customer_id,
    booking_id,
    provider,
    provider_payment_id,
    amount_cents,
    currency,
    status,
    paid_at,
    metadata
  )
  values (
    p_brand_id,
    v_customer_id,
    p_booking_id,
    trim(p_provider),
    nullif(trim(coalesce(p_provider_payment_id, '')), ''),
    p_amount_cents,
    upper(trim(p_currency)),
    'succeeded',
    now(),
    jsonb_build_object('source', 'booking_confirmation')
  );

  return query
  update public.bookings b
  set status = 'confirmed',
      payment_status = 'paid',
      payment_reference = nullif(trim(coalesce(p_provider_payment_id, '')), ''),
      notes = coalesce(p_notes, b.notes),
      instructor_notes = coalesce(p_instructor_notes, b.instructor_notes)
  where b.id = p_booking_id
    and b.brand_id = p_brand_id
    and b.deleted_at is null
  returning
    b.id,
    b.status,
    b.payment_status,
    b.payment_reference,
    b.start_at,
    b.end_at,
    b.notes,
    b.instructor_notes,
    b.confirmed_at,
    b.completed_at,
    b.cancelled_at,
    b.updated_at;
end;
$$;

revoke all on function public.confirm_booking_with_payment(uuid, uuid, text, text, integer, text, text, text) from public;
revoke all on function public.confirm_booking_with_payment(uuid, uuid, text, text, integer, text, text, text) from authenticated;
grant execute on function public.confirm_booking_with_payment(uuid, uuid, text, text, integer, text, text, text) to service_role;

create or replace function public.replace_instructor_availability(
  p_brand_id uuid,
  p_instructor_id uuid,
  p_timezone text,
  p_buffer_minutes integer,
  p_advance_booking_days integer,
  p_cancellation_cutoff_hours integer,
  p_weekly_slots jsonb default '[]'::jsonb,
  p_date_overrides jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_timezone text := coalesce(nullif(trim(coalesce(p_timezone, '')), ''), 'UTC');
begin
  if p_weekly_slots is null or jsonb_typeof(p_weekly_slots) <> 'array' then
    raise exception 'weekly slots payload must be a JSON array'
      using errcode = '22023';
  end if;

  if p_date_overrides is null or jsonb_typeof(p_date_overrides) <> 'array' then
    raise exception 'date overrides payload must be a JSON array'
      using errcode = '22023';
  end if;

  update public.instructor_scheduling_settings s
  set timezone = v_timezone,
      buffer_minutes = p_buffer_minutes,
      advance_booking_days = p_advance_booking_days,
      cancellation_cutoff_hours = p_cancellation_cutoff_hours,
      deleted_at = null
  where s.brand_id = p_brand_id
    and s.instructor_id = p_instructor_id
    and s.deleted_at is null;

  if not found then
    insert into public.instructor_scheduling_settings (
      brand_id,
      instructor_id,
      timezone,
      buffer_minutes,
      advance_booking_days,
      cancellation_cutoff_hours
    )
    values (
      p_brand_id,
      p_instructor_id,
      v_timezone,
      p_buffer_minutes,
      p_advance_booking_days,
      p_cancellation_cutoff_hours
    );
  end if;

  update public.instructor_weekly_availability
  set deleted_at = v_now
  where brand_id = p_brand_id
    and instructor_id = p_instructor_id
    and deleted_at is null;

  insert into public.instructor_weekly_availability (
    brand_id,
    instructor_id,
    day_of_week,
    start_time,
    end_time,
    is_active
  )
  select
    p_brand_id,
    p_instructor_id,
    ws.day_of_week,
    ws.start_time::time,
    ws.end_time::time,
    true
  from jsonb_to_recordset(p_weekly_slots) as ws(day_of_week integer, start_time text, end_time text);

  update public.instructor_date_overrides
  set deleted_at = v_now
  where brand_id = p_brand_id
    and instructor_id = p_instructor_id
    and deleted_at is null;

  insert into public.instructor_date_overrides (
    brand_id,
    instructor_id,
    override_date,
    is_available,
    start_time,
    end_time
  )
  select
    p_brand_id,
    p_instructor_id,
    od.override_date::date,
    od.is_available,
    case when od.is_available then od.start_time::time else null end,
    case when od.is_available then od.end_time::time else null end
  from jsonb_to_recordset(p_date_overrides) as od(
    override_date text,
    is_available boolean,
    start_time text,
    end_time text
  );
end;
$$;

revoke all on function public.replace_instructor_availability(uuid, uuid, text, integer, integer, integer, jsonb, jsonb) from public;
revoke all on function public.replace_instructor_availability(uuid, uuid, text, integer, integer, integer, jsonb, jsonb) from authenticated;
grant execute on function public.replace_instructor_availability(uuid, uuid, text, integer, integer, integer, jsonb, jsonb) to service_role;

create or replace function public.create_pending_booking_atomic(
  p_brand_id uuid,
  p_customer_id uuid,
  p_instructor_id uuid,
  p_course_id uuid default null,
  p_start_at timestamptz default null,
  p_end_at timestamptz default null,
  p_buffer_minutes integer default 15,
  p_location text default null,
  p_notes text default null,
  p_student_timezone text default 'UTC',
  p_instructor_timezone text default 'UTC'
)
returns table (
  id uuid,
  status text,
  payment_status text,
  start_at timestamptz,
  end_at timestamptz,
  instructor_id uuid,
  customer_id uuid,
  course_id uuid,
  location text,
  notes text,
  student_timezone text,
  instructor_timezone text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buffer_minutes integer := greatest(coalesce(p_buffer_minutes, 0), 0);
begin
  if p_start_at is null or p_end_at is null or p_end_at <= p_start_at then
    raise exception 'Invalid booking time range'
      using errcode = '22023';
  end if;

  perform 1
  from public.customers c
  where c.id = p_customer_id
    and c.brand_id = p_brand_id
    and c.deleted_at is null;

  if not found then
    raise exception 'Customer not found'
      using errcode = 'P0002';
  end if;

  perform 1
  from public.instructors i
  where i.id = p_instructor_id
    and i.deleted_at is null
    and public.instructor_in_brand(i.id, p_brand_id)
  for update;

  if not found then
    raise exception 'Instructor not found'
      using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.bookings b
    where b.brand_id = p_brand_id
      and b.instructor_id = p_instructor_id
      and b.deleted_at is null
      and b.status in ('pending', 'confirmed')
      and tstzrange(p_start_at, p_end_at, '[)')
        && tstzrange(
          b.start_at - make_interval(mins => v_buffer_minutes),
          b.end_at + make_interval(mins => v_buffer_minutes),
          '[)'
        )
  ) then
    raise exception 'Selected slot is unavailable due to an existing booking/buffer window'
      using errcode = '23P01';
  end if;

  return query
  insert into public.bookings (
    brand_id,
    customer_id,
    instructor_id,
    course_id,
    status,
    payment_status,
    start_at,
    end_at,
    location,
    notes,
    student_timezone,
    instructor_timezone
  )
  values (
    p_brand_id,
    p_customer_id,
    p_instructor_id,
    p_course_id,
    'pending',
    'unpaid',
    p_start_at,
    p_end_at,
    p_location,
    p_notes,
    coalesce(nullif(trim(coalesce(p_student_timezone, '')), ''), 'UTC'),
    coalesce(nullif(trim(coalesce(p_instructor_timezone, '')), ''), 'UTC')
  )
  returning
    bookings.id,
    bookings.status,
    bookings.payment_status,
    bookings.start_at,
    bookings.end_at,
    bookings.instructor_id,
    bookings.customer_id,
    bookings.course_id,
    bookings.location,
    bookings.notes,
    bookings.student_timezone,
    bookings.instructor_timezone,
    bookings.created_at;
end;
$$;

revoke all on function public.create_pending_booking_atomic(uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, text, text, text, text) from public;
revoke all on function public.create_pending_booking_atomic(uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, text, text, text, text) from authenticated;
grant execute on function public.create_pending_booking_atomic(uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, text, text, text, text) to service_role;
