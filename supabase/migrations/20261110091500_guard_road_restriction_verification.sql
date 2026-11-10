-- Enforce verification authority and evidence at the database boundary.
-- The UI is not trusted to enforce who may mark a road restriction as verified.
create or replace function public.guard_road_restriction_verification()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, private, auth
as $$
declare
  verification_changed boolean;
  note_value text;
  has_point boolean;
  has_segment boolean;
begin
  if TG_OP = 'INSERT' then
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

  if not verification_changed then
    return NEW;
  end if;

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
       or NEW.source_last_checked_at is null
       or (not has_point and not has_segment)
       or (has_point and (NEW.latitude < 29 or NEW.latitude > 34 or NEW.longitude < 34 or NEW.longitude > 36))
       or (has_segment and (
         NEW.start_latitude < 29 or NEW.start_latitude > 34
         or NEW.end_latitude < 29 or NEW.end_latitude > 34
         or NEW.start_longitude < 34 or NEW.start_longitude > 36
         or NEW.end_longitude < 34 or NEW.end_longitude > 36
       )) then
      raise exception 'Verified restrictions require an official source, HTTPS reference, current source check and valid Israel geometry';
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
$$;

drop trigger if exists road_restrictions_guard_verification on public.road_restrictions;
create trigger road_restrictions_guard_verification
before insert or update on public.road_restrictions
for each row execute function public.guard_road_restriction_verification();

comment on function public.guard_road_restriction_verification() is
  'Enforces owner/manager-only restriction verification with evidence and Israel location checks.';
