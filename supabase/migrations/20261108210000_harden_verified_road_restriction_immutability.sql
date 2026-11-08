-- Harden immutable fields on verified road restrictions.
-- A verified restriction must not be reassigned or have its source notes/creator rewritten
-- by ordinary fleet users. Trusted service-role review remains the only exception.

create or replace function private.guard_road_restriction_verification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.verification_status <> 'unverified'
       or new.verified_at is not null
       or new.verified_by is not null
       or new.source_last_checked_at is not null
       or new.verification_note is not null then
      if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
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
         old.fleet_id is distinct from new.fleet_id
         or old.road_name is distinct from new.road_name
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
         or old.notes is distinct from new.notes
         or old.created_by is distinct from new.created_by
         or old.created_at is distinct from new.created_at
         or old.is_active is distinct from new.is_active
       )
     ) then
    if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
      raise exception 'Road restriction verification requires trusted administrative review';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_road_restriction_verification() from public, anon, authenticated;
