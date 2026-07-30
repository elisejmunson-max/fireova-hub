alter table if exists public.venues
  add column if not exists notes text;
