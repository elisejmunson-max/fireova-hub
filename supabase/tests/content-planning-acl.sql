\set ON_ERROR_STOP on

-- Effective grants, including explicit live-shaped defaults and PUBLIC grants.
-- Check privileges individually: a comma-separated list means ANY, not ALL.
do $$
declare
  role_name text;
  privilege_name text;
  function_name text;
  authenticated_functions text[] := array[
    'public.content_plan_asset_key(jsonb)',
    'public.content_plan_date(date,integer)',
    'public.normalize_review_queue_slots(jsonb,date)',
    'public.restore_review_queue_identity(jsonb,jsonb)',
    'public.save_review_queue_with_plan(jsonb,text)',
    'public.approve_review_draft(uuid[],text,text,text[],text,text,text,date,integer,text)'
  ];
  planning_functions text[] := array[
    'public.content_plan_asset_key(jsonb)',
    'public.content_plan_date(date,integer)',
    'public.normalize_review_queue_slots(jsonb,date)',
    'public.restore_review_queue_identity(jsonb,jsonb)',
    'public.protect_review_queue_planning()',
    'public.mark_deleted_approved_slot_removed()',
    'public.save_review_queue_with_plan(jsonb,text)',
    'public.approve_review_draft(uuid[],text,text,text[],text,text,text,date,integer,text)'
  ];
begin
  foreach role_name in array array['public','anon','service_role'] loop
    foreach privilege_name in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] loop
      perform public.test_assert(not has_table_privilege(role_name,'public.content_plan_slots',privilege_name),role_name||' lacks planning '||privilege_name);
    end loop;
  end loop;
  foreach privilege_name in array array['SELECT','INSERT','UPDATE','DELETE'] loop
    perform public.test_assert(has_table_privilege('authenticated','public.content_plan_slots',privilege_name),'authenticated has planning '||privilege_name);
  end loop;
  foreach privilege_name in array array['TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] loop
    perform public.test_assert(not has_table_privilege('authenticated','public.content_plan_slots',privilege_name),'authenticated lacks planning '||privilege_name);
  end loop;
  foreach privilege_name in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] loop
    perform public.test_assert(not has_table_privilege('authenticated','public.content_plan_slots',privilege_name||' WITH GRANT OPTION'),'authenticated cannot grant planning '||privilege_name);
  end loop;
  foreach function_name in array planning_functions loop
    foreach role_name in array array['public','anon','service_role'] loop
      perform public.test_assert(not has_function_privilege(role_name,function_name,'EXECUTE'),role_name||' cannot execute '||function_name);
    end loop;
    perform public.test_assert(has_function_privilege('authenticated',function_name,'EXECUTE')=(function_name=any(authenticated_functions)),'authenticated EXECUTE matches allowlist: '||function_name);
    perform public.test_assert(not has_function_privilege('authenticated',function_name,'EXECUTE WITH GRANT OPTION'),'authenticated cannot grant '||function_name);
    perform public.test_assert((select not prosecdef from pg_proc where oid=function_name::regprocedure),'planning function is invoker: '||function_name);
  end loop;
  perform public.test_assert((select relrowsecurity from pg_class where oid='public.content_plan_slots'::regclass),'planning RLS enabled');
  perform public.test_assert((select count(*)=1 and bool_and(polroles=array[(select oid from pg_roles where rolname='authenticated')]) from pg_policy where polrelid='public.content_plan_slots'::regclass),'planning policy is scoped only to authenticated');
  perform public.test_assert((select rolbypassrls and not rolsuper from pg_roles where rolname='service_role'),'fixture models service-role BYPASSRLS without superuser');
  perform public.test_assert((select count(*)=2 and bool_and(not rolsuper and not rolbypassrls) from pg_roles where rolname in ('anon','authenticated')),'client roles cannot bypass RLS');
  perform public.test_assert(not exists(select 1 from pg_auth_members membership join pg_roles member_role on member_role.oid=membership.member where member_role.rolname in ('anon','authenticated','service_role')),'fixture client roles have no hidden role memberships');
end $$;

-- An actual anonymous-role call must fail at ACL checking, not merely reach the
-- auth.uid guard as it did when executed as postgres with no subject.
set role anon;
select set_config('request.jwt.claim.sub','',false);
do $$
declare denied boolean;
begin
  denied:=false;
  begin
    perform public.save_review_queue_with_plan('[]'::jsonb,null);
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'anon queue RPC unexpectedly executable'; end if;
  denied:=false;
  begin
    perform public.approve_review_draft('{}'::uuid[],'x','x','{}'::text[],'Photo','x','x',current_date,0,null);
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'anon approval RPC unexpectedly executable'; end if;
end $$;
reset role;

set role service_role;
select set_config('request.jwt.claim.sub','',false);
do $$
declare denied boolean;
begin
  denied:=false;
  begin
    perform public.save_review_queue_with_plan('[]'::jsonb,null);
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'service-role planning RPC unexpectedly executable'; end if;
end $$;
reset role;

-- Authenticated has EXECUTE, but an absent user subject is still rejected.
set role authenticated;
select set_config('request.jwt.claim.sub','',false);
do $$
declare denied boolean:=false;
begin
  begin
    perform public.save_review_queue_with_plan('[]'::jsonb,null);
  exception when raise_exception then
    if sqlerrm <> 'Unauthorized' then raise; end if;
    denied:=true;
  end;
  if not denied then raise exception 'missing authenticated subject unexpectedly accepted'; end if;
end $$;

-- Failure-safe: if TRUNCATE unexpectedly succeeds, the raised error rolls back
-- this entire DO statement, so the disposable fixture is not silently emptied.
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
do $$
declare denied boolean:=false;
begin
  begin
    truncate table public.content_plan_slots;
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'authenticated TRUNCATE unexpectedly succeeded'; end if;
end $$;
reset role;
