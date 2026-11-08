-- Add geospatial provenance to fleet road restrictions.
-- Existing records stay unverified and are never promoted automatically.
alter table public.road_restrictions
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists radius_m integer not null default 75,
  add column if not exists source_url text,
  add column if not exists verification_status text not null default 'unverified';

alter table public.road_restrictions
  add constraint road_restrictions_latitude_check
    check (latitude is null or latitude between 29 and 34),
  add constraint road_restrictions_longitude_check
    check (longitude is null or longitude between 34 and 36),
  add constraint road_restrictions_radius_check
    check (radius_m between 10 and 1000),
  add constraint road_restrictions_verification_status_check
    check (verification_status in ('unverified','verified','expired'));

alter table public.road_restrictions
  add constraint road_restrictions_coordinates_pair_check
    check ((latitude is null and longitude is null) or (latitude is not null and longitude is not null));

comment on column public.road_restrictions.latitude is 'WGS84 latitude of the restriction point; must be sourced and reviewed.';
comment on column public.road_restrictions.longitude is 'WGS84 longitude of the restriction point; must be sourced and reviewed.';
comment on column public.road_restrictions.radius_m is 'Conservative geofence radius in meters around the restriction point.';
comment on column public.road_restrictions.source_url is 'URL of the official or otherwise authoritative source used to record this restriction.';
comment on column public.road_restrictions.verification_status is 'Unverified by default. Only trusted administrative review may set verified; never inferred from user input.';
