{{ config(materialized='table') }}

with alias_map as (
  select
    anonymous_id,
    canonical_user_id,
    confidence,
    method
  from {{ ref('identity_alias_candidates') }}
)
select
  e.event_id,
  e.anonymous_id,
  e.user_id,
  coalesce(nullIf(e.user_id, ''), a.canonical_user_id) as canonical_user_id,
  if(
    nullIf(e.user_id, '') != '',
    toFloat32(1.0),
    coalesce(a.confidence, toFloat32(0))
  ) as identity_confidence,
  if(
    nullIf(e.user_id, '') != '',
    'deterministic_login',
    coalesce(a.method, 'unresolved')
  ) as identity_method,
  e.session_id,
  e.event_name,
  e.properties,
  e.context,
  e.timestamp,
  e.ingested_at
from {{ source('analytics', 'events') }} e
left join alias_map a
  on e.anonymous_id = a.anonymous_id
