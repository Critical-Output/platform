-- WO-2026-005 iteration 2: atomic booking confirmation + payment insertion

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

  select b.status, b.customer_id
  into v_current_status, v_customer_id
  from public.bookings b
  where b.id = p_booking_id
    and b.brand_id = p_brand_id
    and b.deleted_at is null
  for update;

  if not found then
    raise exception 'Booking not found'
      using errcode = 'P0002';
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

grant execute on function public.confirm_booking_with_payment(uuid, uuid, text, text, integer, text, text, text) to authenticated;
