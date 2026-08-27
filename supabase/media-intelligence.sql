-- Fireova Content: media intelligence layer
-- Safe additive migration for existing media_assets rows.

alter table public.media_assets
  add column if not exists ai_status text,
  add column if not exists ai_reason text,
  add column if not exists ai_categories text[] not null default '{}',
  add column if not exists ai_post_uses text[] not null default '{}',
  add column if not exists ai_edit_suggestion text,
  add column if not exists ai_quality_score integer,
  add column if not exists ai_duplicate_of uuid references public.media_assets(id) on delete set null,
  add column if not exists ai_reviewed_at timestamptz,
  add column if not exists user_override_status text,
  add column if not exists user_override_reason text,
  add column if not exists used_in_post_count integer not null default 0;

alter table public.media_assets
  drop constraint if exists media_assets_ai_status_check;

alter table public.media_assets
  add constraint media_assets_ai_status_check
  check (ai_status is null or ai_status in ('strong', 'edit', 'skip'));

alter table public.media_assets
  drop constraint if exists media_assets_user_override_status_check;

alter table public.media_assets
  add constraint media_assets_user_override_status_check
  check (user_override_status is null or user_override_status in ('strong', 'edit', 'skip'));

alter table public.media_assets
  drop constraint if exists media_assets_ai_quality_score_check;

alter table public.media_assets
  add constraint media_assets_ai_quality_score_check
  check (ai_quality_score is null or (ai_quality_score between 0 and 100));

create index if not exists media_assets_ai_status_idx on public.media_assets(ai_status);
create index if not exists media_assets_ai_reviewed_at_idx on public.media_assets(ai_reviewed_at desc);
create index if not exists media_assets_used_in_post_count_idx on public.media_assets(used_in_post_count);
