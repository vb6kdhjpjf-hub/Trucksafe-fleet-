-- Test-database-only migration. Do not place under supabase/migrations or apply to production.
-- Applied to the dedicated TruckSafe Fleet Test project as migration 20261110144502.
-- This file is retained for audit and repeatability; it is not part of production migration history.


-- Reconcile the dedicated test database with the currently deployed production
-- road-restriction and vehicle-registration safeguards. Preserve test-only
-- route quota objects. This migration is intended ONLY for TruckSafe Fleet Test.

begin;

-- Road restriction provenance, geometry and measured-clearance fields.
alter table public.road_restrictions
  add column if not exists country_code text not null default 'IL',
  add column if not exists start_latitude double precision,
  add column if not exists start_longitude double precision,
  add column if not exists end_latitude double precision,
  add column if not exists end_longitude double precision,
  add column if not exists location_accuracy_m numeric,
  add column if not exists source_type text not null default 'user_report',
  add column if not exists source_name text,
  add column if not exists source_reference text,
  add column if not exists source_updated_at timestamptz,
  add column if not exists verification_notes text,
  add column if not exists expires_at timestamptz,
  add column if not exists measured_clearance_m numeric,
  add column if not exists measurement_date date,
  add column if not exists measurement_accuracy_cm numeric,
  add column if not exists measurement_method text,
  add column if not exists measurement_location_note text,
  add column if not exists measurement_document_url text;

-- Production uses numeric radius; the isolated test schema had integer.
alter table public.road_restrictions
  alter column radius_m type numeric using radius_m::numeric;

alter table public.vehicles
  add column if not exists empty_weight_kg numeric,
  add column if not exists registration_verification_status text not null default 'unverified',
  add column if not exists registration_document_path text,
  add column if not exists registration_document_uploaded_at timestamptz,
  add column if not exists registration_verified_at timestamptz,
  add column if not exists registration_verified_by uuid,
  add column if not exists registration_verification_note text;

-- Replace obsolete test-only checks with the deployed production constraints.
alter table public.road_restrictions
  drop constraint if exists road_restrictions_latitude_check,
  drop constraint if exists road_restrictions_longitude_check,
  drop constraint if exists road_restrictions_coordinates_pair_check,
  drop constraint if exists road_restrictions_verification_status_check,
  drop constraint if exists road_restrictions_radius_check,
  drop constraint if exists road_restrictions_verified_provenance_check;

alter table public.road_restrictions
  add constraint road_restrictions_country_code_check
    check (country_code ~ '^[A-Z]{2}$'),
  add constraint road_restrictions_latitude_check
    check (latitude is null or latitude between -90 and 90),
  add constraint road_restrictions_longitude_check
    check (longitude is null or longitude between -180 and 180),
  add constraint road_restrictions_start_latitude_check
    check (start_latitude is null or start_latitude between -90 and 90),
  add constraint road_restrictions_start_longitude_check
    check (start_longitude is null or start_longitude between -180 and 180),
  add constraint road_restrictions_end_latitude_check
    check (end_latitude is null or end_latitude between -90 and 90),
  add constraint road_restrictions_end_longitude_check
    check (end_longitude is null or end_longitude between -180 and 180),
  add constraint road_restrictions_point_coordinates_pair_check
    check ((latitude is null) = (longitude is null)),
  add constraint road_restrictions_segment_start_pair_check
    check ((start_latitude is null) = (start_longitude is null)),
  add constraint road_restrictions_segment_end_pair_check
    check ((end_latitude is null) = (end_longitude is null)),
  add constraint road_restrictions_segment_both_ends_check
    check ((start_latitude is null) = (end_latitude is null)),
  add constraint road_restrictions_source_type_check
    check (source_type in ('official_authority','municipal_authority','road_operator','fleet_report','user_report','imported')),
  add constraint road_restrictions_verification_status_check
    check (verification_status in ('unverified','pending','verified','rejected','expired')),
  add constraint road_restrictions_verified_metadata_check
    check (verification_status <> 'verified' or (verified_at is not null and source_name is not null and btrim(source_name) <> '')),
  add constraint road_restrictions_source_url_https_check
    check (source_url is null or source_url ~ '^https://'),
  add constraint road_restrictions_location_accuracy_check
    check (location_accuracy_m is null or location_accuracy_m between 0 and 100000),
  add constraint road_restrictions_radius_check
    check (radius_m between 10 and 1000),
  add constraint road_restrictions_verified_review_check
    check (
      verification_status <> 'verified'
      or (
        verified_at is not null
        and verified_by is not null
        and source_name is not null and btrim(source_name) <> ''
        and source_url is not null
        and source_last_checked_at is not null
        and verification_note is not null and btrim(verification_note) <> ''
      )
    ),
  add constraint road_restrictions_measured_clearance_check
    check (measured_clearance_m is null or measured_clearance_m between 0.5 and 20),
  add constraint road_restrictions_measurement_accuracy_check
    check (measurement_accuracy_cm is null or measurement_accuracy_cm between 0.1 and 10),
  add constraint road_restrictions_measurement_doc_https_check
    check (measurement_document_url is null or measurement_document_url ~ '^https://'),
  add constraint road_restrictions_verified_height_measurement_check
    check (
      verification_status <> 'verified'
      or restriction_type <> 'height'
      or (
        measured_clearance_m is not null
        and max_height_m is not null
        and measurement_date is not null
        and measurement_date <= current_date
        and measurement_accuracy_cm is not null
        and measurement_accuracy_cm <= 1
        and coalesce(btrim(measurement_method),'') <> ''
        and length(coalesce(btrim(measurement_location_note),'')) >= 12
        and measurement_document_url is not null
        and measurement_document_url ~ '^https://'
        and measured_clearance_m - max_height_m between 0.20 and 0.29
      )
    );

