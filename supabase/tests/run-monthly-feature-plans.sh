#!/usr/bin/env bash
set -euo pipefail
: "${FIREOVA_TEST_DATABASE_URL:?Requires a disposable test database}"
# Never allow a production host/database, even if this script is run accidentally.
node -e 'const u=new URL(process.env.FIREOVA_TEST_DATABASE_URL);if(!["localhost","127.0.0.1"].includes(u.hostname)||u.pathname!=="/fireova_content_planning_test")throw Error("Disposable local test database required")'
owner="${MIGRATION_OWNER:-postgres}"
[[ "$owner" == postgres || "$owner" == supabase_admin ]] || exit 2
sql() { psql "$FIREOVA_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 "$@"; }
apply() { { printf 'set role %s;\n' "$owner"; cat "$1"; } | sql; }
sql -v migration_owner="$owner" -f supabase/tests/content-planning-fixture.sql
apply supabase/content-planning.sql
sql <<'SQL'
create or replace function public.test_assert(ok boolean, message text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'ASSERTION FAILED: %',message; end if; end $$;
grant execute on function public.test_assert(boolean,text) to authenticated;
SQL
# Record old application data and ACLs without assuming any production values.
sql -Atc "select md5(jsonb_build_object('queue',(select jsonb_agg(to_jsonb(q) order by user_id) from review_queue q),'posts',(select jsonb_agg(to_jsonb(p) order by id) from posts p),'media',(select jsonb_agg(to_jsonb(m) order by id) from media_assets m),'links',(select jsonb_agg(to_jsonb(m) order by id) from post_media m),'feedback',(select jsonb_agg(to_jsonb(m) order by id) from review_feedback m),'planning',(select jsonb_agg(to_jsonb(m) order by user_id,slot_id) from content_plan_slots m),'acl',(select jsonb_agg(jsonb_build_array(oid::regclass::text,relacl) order by oid) from pg_class where relnamespace='public'::regnamespace))::text);" > /tmp/monthly-before.txt
apply supabase/monthly-feature-plans.sql
sql -f supabase/tests/monthly-feature-plans.integration.sql
sql -Atc "select md5(jsonb_agg(to_jsonb(m) order by user_id,month)::text) from monthly_feature_plans m;" > /tmp/monthly-rows-before.txt
apply supabase/monthly-feature-plans.sql
sql -Atc "select md5(jsonb_agg(to_jsonb(m) order by user_id,month)::text) from monthly_feature_plans m;" > /tmp/monthly-rows-after.txt
cmp /tmp/monthly-rows-before.txt /tmp/monthly-rows-after.txt
sql -Atc "select md5(jsonb_build_object('queue',(select jsonb_agg(to_jsonb(q) order by user_id) from review_queue q),'posts',(select jsonb_agg(to_jsonb(p) order by id) from posts p),'media',(select jsonb_agg(to_jsonb(m) order by id) from media_assets m),'links',(select jsonb_agg(to_jsonb(m) order by id) from post_media m),'feedback',(select jsonb_agg(to_jsonb(m) order by id) from review_feedback m),'planning',(select jsonb_agg(to_jsonb(m) order by user_id,slot_id) from content_plan_slots m),'acl',(select jsonb_agg(jsonb_build_array(oid::regclass::text,relacl) order by oid) from pg_class where relnamespace='public'::regnamespace and relname not like 'monthly_feature_plans%'))::text);" > /tmp/monthly-after.txt
cmp /tmp/monthly-before.txt /tmp/monthly-after.txt
# Two simultaneous transactions use the same expected revision. Exactly one wins.
cas() { sql -At <<'SQL'
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true);
with changed as (update monthly_feature_plans set priorities='[]',revision=3 where user_id=auth.uid() and month='2026-10-01' and revision=2 returning *) select 'changed='||count(*) from changed;
select pg_sleep(0.3);
commit;
SQL
}
cas > /tmp/monthly-cas-a.txt & a=$!
cas > /tmp/monthly-cas-b.txt & b=$!
wait "$a"; wait "$b"
[[ "$(grep -h '^changed=1$' /tmp/monthly-cas-{a,b}.txt | wc -l)" == 1 ]]
[[ "$(grep -h '^changed=0$' /tmp/monthly-cas-{a,b}.txt | wc -l)" == 1 ]]
sql -c "select public.test_assert((select revision=3 and priorities='[]'::jsonb from monthly_feature_plans where user_id='11111111-1111-1111-1111-111111111111' and month='2026-10-01'),'one concurrent update committed');"
# Two concurrent first writes: one creates revision 1, one gets unique_violation.
sql <<'SQL'
create function public.test_initial_monthly_insert() returns boolean language plpgsql security invoker as $$
begin
  insert into public.monthly_feature_plans(user_id,month,priorities,revision) values(auth.uid(),'2026-12-01','[]',1);
  return true;
exception when unique_violation then return false;
end;
$$;
grant execute on function public.test_initial_monthly_insert() to authenticated;
SQL
initial() { sql -At <<'SQL'
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true);
select 'inserted='||public.test_initial_monthly_insert();
select pg_sleep(0.3);
commit;
SQL
}
initial > /tmp/monthly-insert-a.txt & a=$!
initial > /tmp/monthly-insert-b.txt & b=$!
wait "$a"; wait "$b"
[[ "$(grep -h '^inserted=true$' /tmp/monthly-insert-{a,b}.txt | wc -l)" == 1 ]]
[[ "$(grep -h '^inserted=false$' /tmp/monthly-insert-{a,b}.txt | wc -l)" == 1 ]]
sql -c "select public.test_assert((select count(*)=1 and min(revision)=1 from monthly_feature_plans where user_id='11111111-1111-1111-1111-111111111111' and month='2026-12-01'),'one concurrent insert committed');"
echo "Monthly feature owner=$owner migration, ACL, RLS, bounds, repeatability, preservation, concurrent insert and CAS passed."

