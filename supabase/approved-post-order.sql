-- Fireova Content: cloud-backed order for the Approved Posts Instagram grid.
-- Run once in the Supabase SQL editor before deploying the grid reorder feature.
alter table public.posts
  add column if not exists sort_order integer;

create index if not exists posts_user_pillar_sort_order_idx
  on public.posts (user_id, pillar, sort_order);
