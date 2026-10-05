-- Review-only additive migration. Apply only after explicit production approval.
-- No credentials, role changes, schema default ACL changes, or existing-row writes.
begin;
create table if not exists public.monthly_feature_plans (
  user_id uuid not null references auth.users(id) on delete cascade,
  month date not null check (month >= date '2000-01-01' and month <= date '2100-12-01' and extract(day from month) = 1),
  priorities jsonb not null default '[]'::jsonb,
  revision integer not null check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, month)
);
alter table public.monthly_feature_plans enable row level security;
drop policy if exists "Read own monthly features" on public.monthly_feature_plans;
create policy "Read own monthly features" on public.monthly_feature_plans for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Create own monthly features" on public.monthly_feature_plans;
create policy "Create own monthly features" on public.monthly_feature_plans for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Edit own monthly features" on public.monthly_feature_plans;
create policy "Edit own monthly features" on public.monthly_feature_plans for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.validate_monthly_feature_plan()
returns trigger language plpgsql security invoker set search_path = pg_catalog, public as $$
declare item jsonb; ids text[] := '{}'; item_id text; item_text text;
begin
  if jsonb_typeof(new.priorities) is distinct from 'array' then raise exception 'Priorities must be an array' using errcode = '22023'; end if;
  if jsonb_array_length(new.priorities) > 20 or octet_length(new.priorities::text) > 65536 then raise exception 'Too many priorities' using errcode = '22023'; end if;
  for item in select value from jsonb_array_elements(new.priorities) loop
    if jsonb_typeof(item) is distinct from 'object' then raise exception 'Invalid priority' using errcode = '22023'; end if;
    if (select array_agg(key order by key) from jsonb_object_keys(item) as k(key)) is distinct from array['id','text']::text[]
      or jsonb_typeof(item->'id') is distinct from 'string' or jsonb_typeof(item->'text') is distinct from 'string' then raise exception 'Invalid priority fields' using errcode = '22023'; end if;
    item_id := item->>'id'; item_text := item->>'text';
    if item_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or item_id = any(ids)
      or length(btrim(item_text, E' \t\n\r')) = 0 or length(item_text) > 1000
      or translate(item_text, E'\t\n\r', '') ~ '[[:cntrl:]]' then raise exception 'Invalid priority value' using errcode = '22023'; end if;
    ids := array_append(ids, item_id);
  end loop;
  if tg_op = 'INSERT' then
    if new.revision <> 1 then raise exception 'Initial revision must be 1' using errcode = '22023'; end if;
    new.created_at := clock_timestamp();
  else
    if new.user_id is distinct from old.user_id or new.month is distinct from old.month or new.revision::bigint <> old.revision::bigint + 1 then raise exception 'Invalid monthly feature revision' using errcode = '22023'; end if;
    new.created_at := old.created_at;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
drop trigger if exists validate_monthly_feature_plan on public.monthly_feature_plans;
create trigger validate_monthly_feature_plan before insert or update on public.monthly_feature_plans for each row execute function public.validate_monthly_feature_plan();

-- Normalize only these new objects, including explicit Supabase default grants.
revoke all privileges on table public.monthly_feature_plans from public, anon, authenticated, service_role;
grant select, insert, update on table public.monthly_feature_plans to authenticated;
revoke all privileges on function public.validate_monthly_feature_plan() from public, anon, authenticated, service_role;
notify pgrst, 'reload schema';
commit;
