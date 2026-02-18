-- WO-2026-002 seed data

insert into public.brands (slug, name, metadata)
values
  ('cti', 'CTI', '{}'::jsonb),
  ('karen-miles', 'Karen Miles', '{}'::jsonb),
  ('gebben-miles', 'Gebben Miles', '{}'::jsonb),
  ('sporting-clays-academy', 'Sporting Clays Academy', '{}'::jsonb)
on conflict (slug) where deleted_at is null
do update set
  name = excluded.name,
  metadata = excluded.metadata,
  updated_at = now();

