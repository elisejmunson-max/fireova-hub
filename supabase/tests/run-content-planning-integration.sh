#!/bin/sh
set -eu

: "${FIREOVA_TEST_DATABASE_URL:?Set FIREOVA_TEST_DATABASE_URL to an isolated local PostgreSQL database named fireova_content_planning_test}"
PSQL=${PSQL:-psql}
DB_NAME=$($PSQL "$FIREOVA_TEST_DATABASE_URL" -Atqc 'select current_database()')
if [ "$DB_NAME" != "fireova_content_planning_test" ]; then
  echo "Refusing destructive fixture reset: database must be named fireova_content_planning_test" >&2
  exit 2
fi


snapshot_unchanged_access() {
  $PSQL "$FIREOVA_TEST_DATABASE_URL" -Atqc "select jsonb_build_object('tables',(select jsonb_agg(jsonb_build_object('name',relname,'acl',relacl::text) order by relname) from pg_class where relnamespace='public'::regnamespace and relname in ('posts','post_media','media_assets','review_queue','review_feedback')),'defaults',(select jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(defaclrole),'kind',defaclobjtype,'acl',defaclacl::text) order by defaclrole,defaclobjtype) from pg_default_acl where defaclnamespace='public'::regnamespace))"
}
snapshot_planning_access() {
  $PSQL "$FIREOVA_TEST_DATABASE_URL" -Atqc "select jsonb_build_object('table',(select relacl::text from pg_class where oid='public.content_plan_slots'::regclass),'functions',(select jsonb_agg(jsonb_build_object('name',oid::regprocedure::text,'acl',proacl::text,'definer',prosecdef) order by oid::regprocedure::text) from pg_proc where pronamespace='public'::regnamespace and proname in ('content_plan_asset_key','content_plan_date','normalize_review_queue_slots','restore_review_queue_identity','protect_review_queue_planning','mark_deleted_approved_slot_removed','save_review_queue_with_plan','approve_review_draft')),'policies',(select jsonb_agg(jsonb_build_object('name',polname,'roles',polroles::text,'using',pg_get_expr(polqual,polrelid),'check',pg_get_expr(polwithcheck,polrelid)) order by polname) from pg_policy where polrelid='public.content_plan_slots'::regclass))"
}

