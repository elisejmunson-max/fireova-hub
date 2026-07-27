begin;

alter table public.event_projects
  alter column legacy_id drop not null,
  add column if not exists creation_key text,
  add column if not exists creation_status text not null default 'complete';

create unique index if not exists event_projects_user_creation_key_unique
  on public.event_projects(user_id, creation_key)
  where creation_key is not null;

alter table public.event_projects drop constraint if exists event_projects_creation_status_check;
alter table public.event_projects
  add constraint event_projects_creation_status_check
  check (creation_status in ('uploading', 'complete', 'failed'));

create table if not exists public.event_media (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null,
  storage_path text not null,
  file_name text not null,
  file_type text not null,
  media_kind text not null check (media_kind in ('photo', 'video')),
  size_bytes bigint not null default 0,
  thumbnail_path text,
  preview_url text,
  tags text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  checksum text,
  upload_date timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, storage_path),
  unique (user_id, event_id, checksum),
  foreign key (user_id, event_id)
    references public.event_projects(user_id, id) on delete cascade
);

create index if not exists event_media_event_id_idx
  on public.event_media(user_id, event_id, upload_date);

alter table public.event_media enable row level security;
drop policy if exists "Users manage own event media" on public.event_media;
create policy "Users manage own event media" on public.event_media
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'event_media'
  ) then
    alter publication supabase_realtime add table public.event_media;
  end if;
end $$;

commit;
