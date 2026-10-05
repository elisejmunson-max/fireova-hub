set transaction isolation level read committed;
set local lock_timeout = '2s';
set local statement_timeout = '30s';
set local transaction_timeout = '60s';
set local idle_in_transaction_session_timeout = '15s';
set local timezone = 'UTC';
set local search_path = pg_catalog, public, extensions;
-- The posts ALTER already requires this lock. NOWAIT avoids a queued outage.
lock table public.posts in access exclusive mode nowait;
lock table public.media_assets, public.post_media, public.review_feedback, public.review_queue in share row exclusive mode nowait;
-- EXPECTED_CONFIGURATION

do $fireova_guard$
declare
  expected jsonb := current_setting('fireova_migration.expected')::jsonb;
  actual jsonb;
begin
  -- SNAPSHOT_QUERY
  if actual is distinct from expected then
    raise exception using errcode='40001', message='Planning migration precondition failed: source records or schema changed';
  end if;
  if (actual->>'version_major')::integer <> 17
    or to_regclass('public.content_plan_slots') is not null
    or exists (select 1 from pg_attribute where attrelid='public.posts'::regclass and not attisdropped and attname in ('source_draft_id','plan_slot_id','planning_date','plan_position'))
    or exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname in ('content_plan_asset_key','content_plan_date','normalize_review_queue_slots','restore_review_queue_identity','protect_review_queue_planning','mark_deleted_approved_slot_removed','save_review_queue_with_plan','approve_review_draft'))
    or exists (select 1 from public.review_queue q cross join lateral jsonb_array_elements(q.slots) s where s ?| array['draftId','planSlotId','planningDate','planPosition'])
  then
    raise exception using errcode='55000', message='Planning migration first-application assumptions failed';
  end if;
end
$fireova_guard$;
