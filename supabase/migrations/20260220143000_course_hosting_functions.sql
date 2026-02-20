-- WO-2026-004: Course hosting helper functions for course catalog/enrollment/certificates

create unique index if not exists certificates_number_unique
on public.certificates (certificate_number)
where deleted_at is null and certificate_number is not null;

create or replace function public.list_visible_courses_for_current_brand(
  p_brand_slug text
)
returns table (
  id uuid,
  brand_id uuid,
  title text,
  description text,
  level text,
  duration_minutes integer,
  metadata jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public, auth
as $$
  select
    c.id,
    c.brand_id,
    c.title,
    c.description,
    c.level,
    c.duration_minutes,
    c.metadata,
    c.created_at,
    c.updated_at
  from public.courses c
  join public.brands b
    on b.id = c.brand_id
    and b.deleted_at is null
  join public.courses_brands cb
    on cb.course_id = c.id
    and cb.brand_id = c.brand_id
    and cb.deleted_at is null
  where auth.uid() is not null
    and b.slug = lower(btrim(p_brand_slug))
    and c.deleted_at is null
  order by c.created_at desc;
$$;

create or replace function public.enroll_current_user_in_course(
  p_brand_slug text,
  p_course_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_brand_id uuid;
  v_customer_id uuid;
  v_enrollment_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_brand_slug is null or btrim(p_brand_slug) = '' then
    raise exception 'p_brand_slug is required';
  end if;

  if p_course_id is null then
    raise exception 'p_course_id is required';
  end if;

  select b.id
  into v_brand_id
  from public.brands b
  where b.slug = lower(btrim(p_brand_slug))
    and b.deleted_at is null
  limit 1;

  if v_brand_id is null then
    raise exception 'Brand not found for slug %', p_brand_slug;
  end if;

  perform 1
  from public.courses c
  join public.courses_brands cb
    on cb.course_id = c.id
    and cb.brand_id = c.brand_id
    and cb.deleted_at is null
  where c.id = p_course_id
    and c.brand_id = v_brand_id
    and c.deleted_at is null;

  if not found then
    raise exception 'Course not visible for this brand';
  end if;

  select c.id
  into v_customer_id
  from public.customers c
  where c.brand_id = v_brand_id
    and c.auth_user_id = v_user_id
    and c.deleted_at is null
  order by c.created_at asc
  limit 1;

  if v_customer_id is null then
    v_customer_id := public.sync_customer_for_user_id(v_user_id, lower(btrim(p_brand_slug)), null);
  end if;

  select e.id
  into v_enrollment_id
  from public.enrollments e
  where e.brand_id = v_brand_id
    and e.customer_id = v_customer_id
    and e.course_id = p_course_id
    and e.deleted_at is null
    and e.status in ('active', 'completed')
  order by e.created_at desc
  limit 1;

  if v_enrollment_id is not null then
    return v_enrollment_id;
  end if;

  insert into public.enrollments (
    brand_id,
    customer_id,
    course_id,
    status,
    metadata
  )
  values (
    v_brand_id,
    v_customer_id,
    p_course_id,
    'active',
    jsonb_build_object('source', 'self-enrollment')
  )
  returning id into v_enrollment_id;

  return v_enrollment_id;
end;
$$;

create or replace function public.issue_certificate_for_enrollment(
  p_enrollment_id uuid,
  p_certificate_number text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_brand_id uuid;
  v_customer_id uuid;
  v_course_id uuid;
  v_certificate_id uuid;
  v_certificate_number text;
  v_total_lessons integer;
  v_completed_lessons integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_enrollment_id is null then
    raise exception 'p_enrollment_id is required';
  end if;

  select
    e.brand_id,
    e.customer_id,
    e.course_id
  into
    v_brand_id,
    v_customer_id,
    v_course_id
  from public.enrollments e
  join public.customers c
    on c.id = e.customer_id
    and c.brand_id = e.brand_id
    and c.deleted_at is null
  where e.id = p_enrollment_id
    and e.deleted_at is null
    and c.auth_user_id = v_user_id
  limit 1;

  if v_course_id is null then
    raise exception 'Enrollment not found for current user';
  end if;

  select cert.id
  into v_certificate_id
  from public.certificates cert
  where cert.brand_id = v_brand_id
    and cert.customer_id = v_customer_id
    and cert.course_id = v_course_id
    and cert.deleted_at is null
  order by cert.created_at desc
  limit 1;

  if v_certificate_id is not null then
    return v_certificate_id;
  end if;

  select count(*)
  into v_total_lessons
  from public.modules m
  join public.lessons l
    on l.module_id = m.id
    and l.deleted_at is null
  where m.course_id = v_course_id
    and m.deleted_at is null;

  if v_total_lessons = 0 then
    raise exception 'Course has no lessons to complete';
  end if;

  select count(*)
  into v_completed_lessons
  from public.modules m
  join public.lessons l
    on l.module_id = m.id
    and l.deleted_at is null
  join public.progress p
    on p.lesson_id = l.id
    and p.enrollment_id = p_enrollment_id
    and p.deleted_at is null
    and (p.completed_at is not null or p.percent_complete >= 100)
  where m.course_id = v_course_id
    and m.deleted_at is null;

  if v_completed_lessons < v_total_lessons then
    raise exception 'Course is not complete';
  end if;

  update public.enrollments
  set
    status = 'completed',
    completed_at = coalesce(completed_at, now()),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('certificate_issued', true)
  where id = p_enrollment_id
    and deleted_at is null;

  v_certificate_number := nullif(btrim(p_certificate_number), '');
  if v_certificate_number is null then
    v_certificate_number := concat(
      'CERT-',
      to_char(now() at time zone 'utc', 'YYYY'),
      '-',
      upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 10))
    );
  end if;

  insert into public.certificates (
    brand_id,
    customer_id,
    course_id,
    certificate_number,
    metadata
  )
  values (
    v_brand_id,
    v_customer_id,
    v_course_id,
    v_certificate_number,
    jsonb_build_object('verification_code', v_certificate_number, 'source', 'auto')
  )
  returning id into v_certificate_id;

  return v_certificate_id;
end;
$$;

create or replace function public.verify_certificate_code(
  p_certificate_number text
)
returns table (
  certificate_id uuid,
  certificate_number text,
  issued_at timestamptz,
  course_title text,
  brand_name text,
  student_name text
)
language sql
security definer
set search_path = public
as $$
  select
    cert.id as certificate_id,
    cert.certificate_number,
    cert.issued_at,
    co.title as course_title,
    b.name as brand_name,
    trim(concat(coalesce(c.first_name, ''), ' ', coalesce(c.last_name, ''))) as student_name
  from public.certificates cert
  join public.courses co
    on co.id = cert.course_id
    and co.deleted_at is null
  join public.brands b
    on b.id = cert.brand_id
    and b.deleted_at is null
  join public.customers c
    on c.id = cert.customer_id
    and c.brand_id = cert.brand_id
    and c.deleted_at is null
  where cert.deleted_at is null
    and cert.certificate_number = nullif(btrim(p_certificate_number), '')
  limit 1;
$$;

revoke all on function public.list_visible_courses_for_current_brand(text) from public;
revoke all on function public.enroll_current_user_in_course(text, uuid) from public;
revoke all on function public.issue_certificate_for_enrollment(uuid, text) from public;
revoke all on function public.verify_certificate_code(text) from public;

grant execute on function public.list_visible_courses_for_current_brand(text) to authenticated;
grant execute on function public.enroll_current_user_in_course(text, uuid) to authenticated;
grant execute on function public.issue_certificate_for_enrollment(uuid, text) to authenticated;
grant execute on function public.verify_certificate_code(text) to anon, authenticated;