alter table public.road_restrictions
  add constraint road_restrictions_verified_by_fkey
  foreign key (verified_by) references auth.users(id) on delete set null;

alter table public.vehicles
  add constraint vehicles_empty_weight_check
    check (empty_weight_kg is null or (empty_weight_kg >= 500 and empty_weight_kg <= 100000 and (gross_weight_kg is null or empty_weight_kg <= gross_weight_kg))),
  add constraint vehicles_registration_verification_status_check
    check (registration_verification_status in ('unverified','pending','verified','rejected')),
  add constraint vehicles_registration_verified_evidence_check
    check (
      registration_verification_status <> 'verified'
      or (
        nullif(btrim(registration_document_path),'') is not null
        and registration_verified_by is not null
        and registration_verified_at is not null
        and nullif(btrim(registration_verification_note),'') is not null
      )
    ),
  add constraint vehicles_registration_verified_by_fkey
    foreign key (registration_verified_by) references auth.users(id) on delete set null;

create index if not exists road_restrictions_verified_country_active_idx
  on public.road_restrictions (country_code, verification_status, is_active, expires_at);
create index if not exists road_restrictions_point_coordinates_idx
  on public.road_restrictions (latitude, longitude)
  where latitude is not null and longitude is not null;
create index if not exists road_restrictions_segment_coordinates_idx
  on public.road_restrictions (start_latitude, start_longitude, end_latitude, end_longitude)
  where start_latitude is not null and end_latitude is not null;
create index if not exists vehicles_fleet_registration_verification_idx
  on public.vehicles (fleet_id, registration_verification_status);

comment on column public.road_restrictions.verification_status is
  'Only reviewed restrictions with authoritative evidence may be treated as routing constraints.';
comment on column public.vehicles.empty_weight_kg is
  'Vehicle tare/empty weight in kilograms, sourced from registration evidence.';

-- The production road-restriction trigger permits owner/manager review and
-- invalidates verification when material facts change.
create or replace function public.guard_road_restriction_verification()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, private, auth
as $function$
declare
  verification_changed boolean := false;
  material_changed boolean := false;
  note_value text;
  has_point boolean;
  has_segment boolean;
