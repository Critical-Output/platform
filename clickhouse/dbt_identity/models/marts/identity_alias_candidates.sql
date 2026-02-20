{{ config(materialized='table') }}

with normalized as (
  select
    nullIf(trim(anonymous_id), '') as anonymous_id,
    nullIf(trim(user_id), '') as user_id,
    nullIf(lower(trim(email)), '') as email,
    nullIf(replaceRegexpAll(ifNull(phone, ''), '[^0-9]', ''), '') as phone,
    nullIf(trim(device_fingerprint), '') as device_fingerprint,
    last_seen
  from {{ source('analytics', 'identity_graph') }}
),
login_aliases as (
  select
    anonymous_id,
    argMax(user_id, last_seen) as canonical_user_id,
    toFloat32(1.0) as confidence,
    'deterministic_login' as method,
    max(last_seen) as resolved_last_seen,
    3 as method_rank
  from normalized
  where anonymous_id is not null
    and user_id is not null
  group by anonymous_id
),
email_user_lookup as (
  select
    email,
    min(user_id) as canonical_user_id
  from normalized
  where email is not null
    and user_id is not null
  group by email
),
email_aliases as (
  select
    n.anonymous_id,
    e.canonical_user_id,
    toFloat32(1.0) as confidence,
    'deterministic_email' as method,
    max(n.last_seen) as resolved_last_seen,
    2 as method_rank
  from normalized n
  inner join email_user_lookup e
    on n.email = e.email
  where n.anonymous_id is not null
  group by n.anonymous_id, e.canonical_user_id
),
phone_user_lookup as (
  select
    phone,
    min(user_id) as canonical_user_id
  from normalized
  where phone is not null
    and user_id is not null
  group by phone
),
phone_aliases as (
  select
    n.anonymous_id,
    p.canonical_user_id,
    toFloat32(1.0) as confidence,
    'deterministic_phone' as method,
    max(n.last_seen) as resolved_last_seen,
    2 as method_rank
  from normalized n
  inner join phone_user_lookup p
    on n.phone = p.phone
  where n.anonymous_id is not null
  group by n.anonymous_id, p.canonical_user_id
),
{% if var('enable_probabilistic_matching', true) %}
fingerprint_user_lookup as (
  select
    device_fingerprint,
    min(user_id) as canonical_user_id
  from normalized
  where device_fingerprint is not null
    and user_id is not null
  group by device_fingerprint
),
device_aliases as (
  select
    n.anonymous_id,
    f.canonical_user_id,
    toFloat32(0.8) as confidence,
    'probabilistic_device_fingerprint' as method,
    max(n.last_seen) as resolved_last_seen,
    1 as method_rank
  from normalized n
  inner join fingerprint_user_lookup f
    on n.device_fingerprint = f.device_fingerprint
  where n.anonymous_id is not null
  group by n.anonymous_id, f.canonical_user_id
),
{% endif %}
all_aliases as (
  select * from login_aliases
  union all
  select * from email_aliases
  union all
  select * from phone_aliases
  {% if var('enable_probabilistic_matching', true) %}
  union all
  select * from device_aliases
  {% endif %}
),
ranked as (
  select
    anonymous_id,
    canonical_user_id,
    confidence,
    method,
    resolved_last_seen,
    row_number() over (
      partition by anonymous_id
      order by confidence desc, method_rank desc, resolved_last_seen desc, canonical_user_id asc
    ) as resolution_rank
  from all_aliases
)
select
  anonymous_id,
  canonical_user_id,
  confidence,
  method,
  resolved_last_seen,
  now64(3) as resolved_at
from ranked
where resolution_rank = 1
