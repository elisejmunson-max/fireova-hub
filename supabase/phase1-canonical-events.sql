-- Fireova Phase 1: evolve event_projects into the one canonical event table.
-- Existing text IDs become legacy metadata. UUID `id` is the only relationship
-- key used by the application after this migration.

begin;
create extension if not exists pgcrypto;

-- Preserve the previous normalized experiment, if present, before retiring it.
-- The current Events experience has always used event_projects and its complete
-- JSON payload, so evolving it in place avoids a lossy model conversion.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'event_projects'
      and column_name = 'id' and data_type = 'text'
  ) then
    alter table public.event_projects
      add column if not exists canonical_id uuid default gen_random_uuid();
    update public.event_projects set canonical_id = gen_random_uuid()
      where canonical_id is null;
    alter table public.event_projects alter column canonical_id set not null;
  end if;
end $$;

-- Migrate any recoverable rows from the old `events` table before archiving it.
do $$
begin
  if to_regclass('public.events') is not null then
    execute $sql$
      insert into public.event_projects (
        id, canonical_id, user_id, data, created_at, updated_at, deleted_at
      )
      select
        coalesce(nullif(e.id::text, ''), 'legacy-event-' || gen_random_uuid()::text),
        e.id,
        e.user_id,
        jsonb_strip_nulls(jsonb_build_object(
          'id', e.id::text,
          'name', coalesce(e.event_name, 'New Event'),
          'type', 'Other',
          'date', coalesce(e.event_date::text, ''),
          'notes', e.special_notes,
          'venueLocation', e.address,
          'media', '[]'::jsonb,
          'createdAt', coalesce(e.created_at, now()),
          'updatedAt', coalesce(e.updated_at, e.created_at, now())
        )),
        coalesce(e.created_at, now()),
        coalesce(e.updated_at, e.created_at, now()),
        null
      from public.events e
      on conflict (user_id, id) do nothing
    $sql$;

    if to_regclass('public.events_legacy_phase1') is null then
      alter table public.events rename to events_legacy_phase1;
    end if;
  end if;
end $$;

-- Convert the table in place: legacy text ID is metadata; UUID is primary.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'event_projects'
      and column_name = 'id' and data_type = 'text'
  ) then
    alter table public.event_projects drop constraint if exists event_projects_pkey;
    alter table public.event_projects rename column id to legacy_id;
    alter table public.event_projects rename column canonical_id to id;
    alter table public.event_projects add primary key (id);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'event_projects_user_legacy_unique'
  ) then
    alter table public.event_projects
      add constraint event_projects_user_legacy_unique unique (user_id, legacy_id);
  end if;
end $$;
create unique index if not exists event_projects_user_id_unique
  on public.event_projects(user_id, id);

create table if not exists public.venues (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  normalized_name text not null,
  location text,
  instagram_handle text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, normalized_name)
);

alter table public.event_projects
  add column if not exists venue_id uuid references public.venues(id) on delete set null;

create table if not exists public.vendor_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  normalized_name text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, normalized_name)
);

create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  legacy_id text,
  category_id uuid not null references public.vendor_categories(id),
  business_name text not null,
  normalized_name text not null,
  instagram_handle text,
  website text,
  email text,
  phone text,
  contact_name text,
  notes text,
  preferred_vendor boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);
create unique index if not exists vendors_user_legacy_id_unique
  on public.vendors(user_id, legacy_id) where legacy_id is not null;

create table if not exists public.event_vendors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null,
  vendor_id uuid not null,
  category_id uuid not null references public.vendor_categories(id),
  instagram_override text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, event_id, vendor_id),
  foreign key (user_id, event_id)
    references public.event_projects(user_id, id) on delete cascade,
  foreign key (user_id, vendor_id)
    references public.vendors(user_id, id) on delete cascade
);

alter table public.venues enable row level security;
alter table public.vendor_categories enable row level security;
alter table public.vendors enable row level security;
alter table public.event_vendors enable row level security;

drop policy if exists "Users manage own venues" on public.venues;
create policy "Users manage own venues" on public.venues for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage own vendor categories" on public.vendor_categories;
create policy "Users manage own vendor categories" on public.vendor_categories for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage own vendors" on public.vendors;
create policy "Users manage own vendors" on public.vendors for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage own event vendors" on public.event_vendors;
create policy "Users manage own event vendors" on public.event_vendors for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Canonical events keep the existing four user-scoped event_projects policies.
-- Seed standard categories for every user represented by an event.
insert into public.vendor_categories (user_id, name, normalized_name, is_system)
select distinct ep.user_id, category.name, lower(category.name), true
from public.event_projects ep
cross join (values
  ('Venue'), ('Planner'), ('Coordinator'), ('Photographer'), ('Videographer'),
  ('Florist'), ('DJ'), ('Live Music / Band'), ('Bar'), ('Caterer'), ('Bakery'),
  ('Rentals'), ('Lighting / AV'), ('Entertainment'), ('Transportation'),
  ('Hair & Makeup'), ('Officiant'), ('Content Creator'), ('Other')
) as category(name)
on conflict (user_id, normalized_name) do nothing;

-- Recover venues embedded in canonical event JSON and attach them by FK.
insert into public.venues (
  user_id, name, normalized_name, location, instagram_handle, created_at, updated_at
)
select distinct on (ep.user_id, lower(trim(ep.data->>'venueName')))
  ep.user_id,
  trim(ep.data->>'venueName'),
  lower(trim(ep.data->>'venueName')),
  nullif(trim(ep.data->>'venueLocation'), ''),
  nullif(trim(leading '@' from ep.data->>'venueInstagram'), ''),
  ep.created_at,
  ep.updated_at
from public.event_projects ep
where nullif(trim(ep.data->>'venueName'), '') is not null
order by ep.user_id, lower(trim(ep.data->>'venueName')), ep.updated_at desc
on conflict (user_id, normalized_name) do nothing;

update public.event_projects ep
set venue_id = v.id
from public.venues v
where ep.venue_id is null
  and ep.user_id = v.user_id
  and v.normalized_name = lower(trim(ep.data->>'venueName'));

do $$
declare table_name text;
begin
  foreach table_name in array array['venues', 'vendor_categories', 'vendors', 'event_vendors']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;

commit;
