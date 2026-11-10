-- Enforce road restriction verification in the database, not only in the UI.
-- Only fleet owners/managers may make review decisions. New records can never be
-- inserted as verified, and edits to a verified restriction invalidate its review.

create or replace function private.guard_road_restriction_verification()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  review_changed boolean;
  source_details_changed boolean;
  has_point boolean;
  has_segment boolean;
begin
  if TG_OP = 'INSERT' then
    if NEW.verification_status is distinct from 'unverified' then
      raise exception 'New road restrictions must start unverified';
    end if;
    return NEW;
  end if;

  review_changed :=
    row(NEW.verification_status, NEW.verified_at, NEW.verified_by,
        NEW.source_last_checked_at, NEW.verification_note, NEW.verification_notes)
    is distinct from
    row(OLD.verification_status, OLD.verified_at, OLD.verified_by,
        OLD.source_last_checked_at, OLD.verification_note, OLD.verification_notes);

  if review_changed and not private.has_fleet_role(
    OLD.fleet_id, array['owner', 'fleet_manager']::text[]
  ) then
    raise exception 'Only fleet owners and fleet managers may review road restrictions';
  end if;

  source_details_changed :=
    row(NEW.road_name, NEW.restriction_type, NEW.direction,
        NEW.max_height_m, NEW.max_weight_t, NEW.max_width_m, NEW.max_length_m,
        NEW.valid_from, NEW.valid_until, NEW.active_from, NEW.active_until,
        NEW.latitude, NEW.longitude, NEW.start_latitude, NEW.start_longitude,
        NEW.end_latitude, NEW.end_longitude, NEW.radius_m,
        NEW.source_type, NEW.source_name, NEW.source_url, NEW.source_reference,
        NEW.source_updated_at, NEW.expires_at)
    is distinct from
    row(OLD.road_name, OLD.restriction_type, OLD.direction,
        OLD.max_height_m, OLD.max_weight_t, OLD.max_width_m, OLD.max_length_m,
        OLD.valid_from, OLD.valid_until, OLD.active_from, OLD.active_until,
        OLD.latitude, OLD.longitude, OLD.start_latitude, OLD.start_longitude,
        OLD.end_latitude, OLD.end_longitude, OLD.radius_m,
        OLD.source_type, OLD.source_name, OLD.source_url, OLD.source_reference,
        OLD.source_updated_at, OLD.expires_at);

  if OLD.verification_status = 'verified'
     and NEW.verification_status = 'verified'
     and source_details_changed then
    NEW.verification_status := 'unverified';
    NEW.verified_at := null;
    NEW.verified_by := null;
    NEW.source_last_checked_at := null;
    NEW.verification_note := null;
    NEW.verification_notes := null;
  end if;

  if NEW.verification_status = 'verified' then
    if NEW.verified_by is null or NEW.verified_by is distinct from (select auth.uid()) then
      raise exception 'Verified reviewer must match the authenticated user';
    end if;
    if NEW.verified_at is null
       or NEW.verified_at > now() + interval '5 minutes'
       or NEW.verified_at < now() - interval '5 minutes' then
      raise exception 'Verification timestamp must be current';
    end if;
    if NEW.source_last_checked_at is null
       or NEW.source_last_checked_at > now() + interval '5 minutes'
       or NEW.source_last_checked_at < now() - interval '30 days' then
      raise exception 'Source must have been checked within the last 30 days';
    end if;
    if NEW.source_name is null or btrim(NEW.source_name) = ''
       or NEW.source_url is null or NEW.source_url !~* '^https://'
       or NEW.verification_note is null or length(btrim(NEW.verification_note)) < 12 then
      raise exception 'Source name, HTTPS source URL, and a detailed verification note are required';
    end if;
    if NEW.source_type not in ('official_authority', 'municipal_authority', 'road_operator') then
      raise exception 'Only official authorities and road operators can be used for routing verification';
    end if;

    has_point := NEW.latitude is not null and NEW.longitude is not null;
    has_segment := NEW.start_latitude is not null and NEW.start_longitude is not null
      and NEW.end_latitude is not null and NEW.end_longitude is not null;
    if not has_point and not has_segment then
      raise exception 'A verified restriction requires a point or complete road segment';
    end if;
    if has_point and (NEW.latitude < 29 or NEW.latitude > 34 or NEW.longitude < 34 or NEW.longitude > 36) then
      raise exception 'Point coordinates must be within the supported Israel bounds';
    end if;
    if has_segment and (
      NEW.start_latitude < 29 or NEW.start_latitude > 34
      or NEW.end_latitude < 29 or NEW.end_latitude > 34
      or NEW.start_longitude < 34 or NEW.start_longitude > 36
      or NEW.end_longitude < 34 or NEW.end_longitude > 36
    ) then
      raise exception 'Road segment coordinates must be within the supported Israel bounds';
    end if;
    if NEW.expires_at is not null and NEW.expires_at <= now() then
      raise exception 'An expired restriction cannot be verified';
    end if;
    if NEW.restriction_type = 'height' and coalesce(NEW.max_height_m, 0) <= 0 then
      raise exception 'A positive height limit is required';
    elsif NEW.restriction_type = 'weight' and coalesce(NEW.max_weight_t, 0) <= 0 then
      raise exception 'A positive weight limit is required';
    elsif NEW.restriction_type = 'width' and coalesce(NEW.max_width_m, 0) <= 0 then
      raise exception 'A positive width limit is required';
    elsif NEW.restriction_type = 'length' and coalesce(NEW.max_length_m, 0) <= 0 then
      raise exception 'A positive length limit is required';
    elsif NEW.restriction_type = 'time_window'
      and (NEW.valid_from is null or NEW.valid_until is null) then
      raise exception 'A complete time window is required';
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists road_restrictions_guard_verification on public.road_restrictions;
create trigger road_restrictions_guard_verification
before insert or update on public.road_restrictions
for each row execute function private.guard_road_restriction_verification();

comment on function private.guard_road_restriction_verification() is
  'Enforces owner/manager-only review, official source evidence, freshness, and automatic invalidation after material edits.';
