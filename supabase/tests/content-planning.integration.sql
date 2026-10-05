\set ON_ERROR_STOP on
create or replace function public.test_assert(ok boolean, message text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'ASSERTION FAILED: %',message; end if; end $$;
grant execute on function public.test_assert(boolean,text) to authenticated;

set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);

select public.test_assert((select count(*)=6 from public.content_plan_slots where user_id=auth.uid() and state='draft'),'migration backfills exactly six drafts');
select public.test_assert((select array_agg(planning_date order by position)=array['2026-10-05','2026-10-07','2026-10-09','2026-10-12','2026-10-14','2026-10-16']::date[] from public.content_plan_slots where user_id=auth.uid()),'Chicago anchor produces M/W/F dates without UTC drift');
select public.test_assert(public.content_plan_date('2026-10-04',10)='2026-10-28','SQL planning dates continue beyond the former nine-slot horizon');
select public.test_assert((select count(*)=15 from public.posts where user_id=auth.uid() and pillar='Approved Posts' and source_draft_id is null and plan_slot_id is null),'historical approved posts are not current coverage');
select public.test_assert(has_table_privilege('authenticated','public.content_plan_slots','select,insert,update,delete'),'migration grants planning table access');
select public.test_assert(has_function_privilege('authenticated','public.save_review_queue_with_plan(jsonb,text)','execute'),'migration grants queue RPC access');
select public.test_assert(has_function_privilege('authenticated','public.approve_review_draft(uuid[],text,text,text[],text,text,text,date,integer,text)','execute'),'migration grants approval RPC access');

-- Older clients may omit planning keys; the trigger restores identity/date/position.
update public.review_queue set slots=(select jsonb_agg(value - 'draftId' - 'planSlotId' - 'planningDate' - 'planPosition' order by ordinality) from jsonb_array_elements(slots) with ordinality) where user_id=auth.uid();
select public.test_assert((select bool_and(value ?& array['draftId','planSlotId','planningDate','planPosition']) from public.review_queue cross join lateral jsonb_array_elements(slots) where user_id=auth.uid()),'old-client queue saves retain durable provenance');

-- Removing an early item through an old client must not renumber surviving identities.
do $$
declare removed_slot text; surviving_slot text; legacy_slots jsonb;
begin
  select slots->0->>'planSlotId',slots->1->>'planSlotId',(
    select jsonb_agg(value - 'draftId' - 'planSlotId' - 'planningDate' - 'planPosition' order by ordinality)
    from jsonb_array_elements(slots) with ordinality where ordinality > 1
  ) into removed_slot,surviving_slot,legacy_slots from public.review_queue where user_id=auth.uid();
  update public.review_queue set slots=legacy_slots,updated_at=now() where user_id=auth.uid();
  perform public.test_assert((select slots->0->>'planSlotId'=surviving_slot from public.review_queue where user_id=auth.uid()),'old-client removal preserves the surviving slot identity');
  perform public.test_assert((select count(*)=1 from public.content_plan_slots where user_id=auth.uid() and slot_id=removed_slot and state='removed'),'old-client removal records durable removed coverage');
end $$;

-- Stale queue CAS rejects rather than overwriting newer content.
do $$
declare old_version text; first_result jsonb; stale_result jsonb; current_slots jsonb;
begin
  select updated_at::text,slots into old_version,current_slots from public.review_queue where user_id=auth.uid();
  first_result:=public.save_review_queue_with_plan(current_slots,old_version);
  stale_result:=public.save_review_queue_with_plan(current_slots,old_version);
  perform public.test_assert(not coalesce((first_result->>'conflict')::boolean,true),'current CAS succeeds');
  perform public.test_assert(coalesce((stale_result->>'conflict')::boolean,false),'stale CAS conflicts');
end $$;