begin
  if TG_OP = 'INSERT' then
    verification_changed :=
      NEW.verification_status not in ('unverified','pending')
      or NEW.verified_at is not null
      or NEW.verified_by is not null
      or NEW.source_last_checked_at is not null
      or NEW.verification_note is not null
      or NEW.verification_notes is not null;
  else
    material_changed :=
      NEW.road_name is distinct from OLD.road_name
      or NEW.restriction_type is distinct from OLD.restriction_type
      or NEW.direction is distinct from OLD.direction
      or NEW.max_height_m is distinct from OLD.max_height_m
      or NEW.max_weight_t is distinct from OLD.max_weight_t
      or NEW.max_width_m is distinct from OLD.max_width_m
      or NEW.max_length_m is distinct from OLD.max_length_m
      or NEW.valid_from is distinct from OLD.valid_from
      or NEW.valid_until is distinct from OLD.valid_until
      or NEW.active_from is distinct from OLD.active_from
      or NEW.active_until is distinct from OLD.active_until
      or NEW.country_code is distinct from OLD.country_code
      or NEW.latitude is distinct from OLD.latitude
      or NEW.longitude is distinct from OLD.longitude
      or NEW.start_latitude is distinct from OLD.start_latitude
      or NEW.start_longitude is distinct from OLD.start_longitude
      or NEW.end_latitude is distinct from OLD.end_latitude
      or NEW.end_longitude is distinct from OLD.end_longitude
      or NEW.location_accuracy_m is distinct from OLD.location_accuracy_m
      or NEW.source_type is distinct from OLD.source_type
      or NEW.source_name is distinct from OLD.source_name
      or NEW.source_url is distinct from OLD.source_url
      or NEW.source_reference is distinct from OLD.source_reference
      or NEW.source_updated_at is distinct from OLD.source_updated_at
      or NEW.expires_at is distinct from OLD.expires_at
      or NEW.radius_m is distinct from OLD.radius_m
      or NEW.measured_clearance_m is distinct from OLD.measured_clearance_m
      or NEW.measurement_date is distinct from OLD.measurement_date
      or NEW.measurement_accuracy_cm is distinct from OLD.measurement_accuracy_cm
      or NEW.measurement_method is distinct from OLD.measurement_method
      or NEW.measurement_location_note is distinct from OLD.measurement_location_note
      or NEW.measurement_document_url is distinct from OLD.measurement_document_url;

    if OLD.verification_status = 'verified' and material_changed then
      if not private.has_fleet_role(NEW.fleet_id, ARRAY['owner','fleet_manager']::text[]) then
        raise exception 'Only fleet owners and fleet managers may change verified restriction details';
      end if;
      NEW.verification_status := 'unverified';
      NEW.verified_at := null;
      NEW.verified_by := null;
      NEW.source_last_checked_at := null;
      NEW.verification_note := null;
      NEW.verification_notes := null;
      verification_changed := true;
    else
      verification_changed :=
        NEW.verification_status is distinct from OLD.verification_status
        or NEW.verified_at is distinct from OLD.verified_at
        or NEW.verified_by is distinct from OLD.verified_by
        or NEW.source_last_checked_at is distinct from OLD.source_last_checked_at
        or NEW.verification_note is distinct from OLD.verification_note
        or NEW.verification_notes is distinct from OLD.verification_notes;
    end if;
  end if;

  if not verification_changed then return NEW; end if;
  if not private.has_fleet_role(NEW.fleet_id, ARRAY['owner','fleet_manager']::text[]) then
    raise exception 'Only fleet owners and fleet managers may change restriction verification';
  end if;

  note_value := coalesce(nullif(btrim(NEW.verification_note), ''), nullif(btrim(NEW.verification_notes), ''));
  if NEW.verification_status in ('verified','rejected') and length(coalesce(note_value,'')) < 12 then
    raise exception 'A verification decision requires a review note of at least 12 characters';
  end if;

  if NEW.verification_status = 'verified' then
    has_point := NEW.latitude is not null and NEW.longitude is not null;
    has_segment := NEW.start_latitude is not null and NEW.start_longitude is not null
      and NEW.end_latitude is not null and NEW.end_longitude is not null;
    if NEW.source_type not in ('official_authority','municipal_authority','road_operator')
       or coalesce(btrim(NEW.source_name),'') = ''
       or NEW.source_url is null or NEW.source_url !~ '^https://'
       or (not has_point and not has_segment)
       or (has_point and (NEW.latitude < 29 or NEW.latitude > 34 or NEW.longitude < 34 or NEW.longitude > 36))
       or (has_segment and (
         NEW.start_latitude < 29 or NEW.start_latitude > 34
         or NEW.end_latitude < 29 or NEW.end_latitude > 34
         or NEW.start_longitude < 34 or NEW.start_longitude > 36
         or NEW.end_longitude < 34 or NEW.end_longitude > 36
       )) then
      raise exception 'Verified restrictions require an official source, HTTPS reference and valid Israel geometry';
    end if;
    NEW.verification_note := note_value;
    NEW.verification_notes := note_value;
    NEW.verified_at := now();
    NEW.verified_by := auth.uid();
    NEW.source_last_checked_at := now();
  elsif NEW.verification_status = 'rejected' then
    NEW.verification_note := note_value;
    NEW.verification_notes := note_value;
    NEW.verified_at := null;
    NEW.verified_by := null;
    NEW.source_last_checked_at := now();
  end if;
  return NEW;
