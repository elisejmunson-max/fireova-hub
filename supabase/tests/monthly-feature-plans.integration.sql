\set ON_ERROR_STOP on
-- Fake owner fixtures only. Test as a real non-superuser/non-BYPASSRLS role.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true);
select public.test_assert(not (select rolsuper or rolbypassrls from pg_roles where rolname=current_user), 'RLS test role cannot bypass policies');
select public.test_assert(row_security_active('public.monthly_feature_plans'), 'monthly feature RLS active');
insert into public.monthly_feature_plans(user_id,month,priorities,revision) values
('11111111-1111-1111-1111-111111111111','2026-10-01','[{"id":"00000000-0000-4000-8000-000000000001","text":"Keep exact menu note"}]',1);
select public.test_assert((select revision=1 and priorities->0->>'text'='Keep exact menu note' from public.monthly_feature_plans where month='2026-10-01'), 'create exact note');
update public.monthly_feature_plans set priorities='[{"id":"00000000-0000-4000-8000-000000000001","text":"Edited note"}]',revision=2 where user_id=auth.uid() and month='2026-10-01' and revision=1;
select public.test_assert((select revision=2 and priorities->0->>'text'='Edited note' from public.monthly_feature_plans where month='2026-10-01'), 'CAS edit');
with stale as (update public.monthly_feature_plans set priorities='[]',revision=2 where user_id=auth.uid() and month='2026-10-01' and revision=1 returning *) select public.test_assert((select count(*) from stale)=0,'stale revision does not overwrite');
insert into public.monthly_feature_plans(user_id,month,priorities,revision) values ('11111111-1111-1111-1111-111111111111','2026-11-01','[]',1);
select public.test_assert((select count(*) from public.monthly_feature_plans)=2,'months are independent');

do $$ begin
  begin insert into public.monthly_feature_plans(user_id,month,priorities,revision) values (auth.uid(),'2026-10-01','[]',1); raise exception 'insert race accepted'; exception when unique_violation then null; end;
  begin insert into public.monthly_feature_plans(user_id,month,priorities,revision) values ('22222222-2222-2222-2222-222222222222','2026-12-01','[]',1); raise exception 'cross owner accepted'; exception when insufficient_privilege then null; end;
  begin update public.monthly_feature_plans set revision=10 where month='2026-10-01'; raise exception 'revision jump accepted'; exception when invalid_parameter_value then null; end;
  begin update public.monthly_feature_plans set month='2026-12-01',revision=3 where month='2026-10-01'; raise exception 'month move accepted'; exception when invalid_parameter_value then null; end;
  begin update public.monthly_feature_plans set user_id='22222222-2222-2222-2222-222222222222',revision=3 where month='2026-10-01'; raise exception 'owner move accepted'; exception when invalid_parameter_value or insufficient_privilege then null; end;
  begin update public.monthly_feature_plans set priorities='{}',revision=3 where month='2026-10-01'; raise exception 'object accepted'; exception when invalid_parameter_value then null; end;
  begin update public.monthly_feature_plans set priorities='[null]',revision=3 where month='2026-10-01'; raise exception 'null item accepted'; exception when invalid_parameter_value then null; end;
  begin update public.monthly_feature_plans set priorities='[{"id":"bad","text":"note"}]',revision=3 where month='2026-10-01'; raise exception 'bad ID accepted'; exception when invalid_parameter_value then null; end;
  begin update public.monthly_feature_plans set priorities='[{"id":"00000000-0000-4000-8000-000000000001","text":"note","extra":true}]',revision=3 where month='2026-10-01'; raise exception 'extra key accepted'; exception when invalid_parameter_value then null; end;
  begin update public.monthly_feature_plans set priorities='[{"id":"00000000-0000-4000-8000-000000000001","text":" "}]',revision=3 where month='2026-10-01'; raise exception 'blank accepted'; exception when invalid_parameter_value then null; end;
  begin update public.monthly_feature_plans set priorities=jsonb_build_array(jsonb_build_object('id','00000000-0000-4000-8000-000000000001','text',repeat('x',1001))),revision=3 where month='2026-10-01'; raise exception 'long note accepted'; exception when invalid_parameter_value then null; end;
  begin update public.monthly_feature_plans set priorities=(select jsonb_agg(jsonb_build_object('id','00000000-0000-4000-8000-'||lpad(i::text,12,'0'),'text','note')) from generate_series(1,21) i),revision=3 where month='2026-10-01'; raise exception '21 notes accepted'; exception when invalid_parameter_value then null; end;
  begin update public.monthly_feature_plans set priorities='[{"id":"00000000-0000-4000-8000-000000000001","text":"a"},{"id":"00000000-0000-4000-8000-000000000001","text":"b"}]',revision=3 where month='2026-10-01'; raise exception 'duplicate IDs accepted'; exception when invalid_parameter_value then null; end;
  begin insert into public.monthly_feature_plans(user_id,month,priorities,revision) values (auth.uid(),'2026-12-02','[]',1); raise exception 'mid-month key accepted'; exception when check_violation then null; end;
  begin delete from public.monthly_feature_plans where month='2026-10-01'; raise exception 'DELETE allowed'; exception when insufficient_privilege then null; end;
  begin truncate public.monthly_feature_plans; raise exception 'TRUNCATE allowed'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',true);
select public.test_assert((select count(*) from public.monthly_feature_plans)=0,'other owner cannot read');
with other_write as (update public.monthly_feature_plans set priorities='[]',revision=3 where user_id='11111111-1111-1111-1111-111111111111' and month='2026-10-01' and revision=2 returning *) select public.test_assert((select count(*) from other_write)=0,'other owner cannot update');
insert into public.monthly_feature_plans(user_id,month,priorities,revision) values(auth.uid(),'2026-10-01','[{"id":"00000000-0000-4000-8000-000000000002","text":"Other owner private"}]',1);
commit;

-- Every role and object ACL is asserted, including BYPASSRLS service_role.
select public.test_assert((select bool_and(has_table_privilege('authenticated','public.monthly_feature_plans',privilege)) from unnest(array['SELECT','INSERT','UPDATE']) as required(privilege)), 'owner client allowed expected table actions');
select public.test_assert(not has_table_privilege('authenticated','public.monthly_feature_plans','DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'), 'owner client lacks destructive/schema privileges');
select public.test_assert(not has_table_privilege('anon','public.monthly_feature_plans','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'), 'anonymous has no table access');
select public.test_assert(not has_table_privilege('service_role','public.monthly_feature_plans','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'), 'service role has no table access');
select public.test_assert(not has_function_privilege('authenticated','public.validate_monthly_feature_plan()','EXECUTE') and not has_function_privilege('anon','public.validate_monthly_feature_plan()','EXECUTE') and not has_function_privilege('service_role','public.validate_monthly_feature_plan()','EXECUTE'), 'trigger has no client execute');
select public.test_assert(not (select prosecdef from pg_proc where oid='public.validate_monthly_feature_plan()'::regprocedure),'no definer function');
select public.test_assert(not exists(select 1 from pg_class c cross join lateral aclexplode(c.relacl) a where c.oid='public.monthly_feature_plans'::regclass and a.grantee=0), 'PUBLIC has no table privileges');
select public.test_assert(not exists(select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a where p.oid='public.validate_monthly_feature_plan()'::regprocedure and a.grantee=0), 'PUBLIC has no function privileges');
