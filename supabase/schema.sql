-- ============================================================
-- Fireova Hub — Supabase Schema
-- Run this in your Supabase SQL editor to set up the database.
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- PROFILES
-- ============================================================
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  full_name  text,
  business_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- ============================================================
-- POSTS
-- ============================================================
create table if not exists public.posts (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  title           text not null,
  pillar          text not null,
  topic           text,
  format          text not null check (format in ('Reel', 'Carousel', 'Photo')),
  caption_option1 text,
  caption_option2 text,
  caption_option3 text,
  hashtags        text[] not null default '{}',
  shot_ideas      text[] not null default '{}',
  status          text not null default 'draft' check (status in ('draft', 'scheduled', 'published')),
  scheduled_date  date,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists posts_user_id_idx on public.posts(user_id);
create index if not exists posts_status_idx on public.posts(status);
create index if not exists posts_pillar_idx on public.posts(pillar);

alter table public.posts enable row level security;

create policy "Users can view own posts"
  on public.posts for select
  using (auth.uid() = user_id);

create policy "Users can insert own posts"
  on public.posts for insert
  with check (auth.uid() = user_id);

create policy "Users can update own posts"
  on public.posts for update
  using (auth.uid() = user_id);

create policy "Users can delete own posts"
  on public.posts for delete
  using (auth.uid() = user_id);

-- ============================================================
-- MEDIA ASSETS
-- ============================================================
create table if not exists public.media_assets (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  filename     text not null,
  storage_path text not null,
  file_type    text not null,
  size_bytes   bigint not null default 0,
  tags         text[] not null default '{}',
  notes        text,
  created_at   timestamptz not null default now()
);

create index if not exists media_assets_user_id_idx on public.media_assets(user_id);

alter table public.media_assets enable row level security;

create policy "Users can view own media"
  on public.media_assets for select
  using (auth.uid() = user_id);

create policy "Users can insert own media"
  on public.media_assets for insert
  with check (auth.uid() = user_id);

create policy "Users can update own media"
  on public.media_assets for update
  using (auth.uid() = user_id);

create policy "Users can delete own media"
  on public.media_assets for delete
  using (auth.uid() = user_id);

-- ============================================================
-- CAPTION TEMPLATES
-- ============================================================
create table if not exists public.caption_templates (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  pillar     text not null,
  option1    text,
  option2    text,
  hashtags   text[] not null default '{}',
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists caption_templates_user_id_idx on public.caption_templates(user_id);

alter table public.caption_templates enable row level security;

create policy "Users can view own caption templates"
  on public.caption_templates for select
  using (auth.uid() = user_id);

create policy "Users can insert own caption templates"
  on public.caption_templates for insert
  with check (auth.uid() = user_id);

create policy "Users can update own caption templates"
  on public.caption_templates for update
  using (auth.uid() = user_id);

create policy "Users can delete own caption templates"
  on public.caption_templates for delete
  using (auth.uid() = user_id);

-- ============================================================
-- POST MEDIA (links posts to media assets)
-- ============================================================
create table if not exists public.post_media (
  id            uuid primary key default uuid_generate_v4(),
  post_id       uuid not null references public.posts(id) on delete cascade,
  asset_id      uuid not null references public.media_assets(id) on delete cascade,
  display_order int not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists post_media_post_id_idx on public.post_media(post_id);
create index if not exists post_media_asset_id_idx on public.post_media(asset_id);

alter table public.post_media enable row level security;

create policy "Users can view own post media"
  on public.post_media for select
  using (
    exists (
      select 1 from public.posts
      where posts.id = post_media.post_id
      and posts.user_id = auth.uid()
    )
  );

create policy "Users can insert own post media"
  on public.post_media for insert
  with check (
    exists (
      select 1 from public.posts
      where posts.id = post_media.post_id
      and posts.user_id = auth.uid()
    )
  );

create policy "Users can delete own post media"
  on public.post_media for delete
  using (
    exists (
      select 1 from public.posts
      where posts.id = post_media.post_id
      and posts.user_id = auth.uid()
    )
  );

-- ============================================================
-- APPROVED CAPTIONS (AI learning memory)
-- ============================================================
create table if not exists public.approved_captions (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  caption    text not null,
  created_at timestamptz not null default now()
);

create index if not exists approved_captions_user_id_idx on public.approved_captions(user_id);

alter table public.approved_captions enable row level security;

create policy "Users can view own approved captions"
  on public.approved_captions for select
  using (auth.uid() = user_id);

create policy "Users can insert own approved captions"
  on public.approved_captions for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own approved captions"
  on public.approved_captions for delete
  using (auth.uid() = user_id);

-- ============================================================
-- FOLDERS (Media Bank folder tree)
-- ============================================================
create table if not exists public.folders (
  id         text primary key,
  name       text not null,
  parent_id  text,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists folders_user_id_idx on public.folders(user_id);

alter table public.folders enable row level security;

create policy "Users can view own folders"
  on public.folders for select
  using (auth.uid() = user_id);

create policy "Users can insert own folders"
  on public.folders for insert
  with check (auth.uid() = user_id);

create policy "Users can update own folders"
  on public.folders for update
  using (auth.uid() = user_id);

create policy "Users can delete own folders"
  on public.folders for delete
  using (auth.uid() = user_id);

-- ============================================================
-- STORAGE BUCKET
-- Run this separately in SQL editor or via Supabase dashboard:
-- Storage > New bucket > Name: "media" > Public: true
-- ============================================================
-- insert into storage.buckets (id, name, public)
-- values ('media', 'media', true)
-- on conflict (id) do nothing;

-- Storage policies for the media bucket:
-- create policy "Users can upload own media"
--   on storage.objects for insert
--   with check (bucket_id = 'media' and auth.uid()::text = (storage.foldername(name))[1]);
--
-- create policy "Users can view own media"
--   on storage.objects for select
--   using (bucket_id = 'media' and auth.uid()::text = (storage.foldername(name))[1]);
--
-- create policy "Users can delete own media"
--   on storage.objects for delete
--   using (bucket_id = 'media' and auth.uid()::text = (storage.foldername(name))[1]);
--
-- create policy "Public media is accessible"
--   on storage.objects for select
--   using (bucket_id = 'media');
