-- Fireova media bucket policies
-- Files must be stored under: {authenticated-user-id}/{filename}

create policy "Users can upload own media"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'media'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can view own media"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'media'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can delete own media"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'media'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