-- A concurrent caption edit makes the old approval payload stale.
do $$
declare slot jsonb; old_version text; edited jsonb; failed boolean:=false;
begin
  select slots->0,updated_at::text,slots into slot,old_version,edited from public.review_queue where user_id=auth.uid();
  edited:=jsonb_set(edited,'{0,caption}','"Newer saved caption"');
  perform public.save_review_queue_with_plan(edited,old_version);
  begin
    perform public.approve_review_draft(
      array(select value::uuid from jsonb_array_elements_text(slot->'assetIds')),
      slot->>'caption',slot->>'originalCaption','{}'::text[],slot->>'kind',slot->>'draftId',slot->>'planSlotId',
      (slot->>'planningDate')::date,(slot->>'planPosition')::integer,old_version
    );
  exception when serialization_failure then failed:=true; end;
  perform public.test_assert(failed,'stale approval is rejected after concurrent caption edit');
  perform public.test_assert((select count(*)=15 from public.posts where user_id=auth.uid()),'stale approval creates no post');
end $$;

-- Successful approval commits post, media, feedback, coverage and queue removal together.
do $$
declare slot jsonb; reel_slot jsonb; version text; other_version text; result jsonb; save_result jsonb; other_slots jsonb; before_count integer;
begin
  select slots->0,updated_at::text,jsonb_array_length(slots) into slot,version,before_count from public.review_queue where user_id=auth.uid();
  result:=public.approve_review_draft(
    array(select value::uuid from jsonb_array_elements_text(slot->'assetIds')),
    slot->>'caption',slot->>'originalCaption',array['@credited-photo'],slot->>'kind',slot->>'draftId',slot->>'planSlotId',
    (slot->>'planningDate')::date,(slot->>'planPosition')::integer,version
  );
  perform public.test_assert(coalesce((result->>'ok')::boolean,false),'approval reports success');
  perform public.test_assert(jsonb_array_length(result->'coverage')=2 and (select count(*)=1 from jsonb_array_elements(result->'coverage') item where item->>'slotId'=slot->>'planSlotId' and item->>'state'='approved') and (select count(*)=1 from jsonb_array_elements(result->'coverage') item where item->>'state'='removed'),'approval returns approved and pre-existing removed coverage with the queue snapshot');
  perform public.test_assert((select jsonb_array_length(slots)=before_count-1 from public.review_queue where user_id=auth.uid()),'approval removes exactly one queue item');
  perform public.test_assert((select count(*)=1 from public.posts where user_id=auth.uid() and source_draft_id=slot->>'draftId'),'approval creates one provenance post');
  perform public.test_assert((select count(*)=1 from public.content_plan_slots where user_id=auth.uid() and slot_id=slot->>'planSlotId' and state='approved'),'approval marks coverage');
  perform public.test_assert((select count(*)=1 from public.review_feedback where user_id=auth.uid()),'approval records one feedback row');
  perform public.test_assert((select caption_option1=trim(slot->>'caption')||E'\n\nPhoto: @credited-photo' from public.posts where user_id=auth.uid() and source_draft_id=slot->>'draftId'),'credited photo approval preserves canonical copy and appends credit once');

  -- Simulate a lost response for approval X, edit draft Y elsewhere, then retry X.
  select slots,updated_at::text into other_slots,other_version from public.review_queue where user_id=auth.uid();
  other_slots:=jsonb_set(jsonb_set(other_slots,'{0,caption}','"Other-window caption"'),'{0,kind}','"Reel"');
  save_result:=public.save_review_queue_with_plan(other_slots,other_version);
  perform public.test_assert(not coalesce((save_result->>'conflict')::boolean,true),'other-window edit after lost approval response succeeds');
  result:=public.approve_review_draft(
    array(select value::uuid from jsonb_array_elements_text(slot->'assetIds')),
    slot->>'caption',slot->>'originalCaption',array['@credited-photo'],slot->>'kind',slot->>'draftId',slot->>'planSlotId',
    (slot->>'planningDate')::date,(slot->>'planPosition')::integer,version
  );
  perform public.test_assert(coalesce((result->>'repeated')::boolean,false),'fully committed replay is idempotent');
  perform public.test_assert(result->'slots'->0->>'caption'='Other-window caption','replay returns the canonical queue after another draft changed');
  perform public.test_assert(jsonb_array_length(result->'coverage')=2 and (select count(*)=1 from jsonb_array_elements(result->'coverage') item where item->>'slotId'=slot->>'planSlotId' and item->>'state'='approved') and (select count(*)=1 from jsonb_array_elements(result->'coverage') item where item->>'state'='removed'),'replay returns complete canonical coverage with its queue and version');
  save_result:=public.save_review_queue_with_plan(result->'slots',result->>'updatedAt');
  perform public.test_assert(not coalesce((save_result->>'conflict')::boolean,true),'reconciled replay token safely saves the canonical queue');
  perform public.test_assert((select slots->0->>'caption'='Other-window caption' from public.review_queue where user_id=auth.uid()),'replay reconciliation cannot overwrite the other-window edit');
  perform public.test_assert((select count(*)=1 from public.posts where user_id=auth.uid() and source_draft_id=slot->>'draftId'),'replay creates no duplicate post');
  perform public.test_assert((select count(*)=1 from public.review_feedback where user_id=auth.uid()),'replay creates no duplicate feedback');

  select slots->0,updated_at::text into reel_slot,other_version from public.review_queue where user_id=auth.uid();
  result:=public.approve_review_draft(
    array(select value::uuid from jsonb_array_elements_text(reel_slot->'assetIds')),
    reel_slot->>'caption',reel_slot->>'originalCaption',array['@credited-reel'],reel_slot->>'kind',reel_slot->>'draftId',reel_slot->>'planSlotId',
    (reel_slot->>'planningDate')::date,(reel_slot->>'planPosition')::integer,other_version
  );
  perform public.test_assert((select count(*)=1 from jsonb_array_elements(result->'coverage') item where item->>'slotId'=slot->>'planSlotId' and item->>'state'='approved') and (select count(*)=1 from jsonb_array_elements(result->'coverage') item where item->>'slotId'=reel_slot->>'planSlotId' and item->>'state'='approved') and (select count(*)=1 from jsonb_array_elements(result->'coverage') item where item->>'state'='removed'),'second approval response identifies both approvals and pre-existing removed coverage');
  perform public.test_assert((select caption_option1=E'Other-window caption\n\nPhoto: @credited-reel' and format='Reel' from public.posts where user_id=auth.uid() and source_draft_id=reel_slot->>'draftId'),'credited Reel approval preserves canonical copy and appends credit once');
  perform public.test_assert((select count(*)=2 from public.review_feedback where user_id=auth.uid()),'credited photo and Reel each record one feedback row');

  -- Lost X response followed by Y approval: replay X must retain the three unrelated drafts and all coverage rows.
  result:=public.approve_review_draft(
    array(select value::uuid from jsonb_array_elements_text(slot->'assetIds')),
    slot->>'caption',slot->>'originalCaption',array['@credited-photo'],slot->>'kind',slot->>'draftId',slot->>'planSlotId',
    (slot->>'planningDate')::date,(slot->>'planPosition')::integer,version
  );
  perform public.test_assert(coalesce((result->>'repeated')::boolean,false),'lost first approval response remains replayable after the second approval');
  perform public.test_assert(result->'slots'=(select slots from public.review_queue where user_id=auth.uid()),'replay slots exactly equal the authoritative surviving queue');
  perform public.test_assert(result->'coverage'=(select coalesce(jsonb_agg(jsonb_build_object('slotId',slot_id,'position',position,'planningDate',planning_date,'state',state,'approvedPostId',approved_post_id) order by position),'[]'::jsonb) from public.content_plan_slots where user_id=auth.uid() and state in ('approved','skipped','removed')),'replay coverage exactly equals the authoritative planning snapshot');
  perform public.test_assert((select count(*)=1 from jsonb_array_elements(result->'coverage') item where item->>'slotId'=slot->>'planSlotId' and item->>'state'='approved') and (select count(*)=1 from jsonb_array_elements(result->'coverage') item where item->>'slotId'=reel_slot->>'planSlotId' and item->>'state'='approved') and (select count(*)=1 from jsonb_array_elements(result->'coverage') item where item->>'state'='removed'),'replay preserves both stable approved identities and the removed reservation');

  begin
    perform public.save_review_queue_with_plan(
      jsonb_build_array(jsonb_build_object(
        'draftId','replacement-draft','planSlotId',slot->>'planSlotId','planningDate',slot->>'planningDate',
        'planPosition',(slot->>'planPosition')::integer,'assetIds',slot->'assetIds','kind',slot->>'kind',
        'caption','replacement','originalCaption','replacement'
      )),
      (select updated_at::text from public.review_queue where user_id=auth.uid())
    );
    raise exception 'approved identity reuse unexpectedly succeeded';
  exception when others then
    perform public.test_assert(sqlerrm like '%durable coverage%' or sqlerrm like '%duplicate key%','approved identity reuse is rejected');
  end;
