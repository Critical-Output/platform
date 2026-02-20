-- WO-2026-004 follow-up: decouple viewer-brand visibility from course owner brand.

alter table public.courses_brands
drop constraint if exists courses_brands_course_brand_fk;

alter table public.courses_brands
add constraint courses_brands_course_fk
foreign key (course_id)
references public.courses (id);

alter table public.enrollments
drop constraint if exists enrollments_course_brand_fk;

alter table public.enrollments
add constraint enrollments_course_fk
foreign key (course_id)
references public.courses (id);

alter table public.progress
drop constraint if exists progress_lesson_brand_fk;

alter table public.progress
add constraint progress_lesson_fk
foreign key (lesson_id)
references public.lessons (id);

alter table public.certificates
drop constraint if exists certificates_course_brand_fk;

alter table public.certificates
add constraint certificates_course_fk
foreign key (course_id)
references public.courses (id);

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
  with viewer_brand as (
    select b.id
    from public.brands b
    where b.slug = lower(btrim(p_brand_slug))
      and b.deleted_at is null
    limit 1
  )
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
  from viewer_brand vb
  join public.courses_brands cb
    on cb.brand_id = vb.id
    and cb.deleted_at is null
  join public.courses c
    on c.id = cb.course_id
    and c.deleted_at is null
  where auth.uid() is not null
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
    and cb.brand_id = v_brand_id
    and cb.deleted_at is null
  where c.id = p_course_id
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
