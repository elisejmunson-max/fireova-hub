create table if not exists public.review_queue (
  user_id uuid primary key references auth.users(id) on delete cascade,
  slots jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.review_queue enable row level security;
drop policy if exists "Users manage own review queue" on public.review_queue;
create policy "Users manage own review queue" on public.review_queue for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
