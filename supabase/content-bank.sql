-- Cross-device Content Bank records.
-- The media binary lives in Storage; the complete editable record lives here.

create table if not exists public.content_bank_items (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_bank_items_user_updated_idx
  on public.content_bank_items (user_id, updated_at desc);

alter table public.content_bank_items enable row level security;

create policy "Users can view own content bank items"
  on public.content_bank_items for select to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own content bank items"
  on public.content_bank_items for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own content bank items"
  on public.content_bank_items for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own content bank items"
  on public.content_bank_items for delete to authenticated
  using (auth.uid() = user_id);

