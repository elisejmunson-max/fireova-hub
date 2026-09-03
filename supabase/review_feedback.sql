-- Fireova Content Brain: persistent review feedback.
-- Run once in the Supabase SQL editor before deploying the feedback-writing app change.
create table if not exists public.review_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('approve','approve_edited','decline_caption','decline_post')),
  asset_ids uuid[] not null default '{}',
  format text,
  ai_caption text,
  final_caption text,
  created_at timestamptz not null default now()
);

alter table public.review_feedback enable row level security;

drop policy if exists "Users manage own review feedback" on public.review_feedback;
create policy "Users manage own review feedback"
on public.review_feedback
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create index if not exists review_feedback_user_created_idx
on public.review_feedback (user_id, created_at desc);
