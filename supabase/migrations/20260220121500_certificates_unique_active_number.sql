create unique index if not exists certificates_active_certificate_number_unique
on public.certificates (brand_id, certificate_number)
where deleted_at is null and certificate_number is not null;
