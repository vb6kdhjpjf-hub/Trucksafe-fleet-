-- Add geospatial provenance to fleet road restrictions.
-- Existing records stay unverified and are never promoted automatically.
alter table public.road_restrictions
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists radius_m integer not null default 75,
  add column if not exists source_url text,
  add column if not exists verification_status text not null default 'unverified',
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid,
  add column if not exists source_last_checked_at timestamptz,
  add column if not exists verification_note text;

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
comment on column public.road_restrictions.source_last_checked_at is 'Timestamp when a trusted reviewer last checked the source and field details.';
comment on column public.road_restrictions.verification_note is 'Reviewer audit note describing source and field checks; required for verified records.';

alter table public.road_restrictions
  add constraint road_restrictions_verified_provenance_check
    check (verification_status <> 'verified' or (latitude is not null and longitude is not null and source_url is not null and source_url ~* '^https://' and verified_at is not null and verified_by is not null and source_last_checked_at is not null and length(trim(coalesce(verification_note, ''))) >= 20 and (restriction_type not in ('height','weight','width','length') or coalesce((case restriction_type when 'height' then max_height_m when 'weight' then max_weight_t when 'width' then max_width_m when 'length' then max_length_m end) > 0, false)) and (restriction_type <> 'time_window' or (valid_from is not null and valid_until is not null))));

create or replace function private.guard_road_restriction_verification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.verification_status <> 'unverified' or new.verified_at is not null or new.verified_by is not null then
      if coalesce(auth.role(), '') <> 'service_role' then
        raise exception 'Road restriction verification requires trusted administrative review';
      end if;
    end if;
  elsif old.verification_status is distinct from new.verification_status
     or old.verified_at is distinct from new.verified_at
     or old.verified_by is distinct from new.verified_by
     or old.source_last_checked_at is distinct from new.source_last_checked_at
     or old.verification_note is distinct from new.verification_note
     or (
       old.verification_status = 'verified'
       and (
         old.road_name is distinct from new.road_name
         or old.restriction_type is distinct from new.restriction_type
         or old.direction is distinct from new.direction
         or old.max_height_m is distinct from new.max_height_m
         or old.max_weight_t is distinct from new.max_weight_t
         or old.max_width_m is distinct from new.max_width_m
         or old.max_length_m is distinct from new.max_length_m
         or old.valid_from is distinct from new.valid_from
         or old.valid_until is distinct from new.valid_until
         or old.active_from is distinct from new.active_from
         or old.active_until is distinct from new.active_until
         or old.latitude is distinct from new.latitude
         or old.longitude is distinct from new.longitude
         or old.radius_m is distinct from new.radius_m
         or old.source_url is distinct from new.source_url
         or old.source_last_checked_at is distinct from new.source_last_checked_at
         or old.verification_note is distinct from new.verification_note
         or old.is_active is distinct from new.is_active
       )
     ) then
    if coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'Road restriction verification requires trusted administrative review';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_road_restriction_verification() from public, anon, authenticated;
drop trigger if exists road_restrictions_guard_verification on public.road_restrictions;
create trigger road_restrictions_guard_verification
before insert or update on public.road_restrictions
for each row execute function private.guard_road_restriction_verification();

create index if not exists road_restrictions_fleet_active_idx
  on public.road_restrictions (fleet_id, is_active);
