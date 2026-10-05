-- Additive editorial planning identity. planning_date is never a publish schedule.
begin;
alter table public.posts add column if not exists source_draft_id text;
alter table public.posts add column if not exists plan_slot_id text;
alter table public.posts add column if not exists planning_date date;
alter table public.posts add column if not exists plan_position integer;

create unique index if not exists posts_user_source_draft_uidx
  on public.posts (user_id, source_draft_id)
  where source_draft_id is not null;
create index if not exists posts_user_plan_slot_idx
  on public.posts (user_id, plan_slot_id)
  where plan_slot_id is not null;
create unique index if not exists posts_user_id_uidx on public.posts (user_id, id);

create table if not exists public.content_plan_slots (
  user_id uuid not null references auth.users(id) on delete cascade,
  slot_id text not null,
  position integer not null check (position >= 0),
  planning_date date,
  state text not null check (state in ('open', 'draft', 'approved', 'skipped', 'removed')),
  draft_id text,
  approved_post_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, slot_id)
);
do $$ begin
  alter table public.content_plan_slots add constraint content_plan_slots_state_shape_check check (
    (state = 'approved' and approved_post_id is not null and draft_id is not null) or
    (state = 'draft' and approved_post_id is null and draft_id is not null) or
    (state in ('open', 'skipped', 'removed') and approved_post_id is null)
  );
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.content_plan_slots add constraint content_plan_slots_owner_post_fk foreign key (user_id, approved_post_id) references public.posts(user_id, id);
exception when duplicate_object then null; end $$;

create unique index if not exists content_plan_slots_user_draft_uidx
  on public.content_plan_slots (user_id, draft_id)
  where draft_id is not null;
create index if not exists content_plan_slots_user_position_idx
  on public.content_plan_slots (user_id, position);
create unique index if not exists content_plan_slots_user_position_uidx
  on public.content_plan_slots (user_id, position);

alter table public.content_plan_slots enable row level security;
drop policy if exists "Users manage own content plan" on public.content_plan_slots;
create policy "Users manage own content plan"
  on public.content_plan_slots for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.content_plan_asset_key(p_slot jsonb)
returns text language sql immutable set search_path = public as $$
  select coalesce(string_agg(asset.value, '-' order by asset.ordinality), 'missing')
  from jsonb_array_elements_text(coalesce(p_slot->'assetIds', '[]'::jsonb)) with ordinality as asset(value, ordinality)
$$;

create or replace function public.content_plan_date(p_anchor date, p_position integer)
returns date language sql immutable set search_path = public as $$
  with basis as (
    select
      p_anchor - (extract(isodow from p_anchor)::integer - 1) as week_start,
      case
        when extract(isodow from p_anchor) <= 1 then 0
        when extract(isodow from p_anchor) <= 3 then 1
        when extract(isodow from p_anchor) <= 5 then 2
        else 3
      end + greatest(p_position, 0) as sequence_position
  )
  select week_start + (
    (sequence_position / 3) * 7 +
    case sequence_position % 3 when 0 then 0 when 1 then 2 else 4 end
  )::integer
  from basis
$$;

create or replace function public.normalize_review_queue_slots(p_slots jsonb, p_anchor date)
returns jsonb language sql immutable set search_path = public as $$
  select coalesce(jsonb_agg(
    item.value || jsonb_build_object(
      'draftId', coalesce(nullif(item.value->>'draftId', ''), 'draft-' || (item.ordinality - 1)::text || '-' || public.content_plan_asset_key(item.value)),
      'planSlotId', coalesce(nullif(item.value->>'planSlotId', ''), 'slot-' || (item.ordinality - 1)::text || '-' || public.content_plan_asset_key(item.value)),
      'planPosition', coalesce((item.value->>'planPosition')::integer, (item.ordinality - 1)::integer),
      'planningDate', coalesce(nullif(item.value->>'planningDate', ''), public.content_plan_date(p_anchor, coalesce((item.value->>'planPosition')::integer, (item.ordinality - 1)::integer))::text)
    ) order by item.ordinality
  ), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_slots, '[]'::jsonb)) with ordinality as item(value, ordinality)
$$;

