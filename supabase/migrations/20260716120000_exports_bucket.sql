-- Phase 4: exports bucket for programme snapshots and inspector exports (§5).
insert into storage.buckets (id, name, public)
values ('exports', 'exports', false)
on conflict (id) do nothing;

create policy exports_select on storage.objects
  for select to authenticated
  using (bucket_id = 'exports' and private.can_access_site(private.site_id_from_path(name)));
create policy exports_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'exports' and private.can_access_site(private.site_id_from_path(name)));
create policy exports_update on storage.objects
  for update to authenticated
  using (bucket_id = 'exports' and private.is_site_manager(private.site_id_from_path(name)))
  with check (bucket_id = 'exports' and private.is_site_manager(private.site_id_from_path(name)));
-- snapshots are versioned documents: no delete policy