end;
$function$;

drop trigger if exists road_restrictions_guard_verification on public.road_restrictions;
create trigger road_restrictions_guard_verification
before insert or update on public.road_restrictions
for each row execute function public.guard_road_restriction_verification();

-- Remove the obsolete service_role-only verification trigger function after
-- moving the trigger to the manager-authorized production guard.
drop function if exists private.guard_road_restriction_verification();

-- Vehicle registration approval is restricted to the trusted review RPC.
create or replace function private.guard_vehicle_registration_verification()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  is_service_role boolean := coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
  routing_profile_changed boolean;
begin
  routing_profile_changed :=
    new.registration_document_path is distinct from old.registration_document_path
    or new.routing_vehicle_type is distinct from old.routing_vehicle_type
    or new.height_cm is distinct from old.height_cm
    or new.width_cm is distinct from old.width_cm
    or new.length_cm is distinct from old.length_cm
    or new.gross_weight_kg is distinct from old.gross_weight_kg
    or new.empty_weight_kg is distinct from old.empty_weight_kg
    or new.axle_count is distinct from old.axle_count
    or new.trailer_count is distinct from old.trailer_count
    or new.weight_per_axle_kg is distinct from old.weight_per_axle_kg;

  if not is_service_role then
    if new.registration_verification_status not in ('unverified','pending')
       and new.registration_verification_status is distinct from old.registration_verification_status then
      raise exception 'Only the trusted verification service may approve or reject vehicle registration documents';
    end if;

    if new.registration_verified_at is distinct from old.registration_verified_at
       or new.registration_verified_by is distinct from old.registration_verified_by
       or new.registration_verification_note is distinct from old.registration_verification_note then
      raise exception 'Vehicle verification decisions are restricted to the trusted verification service';
    end if;
  end if;

  if routing_profile_changed then
    new.registration_verification_status := 'pending';
    new.registration_verified_at := null;
    new.registration_verified_by := null;
    new.registration_verification_note := null;
  end if;

  return new;
end;
$function$;

revoke all on function private.guard_vehicle_registration_verification() from public, anon, authenticated, service_role;
drop trigger if exists vehicles_invalidate_registration_verification on public.vehicles;
drop trigger if exists guard_vehicle_registration_verification on public.vehicles;
create trigger guard_vehicle_registration_verification
before update on public.vehicles
for each row execute function private.guard_vehicle_registration_verification();

