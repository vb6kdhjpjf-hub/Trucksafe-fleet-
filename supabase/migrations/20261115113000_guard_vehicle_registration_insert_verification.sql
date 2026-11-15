-- Prevent fleet managers from self-approving registration evidence on vehicle creation.
-- The existing guard covers UPDATE only; INSERT must also be restricted to the
-- trusted verification service before a vehicle can become routing-eligible.

create or replace function private.guard_vehicle_registration_verification()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  is_service_role boolean := coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
  routing_profile_changed boolean;
begin
  if tg_op = 'INSERT' then
    if not is_service_role then
      -- Client-created vehicles always begin without trusted registration evidence.
      new.registration_verification_status := 'unverified';
      new.registration_document_path := null;
      new.registration_document_uploaded_at := null;
      new.registration_verified_at := null;
      new.registration_verified_by := null;
      new.registration_verification_note := null;
    end if;
    return new;
  end if;

  routing_profile_changed :=
    new.registration_number is distinct from old.registration_number
    or new.make is distinct from old.make
    or new.model is distinct from old.model
    or new.vehicle_type is distinct from old.vehicle_type
    or new.registration_document_path is distinct from old.registration_document_path
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
$$;

-- Attach the guard to INSERT as well as UPDATE; replacing the function alone
-- would leave newly inserted rows outside the verification guard.
drop trigger if exists guard_vehicle_registration_verification on public.vehicles;
create trigger guard_vehicle_registration_verification
before insert or update on public.vehicles
for each row execute function private.guard_vehicle_registration_verification();
