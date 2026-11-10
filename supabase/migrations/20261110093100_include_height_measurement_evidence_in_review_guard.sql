create or replace function public.guard_road_restriction_verification()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, private, auth
as $$
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
$$;
