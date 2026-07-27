-- Recipes table
create table if not exists recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  category text not null default 'Other',
  description text,
  yield_amount text,
  oven_temp text,
  cook_time text,
  ingredients jsonb not null default '[]',
  steps jsonb not null default '[]',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table recipes enable row level security;

create policy "Users manage own recipes"
  on recipes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- Training Manuals table
create table if not exists training_manuals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  category text not null default 'Other',
  sections jsonb not null default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table training_manuals enable row level security;

create policy "Users manage own manuals"
  on training_manuals for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
