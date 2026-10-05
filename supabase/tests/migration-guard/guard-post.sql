do $fireova_preservation$
declare
  expected jsonb := current_setting('fireova_migration.expected')::jsonb;
  actual_records jsonb;
  actual_tables jsonb;
  actual_defaults jsonb;
begin
  select jsonb_build_object(
    'posts', (select md5(coalesce(jsonb_agg(to_jsonb(t)-array['source_draft_id','plan_slot_id','planning_date','plan_position'] order by id),'[]'::jsonb)::text) from public.posts t),
    'media_assets', (select md5(coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb)::text) from public.media_assets t),
    'post_media', (select md5(coalesce(jsonb_agg(to_jsonb(t) order by post_id,display_order,id),'[]'::jsonb)::text) from public.post_media t),
    'review_queue', (select md5(coalesce(jsonb_agg(to_jsonb(q)||jsonb_build_object('slots',coalesce((select jsonb_agg(s.value-array['draftId','planSlotId','planningDate','planPosition'] order by s.ordinality) from jsonb_array_elements(q.slots) with ordinality s(value,ordinality)),'[]'::jsonb)) order by user_id),'[]'::jsonb)::text) from public.review_queue q),
    'review_feedback', (select md5(coalesce(jsonb_agg(to_jsonb(t) order by created_at,id),'[]'::jsonb)::text) from public.review_feedback t)
  ) into actual_records;
  if actual_records is distinct from expected->'records' then
    raise exception using errcode='40001', message='Planning migration preservation check failed';
  end if;
  select jsonb_agg(jsonb_build_object('name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'acl',c.relacl::text) order by c.relname)
  into actual_tables from pg_class c where c.relnamespace='public'::regnamespace and c.relname in ('posts','media_assets','post_media','review_queue','review_feedback');
  select jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(defaclrole),'kind',defaclobjtype,'acl',defaclacl::text) order by pg_get_userbyid(defaclrole),defaclobjtype)
  into actual_defaults from pg_default_acl where defaclnamespace='public'::regnamespace;
  if actual_tables is distinct from expected->'schema'->'tables'
    or actual_defaults is distinct from expected->'schema'->'defaults'
    or exists(select 1 from public.posts where source_draft_id is not null or plan_slot_id is not null or planning_date is not null or plan_position is not null)
  then
    raise exception using errcode='40001', message='Planning migration existing access or historical provenance changed';
  end if;
  if (select count(*) from public.content_plan_slots) <> (select count(*) from public.review_queue q cross join lateral jsonb_array_elements(q.slots) s where nullif(trim(s->>'caption'),'') is not null)
    or exists (
      select 1 from public.review_queue q cross join lateral jsonb_array_elements(q.slots) s
      left join public.content_plan_slots p on p.user_id=q.user_id and p.slot_id=s->>'planSlotId'
      where nullif(trim(s->>'caption'),'') is not null and (
        p.slot_id is null or p.state <> 'draft' or p.approved_post_id is not null
        or p.draft_id is distinct from s->>'draftId'
        or p.position is distinct from (s->>'planPosition')::integer
        or p.planning_date is distinct from (s->>'planningDate')::date
      )
    )
  then
    raise exception using errcode='40001', message='Planning migration coverage backfill mismatch';
  end if;
end
$fireova_preservation$;
