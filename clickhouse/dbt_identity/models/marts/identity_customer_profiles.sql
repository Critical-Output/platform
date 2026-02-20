{{ config(materialized='table') }}

with normalized as (
  select
    nullIf(trim(anonymous_id), '') as anonymous_id,
    nullIf(trim(user_id), '') as user_id,
    nullIf(lower(trim(email)), '') as email,
    nullIf(replaceRegexpAll(ifNull(phone, ''), '[^0-9]', ''), '') as phone,
    nullIf(trim(device_fingerprint), '') as device_fingerprint,
    last_seen,
    method
  from {{ source('analytics', 'identity_graph') }}
),
alias_map as (
  select
    anonymous_id,
    canonical_user_id,
    confidence,
    method as canonical_method
  from {{ ref('identity_alias_candidates') }}
),
resolved as (
  select
    coalesce(n.user_id, a.canonical_user_id) as canonical_user_id,
    n.anonymous_id,
    n.email,
    n.phone,
    n.device_fingerprint,
    coalesce(a.canonical_method, n.method) as method,
    coalesce(a.confidence, toFloat32(1.0)) as confidence,
    n.last_seen
  from normalized n
  left join alias_map a
    on n.anonymous_id = a.anonymous_id
)
select
  canonical_user_id,
  groupUniqArrayIf(anonymous_id, anonymous_id is not null) as anonymous_ids,
  groupUniqArrayIf(email, email is not null) as emails,
  groupUniqArrayIf(phone, phone is not null) as phones,
  groupUniqArrayIf(device_fingerprint, device_fingerprint is not null) as device_fingerprints,
  groupUniqArray(method) as methods,
  max(last_seen) as last_seen,
  count() as edge_count,
  max(confidence) as max_confidence
from resolved
where canonical_user_id is not null
group by canonical_user_id