end $$;

do $$
declare failed boolean:=false;
begin
  begin
    perform public.approve_review_draft('{}'::uuid[],'','','{}'::text[],'Invalid','','',null,-1,null);
  exception when others then failed:=true; end;
  perform public.test_assert(failed,'invalid approval payload is rejected');
end $$;

do $$
declare failed boolean:=false;
begin
  begin
    insert into public.content_plan_slots(user_id,slot_id,position,planning_date,state,draft_id)
    values(auth.uid(),'invalid-approved-shape',90,current_date,'approved','invalid-draft');
  exception when check_violation then failed:=true; end;
  perform public.test_assert(failed,'database rejects approved coverage without an approved post');
end $$;

-- Failure injection at media insertion rolls back every approval side effect.
reset role;
create or replace function public.fail_test_media_insert() returns trigger language plpgsql as $$ begin if current_setting('fireova.test_fail_media',true)='on' then raise exception 'injected media failure'; end if; return new; end $$;
create trigger fail_test_media_insert before insert on public.post_media for each row execute function public.fail_test_media_insert();
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
do $$
declare slot jsonb; version text; before_queue integer; before_posts integer; failed boolean:=false;
begin
  select slots->0,updated_at::text,jsonb_array_length(slots) into slot,version,before_queue from public.review_queue where user_id=auth.uid();
  select count(*) into before_posts from public.posts where user_id=auth.uid();
  begin
    perform set_config('fireova.test_fail_media','on',true);
    perform public.approve_review_draft(array(select value::uuid from jsonb_array_elements_text(slot->'assetIds')),slot->>'caption',slot->>'originalCaption','{}'::text[],slot->>'kind',slot->>'draftId',slot->>'planSlotId',(slot->>'planningDate')::date,(slot->>'planPosition')::integer,version);
  exception when others then failed:=true; end;
  -- If the configured trigger did not fire, the harness setup is invalid.
  perform public.test_assert(failed,'failure injection interrupts approval');
  perform public.test_assert((select count(*)=before_posts from public.posts where user_id=auth.uid()),'failed approval rolls back post');
  perform public.test_assert((select jsonb_array_length(slots)=before_queue from public.review_queue where user_id=auth.uid()),'failed approval keeps queue item');
end $$;
reset role;
drop trigger fail_test_media_insert on public.post_media;
drop function public.fail_test_media_insert();

-- Owner isolation through RLS.
set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select public.test_assert((select count(*)=0 from public.content_plan_slots),'other owner cannot read planning rows');
select public.test_assert((select count(*)=0 from public.review_queue),'other owner cannot read queue');
reset role;
