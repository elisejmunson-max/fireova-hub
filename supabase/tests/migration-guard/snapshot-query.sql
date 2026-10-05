select jsonb_build_object(
  'database', current_database(),
  'role', current_user,
  'version_major', current_setting('server_version_num')::integer / 10000,
  'records', jsonb_build_object(
    'posts', (select md5(coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb)::text) from public.posts t),
    'media_assets', (select md5(coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb)::text) from public.media_assets t),
    'post_media', (select md5(coalesce(jsonb_agg(to_jsonb(t) order by post_id,display_order,id),'[]'::jsonb)::text) from public.post_media t),
    'review_queue', (select md5(coalesce(jsonb_agg(to_jsonb(t) order by user_id),'[]'::jsonb)::text) from public.review_queue t),
    'review_feedback', (select md5(coalesce(jsonb_agg(to_jsonb(t) order by created_at,id),'[]'::jsonb)::text) from public.review_feedback t)
  ),
  'schema', jsonb_build_object(
    'tables', (select jsonb_agg(jsonb_build_object('name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'acl',c.relacl::text) order by c.relname) from pg_class c where c.relnamespace='public'::regnamespace and c.relname in ('posts','media_assets','post_media','review_queue','review_feedback')),
    'columns', (select jsonb_agg(jsonb_build_object('table',c.relname,'name',a.attname,'position',a.attnum,'type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) order by c.relname,a.attnum) from pg_class c join pg_attribute a on a.attrelid=c.oid left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where c.relnamespace='public'::regnamespace and c.relname in ('posts','media_assets','post_media','review_queue','review_feedback') and a.attnum>0 and not a.attisdropped),
    'constraints', (select jsonb_agg(jsonb_build_object('table',c.relname,'name',k.conname,'definition',pg_get_constraintdef(k.oid),'validated',k.convalidated) order by c.relname,k.conname) from pg_constraint k join pg_class c on c.oid=k.conrelid where c.relnamespace='public'::regnamespace and c.relname in ('posts','media_assets','post_media','review_queue','review_feedback')),
    'indexes', (select jsonb_agg(jsonb_build_object('table',tablename,'name',indexname,'definition',indexdef) order by tablename,indexname) from pg_indexes where schemaname='public' and tablename in ('posts','media_assets','post_media','review_queue','review_feedback')),
    'policies', (select jsonb_agg(to_jsonb(p) order by tablename,policyname) from pg_policies p where schemaname='public' and tablename in ('posts','media_assets','post_media','review_queue','review_feedback')),
    'triggers', (select jsonb_agg(jsonb_build_object('table',c.relname,'name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid)) order by c.relname,t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and c.relname in ('posts','media_assets','post_media','review_queue','review_feedback') and not t.tgisinternal),
    'defaults', (select jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(defaclrole),'kind',defaclobjtype,'acl',defaclacl::text) order by pg_get_userbyid(defaclrole),defaclobjtype) from pg_default_acl where defaclnamespace='public'::regnamespace)
  )
)
