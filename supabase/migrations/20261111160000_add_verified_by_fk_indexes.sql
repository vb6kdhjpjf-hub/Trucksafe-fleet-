-- Index nullable reviewer references so FK checks and reviewer lookups
-- do not require sequential scans of the owning tables.
CREATE INDEX IF NOT EXISTS idx_road_restrictions_verified_by
  ON public.road_restrictions (verified_by);

CREATE INDEX IF NOT EXISTS idx_vehicles_registration_verified_by
  ON public.vehicles (registration_verified_by);
