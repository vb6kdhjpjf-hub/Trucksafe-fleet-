-- TruckSafe: additive schema for geolocated, source-traceable road restrictions.
-- Existing fleet-scoped RLS policies remain unchanged. New records default to unverified.
alter table public.road_restrictions
  add column if not exists country_code text not null default 'IL',
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists start_latitude double precision,
  add column if not exists start_longitude double precision,
  add column if not exists end_latitude double precision,
  add column if not exists end_longitude double precision,
  add column if not exists location_accuracy_m numeric,
  add column if not exists source_type text not null default 'user_report',
  add column if not exists source_name text,
  add column if not exists source_url text,
  add column if not exists source_reference text,
  add column if not exists source_updated_at timestamptz,
  add column if not exists verification_status text not null default 'unverified',
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid,
  add column if not exists verification_notes text,
  add column if not exists expires_at timestamptz;

alter table public.vehicles
  add column if not exists empty_weight_kg numeric;

comment on column public.road_restrictions.latitude is 'Latitude for a point restriction; WGS84 decimal degrees.';
comment on column public.road_restrictions.longitude is 'Longitude for a point restriction; WGS84 decimal degrees.';
comment on column public.road_restrictions.start_latitude is 'Start point latitude for a linear road restriction; WGS84 decimal degrees.';
comment on column public.road_restrictions.start_longitude is 'Start point longitude for a linear road restriction; WGS84 decimal degrees.';
comment on column public.road_restrictions.end_latitude is 'End point latitude for a linear road restriction; WGS84 decimal degrees.';
comment on column public.road_restrictions.end_longitude is 'End point longitude for a linear road restriction; WGS84 decimal degrees.';
comment on column public.road_restrictions.source_type is 'Origin class of the restriction record; does not itself imply verification.';
comment on column public.road_restrictions.verification_status is 'Only verified records may be treated as authoritative routing constraints.';
comment on column public.vehicles.empty_weight_kg is 'Vehicle tare/empty weight in kilograms, including attached trailer when applicable; sourced from registration documents.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname='road_restrictions_country_code_check') then
    alter table public.road_restrictions add constraint road_restrictions_country_code_check check (country_code ~ '^[A-Z]{2}$');
  end if;
  if not exists (select 1 from pg_constraint where conname='road_restrictions_latitude_check') then
    alter table public.road_restrictions add constraint road_restrictions_latitude_check check (latitude is null or latitude between -90 and 90);
  end if;
  if not exists (select 1 from pg_constraint where conname='road_restrictions_longitude_check') then
    alter table public.road_restrictions add constraint road_restrictions_longitude_check check (longitude is null or longitude between -180 and 180);
  end if;
  if not exists (select 1 from pg_constraint where conname='road_restrictions_start_latitude_check') then
    alter table public.road_restrictions add constraint road_restrictions_start_latitude_check check (start_latitude is null or start_latitude between -90 and 90);
  end if;
  if not exists (select 1 from pg_constraint where conname='road_restrictions_start_longitude_check') then
    alter table public.road_restrictions add constraint road_restrictions_start_longitude_check check (start_longitude is null or start_longitude between -180 and 180);
  end if;
  if not exists (select 1 from pg_constraint where conname='road_restrictions_end_latitude_check') then
    alter table public.road_restrictions add constraint road_restrictions_end_latitude_check check (end_latitude is null or end_latitude between -90 and 90);
  end if;
  if not exists (select 1 from pg_constraint where conname='road_restrictions_end_longitude_check') then
    alter table public.road_restrictions add constraint road_restrictions_end_longitude_check check (end_longitude is null or end_longitude between -180 and 180);
  end if;
  if not exists (select 1 from pg_constraint where conname='road_restrictions_point_coordinates_pair_check') then
    alter table public.road_restrictions add constraint road_restrictions_point_coordinates_pair_check check ((latitude is null) = (longitude is null));
  end if;
  if not exists (select 1 from pg_constraint where conname='road_restrictions_segment_start_pair_check') then
    alter table public.road_restrictions add constraint road_restrictions_segment_start_pair_check check ((start_latitude is null) = (start_longitude is null));
  end if;
  if not exists (select 1 from pg_constraint where conname='road_restrictions_segment_end_pair_check') then
    alter table public.road_restrictions add constraint road_restrictions_segment_end_pair_check check ((end_latitude is null) = (end_longitude is null));
  end if;
  if not exists (select 1 from pg_constraint where conname='road_restrictions_segment_both_ends_check') then
    alter table public.road_restrictions add constraint road_restrictions_segment_both_ends_check check ((start_latitude is null) = (end_latitude is null));
  end if;
  if not exists (select 1 from pg_constraint where conname='road_restrictions_source_type_check') then
    alter table public.road_restrictions add constraint road_restrictions_source_type_check check (source_type in ('official_authority','municipal_authority','road_operator','fleet_report','user_report','imported'));
  end if;
  if not exists (select 1 from pg_constraint where conname='road_restrictions_verification_status_check') then
    alter table public.road_restrictions add constraint road_restrictions_verification_status_check check (verification_status in ('unverified','pending','verified','rejected','expired'));
  end if;
  if not exists (select 1 from pg_constraint where conname='road_restrictions_verified_metadata_check') then
    alter table public.road_restrictions add constraint road_restrictions_verified_metadata_check check (verification_status <> 'verified' or (verified_at is not null and source_name is not null and btrim(source_name) <> ''));
  end if;
  if not exists (select 1 from pg_constraint where conname='road_restrictions_source_url_https_check') then
    alter table public.road_restrictions add constraint road_restrictions_source_url_https_check check (source_url is null or source_url ~ '^https://');
  end if;
  if not exists (select 1 from pg_constraint where conname='road_restrictions_location_accuracy_check') then
    alter table public.road_restrictions add constraint road_restrictions_location_accuracy_check check (location_accuracy_m is null or location_accuracy_m between 0 and 100000);
  end if;
  if not exists (select 1 from pg_constraint where conname='vehicles_empty_weight_check') then
    alter table public.vehicles add constraint vehicles_empty_weight_check check (empty_weight_kg is null or (empty_weight_kg >= 500 and empty_weight_kg <= 100000 and (gross_weight_kg is null or empty_weight_kg <= gross_weight_kg)));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='road_restrictions_verified_by_fkey') then
    alter table public.road_restrictions add constraint road_restrictions_verified_by_fkey
      foreign key (verified_by) references auth.users(id) on delete set null;
  end if;
end $$;

create index if not exists road_restrictions_verified_country_active_idx
  on public.road_restrictions (country_code, verification_status, is_active, expires_at);
create index if not exists road_restrictions_point_coordinates_idx
  on public.road_restrictions (latitude, longitude)
  where latitude is not null and longitude is not null;
create index if not exists road_restrictions_segment_coordinates_idx
  on public.road_restrictions (start_latitude, start_longitude, end_latitude, end_longitude)
  where start_latitude is not null and end_latitude is not null;