-- Older clients serialize only fields they know. Recover a unique prior identity by media and
-- format before applying deterministic identity to genuinely new drafts.
create or replace function public.restore_review_queue_identity(p_slots jsonb, p_old_slots jsonb)
returns jsonb language plpgsql immutable set search_path = public as $$
declare
  v_item jsonb;
  v_match jsonb;
  v_matches integer;
  v_result jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_slots) <> 'array' then return p_slots; end if;
  for v_item in select value from jsonb_array_elements(p_slots)
  loop
    if nullif(v_item->>'draftId', '') is null or nullif(v_item->>'planSlotId', '') is null then
      select count(*), (jsonb_agg(candidate.value)->0)
      into v_matches, v_match
      from jsonb_array_elements(coalesce(p_old_slots, '[]'::jsonb)) candidate(value)
      where candidate.value->'assetIds' = v_item->'assetIds'
        and candidate.value->>'kind' = v_item->>'kind';
      if v_matches > 1 then raise exception 'Ambiguous legacy review queue identity'; end if;
      if v_matches = 1 then
        v_item := v_item || jsonb_build_object(
          'draftId', v_match->>'draftId',
          'planSlotId', v_match->>'planSlotId',
          'planPosition', (v_match->>'planPosition')::integer,
          'planningDate', v_match->>'planningDate'
        );
      end if;
    end if;
    v_result := v_result || jsonb_build_array(v_item);
  end loop;
  return v_result;
end;
$$;

create or replace function public.protect_review_queue_planning()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  v_anchor date;
  v_old_slot jsonb;
  v_new_slot jsonb;
begin
  v_anchor := coalesce(
    case when tg_op = 'UPDATE' then (old.updated_at at time zone 'America/Chicago')::date end,
    (new.updated_at at time zone 'America/Chicago')::date,
    (now() at time zone 'America/Chicago')::date
  );
  if tg_op = 'UPDATE' then
    new.slots := public.restore_review_queue_identity(new.slots, old.slots);
  end if;
  new.slots := public.normalize_review_queue_slots(new.slots, v_anchor);

  if tg_op = 'UPDATE' then
    for v_old_slot in select value from jsonb_array_elements(public.normalize_review_queue_slots(old.slots, v_anchor))
    loop
      if not exists (
        select 1 from jsonb_array_elements(new.slots) current_slot
        where current_slot->>'planSlotId' = v_old_slot->>'planSlotId'
      ) then
        update public.content_plan_slots
        set state = 'removed', updated_at = new.updated_at
        where user_id = new.user_id
          and slot_id = v_old_slot->>'planSlotId'
          and state = 'draft';
      end if;
    end loop;
  end if;

  for v_new_slot in select value from jsonb_array_elements(new.slots)
  loop
    if nullif(trim(v_new_slot->>'caption'), '') is not null then
      insert into public.content_plan_slots (user_id, slot_id, position, planning_date, state, draft_id, updated_at)
      values (new.user_id, v_new_slot->>'planSlotId', (v_new_slot->>'planPosition')::integer, (v_new_slot->>'planningDate')::date, 'draft', v_new_slot->>'draftId', new.updated_at)
      on conflict (user_id, slot_id) do update set
        position = excluded.position,
        planning_date = excluded.planning_date,
        updated_at = excluded.updated_at
      where public.content_plan_slots.state = 'draft'
        and public.content_plan_slots.draft_id = excluded.draft_id;
      if not found then raise exception 'Planning identity conflicts with durable coverage'; end if;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists protect_review_queue_planning on public.review_queue;
create trigger protect_review_queue_planning
before insert or update of slots on public.review_queue
for each row execute function public.protect_review_queue_planning();

-- Persist the normalized identity/date metadata into the queue JSON first, in the same transaction.
update public.review_queue
set slots = public.normalize_review_queue_slots(slots, (updated_at at time zone 'America/Chicago')::date);

-- Preserve current queue order. Dates use each queue's America/Chicago calendar day.
insert into public.content_plan_slots (user_id, slot_id, position, planning_date, state, draft_id)
select
  queue.user_id,
  slot.value->>'planSlotId',
  (slot.value->>'planPosition')::integer,
  (slot.value->>'planningDate')::date,
  'draft',
  slot.value->>'draftId'
from public.review_queue queue
cross join lateral jsonb_array_elements(queue.slots) with ordinality as slot(value, ordinality)
where nullif(trim(slot.value->>'caption'), '') is not null
on conflict (user_id, slot_id) do nothing;

