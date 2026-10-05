\set ON_ERROR_STOP on
drop schema if exists public cascade;
drop schema if exists auth cascade;
create schema public;
create schema auth;
create extension if not exists pgcrypto;

-- This fixture runs only in the guarded disposable database. The production
-- migration deliberately does not change schema-wide default ACLs or roles.
\if :{?migration_owner}
\else
\set migration_owner postgres
\endif

do $$ begin create role anon nologin nosuperuser nobypassrls; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin nosuperuser nobypassrls; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin nosuperuser bypassrls; exception when duplicate_object then null; end $$;
do $$ begin create role supabase_admin nologin nosuperuser; exception when duplicate_object then null; end $$;
grant usage on schema public, auth to anon, authenticated, service_role, supabase_admin;
grant create on schema public to supabase_admin;

-- Match the live postgres/public and supabase_admin/public templates before
-- any public application objects are created. Include explicit role grants.
alter default privileges for role postgres, supabase_admin in schema public
  grant all privileges on tables to postgres, anon, authenticated, service_role;
alter default privileges for role postgres, supabase_admin in schema public
  grant execute on functions to postgres, anon, authenticated, service_role;
alter default privileges for role postgres, supabase_admin in schema public
  grant all privileges on sequences to postgres, anon, authenticated, service_role;

create table auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

-- A second full suite creates/migrates the application objects as the other
-- live default-ACL owner, without making that owner a superuser.
grant references on auth.users to supabase_admin;
insert into auth.users(id,email) values
  ('11111111-1111-1111-1111-111111111111','owner@example.test'),
  ('22222222-2222-2222-2222-222222222222','other@example.test');
set role :"migration_owner";

create table public.review_queue (
  user_id uuid primary key references auth.users(id) on delete cascade,
  slots jsonb not null default '[]',
  updated_at timestamptz not null default now()
);
create table public.media_assets (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  filename text not null,
  storage_path text not null,
  file_type text not null,
  size_bytes bigint not null default 0,
  tags text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now()
);
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  pillar text not null,
  topic text,
  format text not null check (format in ('Reel','Carousel','Photo')),
  caption_option1 text,
  caption_option2 text,
  caption_option3 text,
  hashtags text[] not null default '{}',
  shot_ideas text[] not null default '{}',
  status text not null default 'draft',
  scheduled_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  asset_id uuid not null references public.media_assets(id) on delete cascade,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);
create table public.review_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  asset_ids uuid[] not null default '{}',
  format text,
  ai_caption text,
  final_caption text,
  created_at timestamptz not null default now()
);

alter table public.review_queue enable row level security;
alter table public.media_assets enable row level security;
alter table public.posts enable row level security;
alter table public.post_media enable row level security;
alter table public.review_feedback enable row level security;
create policy own_queue on public.review_queue for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy own_media on public.media_assets for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy own_posts on public.posts for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy own_post_media on public.post_media for all
  using (exists(select 1 from public.posts where posts.id=post_media.post_id and posts.user_id=auth.uid()))
  with check (exists(select 1 from public.posts where posts.id=post_media.post_id and posts.user_id=auth.uid()));
create policy own_feedback on public.review_feedback for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
grant select,insert,update,delete on all tables in schema public to authenticated;
grant usage,select on all sequences in schema public to authenticated;

insert into public.media_assets(id,user_id,filename,storage_path,file_type)
select gen_random_uuid(),'11111111-1111-1111-1111-111111111111','asset-'||n||'.jpg','owner/asset-'||n||'.jpg','image/jpeg'
from generate_series(1,8)n;
insert into public.media_assets(id,user_id,filename,storage_path,file_type)
values(gen_random_uuid(),'22222222-2222-2222-2222-222222222222','other.jpg','other/other.jpg','image/jpeg');

-- Fifteen historical approved posts intentionally have no planning provenance.
insert into public.posts(user_id,title,pillar,format,status,caption_option1)
select '11111111-1111-1111-1111-111111111111','Historical '||n,'Approved Posts','Photo','draft','Historical caption '||n
from generate_series(1,15)n;

with assets as (
  select id,row_number() over(order by filename) as n from public.media_assets where user_id='11111111-1111-1111-1111-111111111111' limit 6
), slots as (
  select jsonb_build_object('assetIds',jsonb_build_array(id::text),'kind','Photo','caption','Draft caption '||n,'originalCaption','Draft caption '||n) value,n from assets
)
insert into public.review_queue(user_id,slots,updated_at)
select '11111111-1111-1111-1111-111111111111',jsonb_agg(value order by n),'2026-10-05T01:30:00Z' from slots;


-- Prove the fixture exposes the default-ACL regression before migration.
create function public.fixture_default_acl_probe() returns integer
language sql immutable as $$ select 1 $$;
do $$
declare role_name text; privilege_name text;
begin
  foreach role_name in array array['anon','authenticated','service_role'] loop
    foreach privilege_name in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] loop
      if not has_table_privilege(role_name, 'public.posts', privilege_name) then
        raise exception 'Fixture did not model table default privilege % for %', privilege_name, role_name;
      end if;
    end loop;
    if not exists (
      select 1 from pg_proc fn
      cross join lateral aclexplode(coalesce(fn.proacl, acldefault('f',fn.proowner))) acl
      join pg_roles grantee on grantee.oid=acl.grantee
      where fn.oid='public.fixture_default_acl_probe()'::regprocedure
        and grantee.rolname=role_name and acl.privilege_type='EXECUTE'
    ) then raise exception 'Fixture lacks explicit function EXECUTE for %', role_name; end if;
  end loop;
end $$;
reset role;