run_owner_suite() {
  MIGRATION_OWNER=$1
ROOT=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
$PSQL "$FIREOVA_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -v migration_owner="$MIGRATION_OWNER" -f "$ROOT/supabase/tests/content-planning-fixture.sql"
UNCHANGED_ACCESS_BEFORE=$(snapshot_unchanged_access)
$PSQL "$FIREOVA_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -c "set role $MIGRATION_OWNER" -f "$ROOT/supabase/content-planning.sql"
PLANNING_ACCESS_FIRST=$(snapshot_planning_access)
test "$(snapshot_unchanged_access)" = "$UNCHANGED_ACCESS_BEFORE"

# Idempotence: repeat migration must preserve the same exact ACLs and leave
# existing-table/default privileges unchanged. This does not claim partial recovery.
$PSQL "$FIREOVA_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -c "set role $MIGRATION_OWNER" -f "$ROOT/supabase/content-planning.sql"
test "$(snapshot_planning_access)" = "$PLANNING_ACCESS_FIRST"
test "$(snapshot_unchanged_access)" = "$UNCHANGED_ACCESS_BEFORE"

$PSQL "$FIREOVA_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/content-planning.integration.sql"

# Two concurrent first saves for an absent queue row: advisory locking permits one create and one conflict.
$PSQL "$FIREOVA_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -c "insert into auth.users(id,email) values('33333333-3333-3333-3333-333333333333','race@example.test'); insert into public.media_assets(id,user_id,filename,storage_path,file_type) values('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','33333333-3333-3333-3333-333333333333','a.jpg','race/a.jpg','image/jpeg'),('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','33333333-3333-3333-3333-333333333333','b.jpg','race/b.jpg','image/jpeg');"
INITIAL_SLOTS='[{"draftId":"race-a","planSlotId":"race-slot-a","planningDate":"2026-10-05","planPosition":0,"assetIds":["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"],"kind":"Photo","caption":"A","originalCaption":"A"},{"draftId":"race-b","planSlotId":"race-slot-b","planningDate":"2026-10-07","planPosition":1,"assetIds":["bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"],"kind":"Photo","caption":"B","originalCaption":"B"}]'
RACE_DIR=$(mktemp -d)
trap 'rm -rf "$RACE_DIR"' EXIT
PGAPPNAME=fireova_first_save_holder ${PSQL} "$FIREOVA_TEST_DATABASE_URL" -Atq >"$RACE_DIR/one" 2>&1 <<SQL &
begin;
select pg_advisory_xact_lock(hashtextextended('33333333-3333-3333-3333-333333333333',0));
select pg_sleep(3);
set role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
select public.save_review_queue_with_plan('$INITIAL_SLOTS'::jsonb,null);
commit;
SQL
FIRST_PID=$!
FIRST_LOCKED=false
for attempt in $(seq 1 100); do
  if test "$($PSQL "$FIREOVA_TEST_DATABASE_URL" -Atqc "select count(*) from pg_locks l join pg_stat_activity a on a.pid=l.pid where a.application_name='fireova_first_save_holder' and l.locktype='advisory' and l.granted")" = 1; then
    FIRST_LOCKED=true
    break
  fi
  sleep 0.02
done
test "$FIRST_LOCKED" = true
PGAPPNAME=fireova_first_save_racer $PSQL "$FIREOVA_TEST_DATABASE_URL" -Atq >"$RACE_DIR/two" 2>&1 <<SQL &
set role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
select public.save_review_queue_with_plan('$INITIAL_SLOTS'::jsonb,null);
SQL
SECOND_PID=$!
SECOND_BLOCKED=false
for attempt in $(seq 1 100); do
  if test "$($PSQL "$FIREOVA_TEST_DATABASE_URL" -Atqc "select count(*) from pg_stat_activity where application_name='fireova_first_save_racer' and wait_event_type='Lock'")" = 1; then
    SECOND_BLOCKED=true
    break
  fi
  sleep 0.02
done
test "$SECOND_BLOCKED" = true
wait "$FIRST_PID"
wait "$SECOND_PID"
grep -q '"conflict": false' "$RACE_DIR/one" "$RACE_DIR/two"
grep -q '"conflict": true' "$RACE_DIR/one" "$RACE_DIR/two"
test "$($PSQL "$FIREOVA_TEST_DATABASE_URL" -Atqc "select count(*) from public.review_queue where user_id='33333333-3333-3333-3333-333333333333'")" = 1

# Two concurrent saves against the same existing version: exactly one wins.
VERSION=$($PSQL "$FIREOVA_TEST_DATABASE_URL" -Atqc "select updated_at from public.review_queue where user_id='33333333-3333-3333-3333-333333333333'")
PAYLOAD_ONE=$(printf '%s' "$INITIAL_SLOTS" | sed 's/"caption":"A"/"caption":"C"/')
PAYLOAD_TWO=$(printf '%s' "$INITIAL_SLOTS" | sed 's/"caption":"A"/"caption":"D"/')
$PSQL "$FIREOVA_TEST_DATABASE_URL" -Atq >"$RACE_DIR/existing-one" 2>&1 <<SQL &
begin;
select pg_advisory_xact_lock(hashtextextended('33333333-3333-3333-3333-333333333333',0));
select pg_sleep(1);
set role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
select public.save_review_queue_with_plan('$PAYLOAD_ONE'::jsonb,'$VERSION');
commit;
SQL
FIRST_PID=$!
sleep 0.2
$PSQL "$FIREOVA_TEST_DATABASE_URL" -Atq >"$RACE_DIR/existing-two" 2>&1 <<SQL &
set role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
select public.save_review_queue_with_plan('$PAYLOAD_TWO'::jsonb,'$VERSION');
SQL
SECOND_PID=$!
wait "$FIRST_PID"
wait "$SECOND_PID"
grep -q '"conflict": false' "$RACE_DIR/existing-one" "$RACE_DIR/existing-two"
grep -q '"conflict": true' "$RACE_DIR/existing-one" "$RACE_DIR/existing-two"

# Two different approvals from one snapshot: one commits atomically, the stale one conflicts; retry then succeeds.
VERSION=$($PSQL "$FIREOVA_TEST_DATABASE_URL" -Atqc "select updated_at from public.review_queue where user_id='33333333-3333-3333-3333-333333333333'")
DRAFT_A=$($PSQL "$FIREOVA_TEST_DATABASE_URL" -Atqc "select slots->0->>'draftId' from public.review_queue where user_id='33333333-3333-3333-3333-333333333333'")
DRAFT_B=$($PSQL "$FIREOVA_TEST_DATABASE_URL" -Atqc "select slots->1->>'draftId' from public.review_queue where user_id='33333333-3333-3333-3333-333333333333'")
$PSQL "$FIREOVA_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -Atq >"$RACE_DIR/approve-a" 2>&1 <<SQL &
\set VERBOSITY verbose
begin;
select pg_advisory_xact_lock(hashtextextended('33333333-3333-3333-3333-333333333333',0));
select pg_sleep(1);
set role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
with q as (select item slot from public.review_queue cross join lateral jsonb_array_elements(slots) item where user_id=auth.uid() and item->>'draftId'='$DRAFT_A')
select public.approve_review_draft(array(select value::uuid from q,jsonb_array_elements_text(slot->'assetIds')),slot->>'caption',slot->>'originalCaption','{}'::text[],slot->>'kind',slot->>'draftId',slot->>'planSlotId',(slot->>'planningDate')::date,(slot->>'planPosition')::integer,'$VERSION') from q;
commit;
SQL
FIRST_PID=$!
sleep 0.2
$PSQL "$FIREOVA_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -Atq >"$RACE_DIR/approve-b" 2>&1 <<SQL &
\set VERBOSITY verbose
set role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
with q as (select item slot from public.review_queue cross join lateral jsonb_array_elements(slots) item where user_id=auth.uid() and item->>'draftId'='$DRAFT_B')
select public.approve_review_draft(array(select value::uuid from q,jsonb_array_elements_text(slot->'assetIds')),slot->>'caption',slot->>'originalCaption','{}'::text[],slot->>'kind',slot->>'draftId',slot->>'planSlotId',(slot->>'planningDate')::date,(slot->>'planPosition')::integer,'$VERSION') from q;
SQL
SECOND_PID=$!
set +e
wait "$FIRST_PID"; FIRST_STATUS=$?
wait "$SECOND_PID"; SECOND_STATUS=$?
set -e
test "$FIRST_STATUS" -eq 0
test "$SECOND_STATUS" -ne 0
grep -q '"ok": true' "$RACE_DIR/approve-a"
grep -q '40001' "$RACE_DIR/approve-b"
test "$($PSQL "$FIREOVA_TEST_DATABASE_URL" -Atqc "select count(*) from public.posts where user_id='33333333-3333-3333-3333-333333333333' and source_draft_id is not null")" = 1
$PSQL "$FIREOVA_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -v remaining_draft="$DRAFT_B" <<'SQL'
set role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
with q as (select item slot,updated_at::text version from public.review_queue cross join lateral jsonb_array_elements(slots) item where user_id=auth.uid() and item->>'draftId'=:'remaining_draft')
select public.approve_review_draft(array(select value::uuid from q,jsonb_array_elements_text(slot->'assetIds')),slot->>'caption',slot->>'originalCaption','{}'::text[],slot->>'kind',slot->>'draftId',slot->>'planSlotId',(slot->>'planningDate')::date,(slot->>'planPosition')::integer,version) from q;
SQL
test "$($PSQL "$FIREOVA_TEST_DATABASE_URL" -Atqc "select count(*) from public.posts where user_id='33333333-3333-3333-3333-333333333333' and source_draft_id is not null")" = 2
test "$($PSQL "$FIREOVA_TEST_DATABASE_URL" -Atqc "select count(*) from public.posts where user_id='33333333-3333-3333-3333-333333333333' and source_draft_id in ('$DRAFT_A','$DRAFT_B')")" = 2
test "$($PSQL "$FIREOVA_TEST_DATABASE_URL" -Atqc "select jsonb_array_length(slots) from public.review_queue where user_id='33333333-3333-3333-3333-333333333333'")" = 0

# Additional auth-guard smoke check: even a privileged caller without a user
# subject is rejected. Actual anon/service-role ACL denial is tested separately.
if $PSQL "$FIREOVA_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -Atqc "select public.save_review_queue_with_plan('[]'::jsonb,null)" >/dev/null 2>&1; then
  echo "subject-less queue save unexpectedly succeeded" >&2
  exit 1
fi

rm -rf "$RACE_DIR"
echo "content planning PostgreSQL integration suite passed for $MIGRATION_OWNER"

}

# Both object-creation roles have broad live Supabase defaults. Exercise each
# in a freshly reset disposable database; this does not alter production roles.
run_owner_suite postgres
run_owner_suite supabase_admin
echo "content planning PostgreSQL integration suite passed for both ACL owners"
