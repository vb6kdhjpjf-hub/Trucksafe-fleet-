-- Prevent authenticated users from deleting private evidence while it is
-- referenced by an operational record. Storage API deletes are governed by
-- storage.objects RLS; this helper checks references independently of caller RLS.
-- Prepared migration only: do not apply to Test or Production without owner approval.

create or replace function private.storage_object_is_referenced(p_bucket_id text, p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_bucket_id
    when 'vehicle-registrations' then
      exists (
        select 1 from public.vehicles v
        where v.registration_document_path = p_name
      )
      or exists (
        select 1 from public.vehicle_special_equipment e
        where e.lifting_chart_document_path = p_name
      )
    when 'incident-photos' then
      exists (
        select 1 from public.incidents i
        where i.photo_path = p_name
      )
    else false
  end;
$$;

revoke all on function private.storage_object_is_referenced(text, text)
  from public, anon;
grant execute on function private.storage_object_is_referenced(text, text)
  to authenticated;

drop policy if exists vehicle_registrations_manager_delete on storage.objects;
create policy vehicle_registrations_manager_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'vehicle-registrations'
  and array_length(storage.foldername(name), 1) = 2
  and case
    when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then private.has_fleet_role(((storage.foldername(name))[1])::uuid, array['owner','fleet_manager']::text[])
    else false
  end
  and not private.storage_object_is_referenced(bucket_id, name)
);

drop policy if exists incident_photos_member_delete_own on storage.objects;
create policy incident_photos_member_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'incident-photos'
  and owner = (select auth.uid())
  and private.is_fleet_member(((storage.foldername(name))[1])::uuid)
  and not private.storage_object_is_referenced(bucket_id, name)
);