create or replace function public.save_review_queue_with_plan(
  p_slots jsonb,
  p_expected_updated_at text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing timestamptz;
  v_updated timestamptz := now();
  v_slot jsonb;
begin
  if v_user_id is null then raise exception 'Unauthorized'; end if;
  if jsonb_typeof(p_slots) <> 'array' or jsonb_array_length(p_slots) > 100 then raise exception 'Invalid review queue'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  select updated_at into v_existing
  from public.review_queue
  where user_id = v_user_id
  for update;

  if (
    (p_expected_updated_at is null and v_existing is not null) or
    (p_expected_updated_at is not null and (v_existing is null or v_existing <> p_expected_updated_at::timestamptz))
  ) then
    return jsonb_build_object('conflict', true);
  end if;

  p_slots := public.normalize_review_queue_slots(
    p_slots,
    coalesce((v_existing at time zone 'America/Chicago')::date, (v_updated at time zone 'America/Chicago')::date)
  );
  if exists (
    select 1 from jsonb_array_elements(p_slots) slot
    where coalesce(jsonb_typeof(slot->'assetIds'),'null') <> 'array'
      or jsonb_array_length(slot->'assetIds') not between 1 and 10
      or nullif(trim(slot->>'caption'), '') is null
      or coalesce(slot->>'kind','') not in ('Photo','Carousel','Reel')
      or nullif(slot->>'draftId','') is null or length(slot->>'draftId') > 512 or slot->>'draftId' !~ '^[A-Za-z0-9._:-]+$'
      or nullif(slot->>'planSlotId','') is null or length(slot->>'planSlotId') > 512 or slot->>'planSlotId' !~ '^[A-Za-z0-9._:-]+$'
      or (slot->>'planPosition')::integer not between 0 and 999999
      or (slot->>'planningDate')::date not between ((v_updated at time zone 'America/Chicago')::date - 366) and ((v_updated at time zone 'America/Chicago')::date + 730)
      or (select count(*) <> count(distinct value) from jsonb_array_elements_text(slot->'assetIds'))
  ) then raise exception 'Invalid review queue slot'; end if;
  if (select count(*) <> count(distinct slot->>'draftId') or count(*) <> count(distinct slot->>'planSlotId') or count(*) <> count(distinct (slot->>'planPosition')::integer) from jsonb_array_elements(p_slots) slot)
  then raise exception 'Duplicate review queue identity or position'; end if;
  if exists (
    select 1
    from jsonb_array_elements(p_slots) slot
    join public.content_plan_slots durable
      on durable.user_id = v_user_id
     and (durable.slot_id = slot->>'planSlotId'
       or durable.draft_id = slot->>'draftId'
       or durable.position = (slot->>'planPosition')::integer)
    where durable.state <> 'draft'
       or durable.slot_id <> slot->>'planSlotId'
       or durable.draft_id <> slot->>'draftId'
  ) then raise exception 'Planning identity conflicts with durable coverage'; end if;

  insert into public.review_queue (user_id, slots, updated_at)
  values (v_user_id, p_slots, v_updated)
  on conflict (user_id) do update set slots = excluded.slots, updated_at = excluded.updated_at;

  for v_slot in select value from jsonb_array_elements(p_slots)
  loop
    if nullif(v_slot->>'planSlotId', '') is not null and nullif(v_slot->>'draftId', '') is not null then
      insert into public.content_plan_slots (user_id, slot_id, position, planning_date, state, draft_id, updated_at)
      values (
        v_user_id,
        v_slot->>'planSlotId',
        coalesce((v_slot->>'planPosition')::integer, 0),
        nullif(v_slot->>'planningDate', '')::date,
        'draft',
        v_slot->>'draftId',
        v_updated
      )
      on conflict (user_id, slot_id) do update set
        position = excluded.position,
        planning_date = excluded.planning_date,
        updated_at = excluded.updated_at;
    end if;
  end loop;

  return jsonb_build_object('conflict', false, 'updatedAt', v_updated);
end;
$$;

create or replace function public.mark_deleted_approved_slot_removed()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  update public.content_plan_slots
  set state='removed', approved_post_id=null, updated_at=now()
  where user_id=old.user_id and approved_post_id=old.id and state='approved';
  return old;
end;
$$;
drop trigger if exists mark_deleted_approved_slot_removed on public.posts;
create trigger mark_deleted_approved_slot_removed before delete on public.posts
for each row execute function public.mark_deleted_approved_slot_removed();

drop function if exists public.approve_review_draft(uuid[],text,text,text,text,text,date,integer,text);
create or replace function public.approve_review_draft(
  p_asset_ids uuid[],
  p_caption text,
  p_original_caption text,
  p_photo_credits text[],
  p_format text,
  p_source_draft_id text,
  p_plan_slot_id text,
  p_planning_date date,
  p_plan_position integer,
  p_expected_updated_at text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_queue public.review_queue%rowtype;
  v_slot jsonb;
  v_post public.posts%rowtype;
  v_post_id uuid;
  v_existing_assets uuid[];
  v_slot_assets uuid[];
  v_updated timestamptz := now();
  v_was_edited boolean;
  v_action text;
  v_hashtags text[];
  v_coverage_slot text;
  v_approved_caption text;
  v_result_slots jsonb;
  v_result_coverage jsonb;
begin
  if v_user_id is null then raise exception 'Unauthorized'; end if;
  if coalesce(array_length(p_asset_ids, 1), 0) = 0 or nullif(trim(p_caption), '') is null then raise exception 'Invalid approval payload'; end if;
  if p_format not in ('Photo', 'Carousel', 'Reel') then raise exception 'Invalid approval format'; end if;
  if nullif(p_source_draft_id, '') is null or nullif(p_plan_slot_id, '') is null or p_plan_position < 0 then raise exception 'Missing planning identity'; end if;
  if coalesce(cardinality(p_photo_credits), 0) > 10 or exists (select 1 from unnest(coalesce(p_photo_credits, '{}'::text[])) credit where nullif(trim(credit), '') is null or length(credit) > 200 or credit ~ E'[\r\n]') then raise exception 'Invalid photo credit'; end if;
  select trim(p_caption) || coalesce(string_agg(E'\n\nPhoto: ' || trim(credit), '' order by ordinality), '')
  into v_approved_caption
  from unnest(coalesce(p_photo_credits, '{}'::text[])) with ordinality as credits(credit, ordinality);

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));
  select * into v_queue from public.review_queue where user_id = v_user_id for update;
  if not found then raise exception 'Review queue not found'; end if;

  select * into v_post from public.posts where user_id = v_user_id and source_draft_id = p_source_draft_id;
  if found then
    select array_agg(asset_id order by display_order) into v_existing_assets from public.post_media where post_id = v_post.id;
    if v_post.caption_option1 is distinct from v_approved_caption
      or v_post.format is distinct from p_format
      or v_post.plan_slot_id is distinct from p_plan_slot_id
      or v_post.plan_position is distinct from p_plan_position
      or v_post.planning_date is distinct from p_planning_date
      or v_existing_assets is distinct from p_asset_ids
      or not exists (
        select 1 from public.content_plan_slots
        where user_id = v_user_id and slot_id = p_plan_slot_id and state = 'approved' and approved_post_id = v_post.id
      )
      or exists (
        select 1 from jsonb_array_elements(v_queue.slots) item where item->>'draftId' = p_source_draft_id
      )
    then
      raise exception 'Existing approval is incomplete or does not match this request';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('slotId',slot_id,'position',position,'planningDate',planning_date,'state',state,'approvedPostId',approved_post_id) order by position), '[]'::jsonb)
    into v_result_coverage from public.content_plan_slots where user_id=v_user_id and state in ('approved','skipped','removed');
    return jsonb_build_object('ok', true, 'postId', v_post.id, 'updatedAt', v_queue.updated_at, 'slots', v_queue.slots, 'coverage', v_result_coverage, 'repeated', true);
  end if;

  if p_expected_updated_at is null or v_queue.updated_at <> p_expected_updated_at::timestamptz then
    raise exception using errcode = '40001', message = 'This review queue changed in another window';
  end if;

  select item into v_slot
  from jsonb_array_elements(v_queue.slots) item
  where item->>'draftId' = p_source_draft_id and item->>'planSlotId' = p_plan_slot_id;
  if v_slot is null then raise exception 'Draft is no longer in the review queue'; end if;
  select array_agg(value::uuid order by ordinality) into v_slot_assets
  from jsonb_array_elements_text(v_slot->'assetIds') with ordinality as asset(value, ordinality);
  if v_slot_assets is distinct from p_asset_ids
    or trim(v_slot->>'caption') is distinct from trim(p_caption)
    or (v_slot->>'kind') is distinct from p_format
    or (v_slot->>'planPosition')::integer is distinct from p_plan_position
    or nullif(v_slot->>'planningDate', '')::date is distinct from p_planning_date
  then
    raise exception using errcode = '40001', message = 'Stale approval payload';
  end if;
  if (select count(*) from public.media_assets where user_id = v_user_id and id = any(p_asset_ids)) <> array_length(p_asset_ids, 1) then
    raise exception 'Media not found';
  end if;
  if not exists (
    select 1 from public.content_plan_slots
    where user_id = v_user_id
      and slot_id = p_plan_slot_id
      and draft_id = p_source_draft_id
      and position = p_plan_position
      and state = 'draft'
  ) then raise exception 'Planning identity conflicts with durable coverage'; end if;

  v_was_edited := trim(coalesce(p_original_caption, p_caption)) <> trim(p_caption);
  v_action := case when v_was_edited then 'approve_edited' else 'approve' end;
  select coalesce(array_agg(match[1]), '{}'::text[]) into v_hashtags from regexp_matches(trim(p_caption), '(#[A-Za-z0-9_]+)', 'g') match;

  insert into public.posts (user_id, title, pillar, topic, format, status, scheduled_date, planning_date, source_draft_id, plan_slot_id, plan_position, caption_option1, caption_option2, caption_option3, hashtags, shot_ideas, notes)
  values (v_user_id, 'Approved Post', 'Approved Posts', 'Ready to post', p_format, 'draft', null, p_planning_date, p_source_draft_id, p_plan_slot_id, p_plan_position, v_approved_caption, case when v_was_edited then trim(p_original_caption) else null end, null, v_hashtags, '{}', case when v_was_edited then 'Approved Post Bank\nAI draft: ' || trim(p_original_caption) || '\nFinal edited caption: ' || trim(p_caption) else 'Approved Post Bank · approved without caption edit' end)
  returning id into v_post_id;

  insert into public.post_media (post_id, asset_id, display_order)
  select v_post_id, asset_id, ordinality - 1 from unnest(p_asset_ids) with ordinality as media(asset_id, ordinality);

  insert into public.content_plan_slots (user_id, slot_id, position, planning_date, state, draft_id, approved_post_id, updated_at)
  values (v_user_id, p_plan_slot_id, p_plan_position, p_planning_date, 'approved', p_source_draft_id, v_post_id, v_updated)
  on conflict (user_id, slot_id) do update set position = excluded.position, planning_date = excluded.planning_date, state = 'approved', draft_id = excluded.draft_id, approved_post_id = excluded.approved_post_id, updated_at = excluded.updated_at
  returning slot_id into v_coverage_slot;
  if v_coverage_slot is null then raise exception 'Could not commit planning coverage'; end if;

  insert into public.review_feedback (user_id, action, asset_ids, format, ai_caption, final_caption)
  values (v_user_id, v_action, p_asset_ids, p_format, coalesce(p_original_caption, p_caption), p_caption);

  update public.review_queue
  set slots = coalesce((
    select jsonb_agg(item order by ordinality)
    from jsonb_array_elements(v_queue.slots) with ordinality as queued(item, ordinality)
    where item->>'draftId' <> p_source_draft_id
  ), '[]'::jsonb), updated_at = v_updated
  where user_id = v_user_id
  returning slots into v_result_slots;

  select coalesce(jsonb_agg(jsonb_build_object('slotId',slot_id,'position',position,'planningDate',planning_date,'state',state,'approvedPostId',approved_post_id) order by position), '[]'::jsonb)
  into v_result_coverage from public.content_plan_slots where user_id=v_user_id and state in ('approved','skipped','removed');
  return jsonb_build_object('ok', true, 'postId', v_post_id, 'updatedAt', v_updated, 'slots', v_result_slots, 'coverage', v_result_coverage, 'repeated', false);
