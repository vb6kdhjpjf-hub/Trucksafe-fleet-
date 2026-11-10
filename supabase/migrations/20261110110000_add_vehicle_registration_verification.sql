-- Vehicle registration evidence and explicit human verification.
-- Prepared migration only: do not apply until the owner approves the database change.
begin;

alter table public.vehicles
  add column if not exists registration_verification_status text not null default 'unverified',
  add column if not exists registration_document_path text,
  add column if not exists registration_document_uploaded_at timestamptz,
  add column if not exists registration_verified_at timestamptz,
  add column if not exists registration_verified_by uuid references auth.users(id) on delete set null,
  add column if not exists registration_verification_note text;

alter table public.vehicles
  add constraint vehicles_registration_verification_status_check
  check (registration_verification_status in ('unverified','pending','verified','rejected'));

alter table public.vehicles
  add constraint vehicles_registration_verification_metadata_check
  check (
    registration_verification_status <> 'verified'
    or (
      registration_document_path is not null
      and registration_verified_at is not null
      and registration_verified_by is not null
      and nullif(btrim(registration_verification_note), '') is not null
    )
  );

create index if not exists vehicles_registration_verification_status_idx
  on public.vehicles (fleet_id, registration_verification_status);

-- A private bucket: never expose registration documents through public URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vehicle-registrations',
  'vehicle-registrations',
  false,
  8388608,
  array['application/pdf','image/jpeg','image/png','image/webp']
)
on conflict (id) do nothing;

create policy vehicle_registration_documents_manager_upload
on storage.objects for insert to authenticated
with check (
  bucket_id = 'vehicle-registrations'
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
  and private.has_fleet_role(((storage.foldername(name))[1])::uuid, array['owner','fleet_manager'])
);

create policy vehicle_registration_documents_manager_read
on storage.objects for select to authenticated
using (
  bucket_id = 'vehicle-registrations'
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
  and private.has_fleet_role(((storage.foldername(name))[1])::uuid, array['owner','fleet_manager'])
);

create policy vehicle_registration_documents_manager_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'vehicle-registrations'
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
  and private.has_fleet_role(((storage.foldername(name))[1])::uuid, array['owner','fleet_manager'])
);

-- Any change to routing-relevant specifications or registration evidence
-- invalidates the previous approval and requires a fresh human review.
create or replace function public.invalidate_vehicle_registration_verification()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if row(
    new.registration_document_path,
    new.height_cm,
    new.width_cm,
    new.length_cm,
    new.gross_weight_kg,
    new.empty_weight_kg,
    new.axle_count,
    new.trailer_count,
    new.weight_per_axle_kg,
    new.routing_vehicle_type
  ) is distinct from row(
    old.registration_document_path,
    old.height_cm,
    old.width_cm,
    old.length_cm,
    old.gross_weight_kg,
    old.empty_weight_kg,
    old.axle_count,
    old.trailer_count,
    old.weight_per_axle_kg,
    old.routing_vehicle_type
  ) then
    new.registration_verification_status := 'pending';
    new.registration_verified_at := null;
    new.registration_verified_by := null;
    new.registration_verification_note := null;
  end if;
  return new;
end;
$$;

drop trigger if exists vehicles_invalidate_registration_verification on public.vehicles;
create trigger vehicles_invalidate_registration_verification
before update on public.vehicles
for each row execute function public.invalidate_vehicle_registration_verification();

commit;
