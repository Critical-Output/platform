-- WO-2026-003: Auth customer sync and anonymous ID linking

create unique index if not exists customers_brand_auth_user_unique
on public.customers (brand_id, auth_user_id)
where deleted_at is null and auth_user_id is not null;

create or replace function public.merge_customer_metadata(
  p_existing jsonb,
  p_anonymous_id text
)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_metadata jsonb := coalesce(p_existing, '{}'::jsonb);
  v_anonymous_ids jsonb;
  v_trimmed_anonymous_id text;
begin
  v_trimmed_anonymous_id := nullif(btrim(p_anonymous_id), '');

  if v_trimmed_anonymous_id is null then
    return v_metadata;
  end if;

  v_anonymous_ids := coalesce(v_metadata -> 'anonymous_ids', '[]'::jsonb);

  if jsonb_typeof(v_anonymous_ids) <> 'array' then
    v_anonymous_ids := '[]'::jsonb;
  end if;

  if not (v_anonymous_ids ? v_trimmed_anonymous_id) then
    v_anonymous_ids := v_anonymous_ids || to_jsonb(v_trimmed_anonymous_id);
  end if;

  return jsonb_set(v_metadata, '{anonymous_ids}', v_anonymous_ids, true);
end;
$$;

create or replace function public.sync_customer_for_user_id(
  p_user_id uuid,
  p_brand_slug text,
  p_anonymous_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_brand_id uuid;
  v_customer_id uuid;
  v_first_name text;
  v_last_name text;
  v_email text;
  v_metadata jsonb := '{}'::jsonb;
  v_raw_user_meta_data jsonb := '{}'::jsonb;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  if p_brand_slug is null or btrim(p_brand_slug) = '' then
    raise exception 'p_brand_slug is required';
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

  select
    nullif(lower(btrim(u.email)), ''),
    case
      when jsonb_typeof(u.raw_user_meta_data) = 'object' then u.raw_user_meta_data
      else '{}'::jsonb
    end
  into v_email, v_raw_user_meta_data
  from auth.users u
  where u.id = p_user_id
  limit 1;

  if not found then
    raise exception 'Auth user not found for id %', p_user_id;
  end if;

  v_first_name := nullif(btrim(v_raw_user_meta_data ->> 'first_name'), '');
  if v_first_name is null then
    v_first_name := nullif(btrim(v_raw_user_meta_data ->> 'given_name'), '');
  end if;

  v_last_name := nullif(btrim(v_raw_user_meta_data ->> 'last_name'), '');
  if v_last_name is null then
    v_last_name := nullif(btrim(v_raw_user_meta_data ->> 'family_name'), '');
  end if;

  v_metadata := public.merge_customer_metadata(v_raw_user_meta_data, p_anonymous_id);

  select c.id
  into v_customer_id
  from public.customers c
  where c.brand_id = v_brand_id
    and c.auth_user_id = p_user_id
    and c.deleted_at is null
  order by c.created_at asc
  limit 1;

  if v_customer_id is null then
    insert into public.customers (
      brand_id,
      auth_user_id,
      email,
      first_name,
      last_name,
      metadata
    )
    values (
      v_brand_id,
      p_user_id,
      v_email,
      v_first_name,
      v_last_name,
      v_metadata
    )
    returning id into v_customer_id;
  else
    update public.customers c
    set
      email = coalesce(v_email, c.email),
      first_name = coalesce(v_first_name, c.first_name),
      last_name = coalesce(v_last_name, c.last_name),
      metadata = public.merge_customer_metadata(c.metadata, p_anonymous_id)
    where c.id = v_customer_id;
  end if;

  return v_customer_id;
end;
$$;

create or replace function public.sync_customer_for_current_brand(
  p_brand_slug text,
  p_anonymous_id text default null
)
returns uuid
language sql
security definer
set search_path = public, auth
as $$
  select public.sync_customer_for_user_id(auth.uid(), p_brand_slug, p_anonymous_id);
$$;

revoke all on function public.sync_customer_for_user_id(uuid, text, text) from public;
revoke all on function public.sync_customer_for_current_brand(text, text) from public;
grant execute on function public.sync_customer_for_current_brand(text, text) to authenticated;

create or replace function public.handle_auth_user_created_sync_customer()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_brand_slug text;
  v_anonymous_id text;
begin
  if jsonb_typeof(new.raw_user_meta_data) = 'object' then
    v_brand_slug := nullif(btrim(new.raw_user_meta_data ->> 'brand_slug'), '');
    v_anonymous_id := nullif(btrim(new.raw_user_meta_data ->> 'anonymous_id'), '');
  end if;

  if v_brand_slug is not null then
    perform public.sync_customer_for_user_id(new.id, v_brand_slug, v_anonymous_id);
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_sync_customer on auth.users;
create trigger on_auth_user_created_sync_customer
after insert on auth.users
for each row execute function public.handle_auth_user_created_sync_customer();