create or replace function private.review_vehicle_registration(
  p_vehicle_id uuid,
  p_decision text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_vehicle record;
  v_reviewer uuid := auth.uid();
  v_previous_role text := coalesce(current_setting('request.jwt.claim.role', true), 'authenticated');
  v_note text := btrim(coalesce(p_note, ''));
  v_status text;
  v_verified_at timestamptz;
begin
  if v_reviewer is null then
    raise exception 'נדרשת התחברות כדי לבדוק רישיון' using errcode = '28000';
  end if;

  if p_decision is null or p_decision not in ('verified', 'rejected') then
    raise exception 'החלטת בדיקה לא תקינה' using errcode = '22023';
  end if;

  if char_length(v_note) < 5 or char_length(v_note) > 1000 then
    raise exception 'יש להזין הערת בדיקה באורך 5 עד 1000 תווים' using errcode = '22023';
  end if;

  select v.id, v.fleet_id, v.is_demo, v.registration_document_path
    into v_vehicle
  from public.vehicles v
  where v.id = p_vehicle_id
  for update;

  if not found then
    raise exception 'הרכב לא נמצא' using errcode = 'P0002';
  end if;

  if not private.has_fleet_role(
    v_vehicle.fleet_id,
    array['owner','fleet_manager']::text[]
  ) then
    raise exception 'אין הרשאה לבצע בדיקת רישיון בצי זה' using errcode = '42501';
  end if;

  if coalesce(v_vehicle.is_demo, false) then
    raise exception 'לא ניתן לאשר רכב הדגמה' using errcode = '22023';
  end if;

  if v_vehicle.registration_document_path is null
     or v_vehicle.registration_document_path not like
       v_vehicle.fleet_id::text || '/' || p_vehicle_id::text || '/%' then
    raise exception 'לא נמצא מסמך רישוי תקין המשויך לרכב' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from storage.objects o
    where o.bucket_id = 'vehicle-registrations'
      and o.name = v_vehicle.registration_document_path
      and o.archived_at is null
      and coalesce(o.is_delete_marker, false) = false
  ) then
    raise exception 'קובץ הרישוי אינו קיים באחסון הפרטי' using errcode = '22023';
  end if;

  perform set_config('request.jwt.claim.role', 'service_role', true);

  update public.vehicles
  set registration_verification_status = p_decision,
      registration_verified_at = case when p_decision = 'verified' then pg_catalog.now() else null end,
      registration_verified_by = v_reviewer,
      registration_verification_note = v_note
  where id = p_vehicle_id
  returning registration_verification_status, registration_verified_at
    into v_status, v_verified_at;

  perform set_config('request.jwt.claim.role', v_previous_role, true);

  return pg_catalog.jsonb_build_object(
    'vehicle_id', p_vehicle_id,
    'status', v_status,
    'verified_at', v_verified_at,
    'verified_by', v_reviewer,
    'note', v_note
  );
end;
$function$;

revoke all on function private.review_vehicle_registration(uuid, text, text) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.review_vehicle_registration(uuid, text, text) to authenticated;

create or replace function public.review_vehicle_registration(
  p_vehicle_id uuid,
  p_decision text,
  p_note text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select private.review_vehicle_registration(p_vehicle_id, p_decision, p_note);
$function$;

revoke all on function public.review_vehicle_registration(uuid, text, text) from public, anon, authenticated;
grant execute on function public.review_vehicle_registration(uuid, text, text) to authenticated;

-- Private buckets and storage policies. Existing test project had no buckets
-- and no storage policies; these match the deployed production access model.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('incident-photos','incident-photos',false,5242880,array['image/jpeg','image/png','image/webp']),
  ('vehicle-registrations','vehicle-registrations',false,8388608,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists incident_photos_member_upload on storage.objects;
create policy incident_photos_member_upload
on storage.objects for insert to authenticated
with check (
  bucket_id = 'incident-photos'
  and private.is_fleet_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists incident_photos_member_read on storage.objects;
create policy incident_photos_member_read
on storage.objects for select to authenticated
using (
  bucket_id = 'incident-photos'
  and exists (select 1 from public.incidents i where i.photo_path = objects.name)
);

drop policy if exists incident_photos_member_delete_own on storage.objects;
create policy incident_photos_member_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'incident-photos'
  and owner = (select auth.uid())
  and private.is_fleet_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists vehicle_registrations_manager_upload on storage.objects;
create policy vehicle_registrations_manager_upload
on storage.objects for insert to authenticated
with check (
  bucket_id = 'vehicle-registrations'
  and array_length(storage.foldername(name), 1) = 2
  and case
    when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then private.has_fleet_role(((storage.foldername(name))[1])::uuid, array['owner','fleet_manager'])
    else false
  end
);

drop policy if exists vehicle_registrations_manager_read on storage.objects;
create policy vehicle_registrations_manager_read
on storage.objects for select to authenticated
using (
  bucket_id = 'vehicle-registrations'
  and array_length(storage.foldername(name), 1) = 2
  and case
    when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then private.has_fleet_role(((storage.foldername(name))[1])::uuid, array['owner','fleet_manager'])
    else false
  end
);

drop policy if exists vehicle_registrations_manager_delete on storage.objects;
create policy vehicle_registrations_manager_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'vehicle-registrations'
  and array_length(storage.foldername(name), 1) = 2
  and case
    when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then private.has_fleet_role(((storage.foldername(name))[1])::uuid, array['owner','fleet_manager'])
    else false
  end
);

commit;
