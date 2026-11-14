-- Cover the auth.users foreign key used by verified special-equipment evidence.
-- This index keeps account deletion / ON DELETE SET NULL checks efficient.
create index if not exists idx_vehicle_special_equipment_evidence_verified_by
  on public.vehicle_special_equipment (evidence_verified_by);