end;
$$;

alter table public.content_plan_slots validate constraint content_plan_slots_state_shape_check;
-- Supabase default ACLs can grant these roles privileges explicitly; revoking
-- PUBLIC alone does not remove those grants. Normalize only planning objects.
revoke all privileges on table public.content_plan_slots
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.content_plan_slots
  to authenticated;

revoke all privileges on function
  public.content_plan_asset_key(jsonb),
  public.content_plan_date(date, integer),
  public.normalize_review_queue_slots(jsonb, date),
  public.restore_review_queue_identity(jsonb, jsonb),
  public.protect_review_queue_planning(),
  public.mark_deleted_approved_slot_removed(),
  public.save_review_queue_with_plan(jsonb, text),
  public.approve_review_draft(uuid[], text, text, text[], text, text, text, date, integer, text)
  from public, anon, authenticated, service_role;

-- Invoker RPCs/triggers call these four helpers. Trigger functions themselves
-- need no client EXECUTE grant; the migration owner creates the triggers.
-- No service-role workflow is needed by the authenticated planning routes.
grant execute on function
  public.content_plan_asset_key(jsonb),
  public.content_plan_date(date, integer),
  public.normalize_review_queue_slots(jsonb, date),
  public.restore_review_queue_identity(jsonb, jsonb),
  public.save_review_queue_with_plan(jsonb, text),
  public.approve_review_draft(uuid[], text, text, text[], text, text, text, date, integer, text)
  to authenticated;

notify pgrst, 'reload schema';
commit;
