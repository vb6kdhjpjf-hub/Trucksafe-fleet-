-- Invalid active-date ranges must never be interpreted as inactive.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.road_restrictions'::regclass
      AND conname = 'road_restrictions_active_date_range_check'
  ) THEN
    ALTER TABLE public.road_restrictions
      ADD CONSTRAINT road_restrictions_active_date_range_check
      CHECK (active_from IS NULL OR active_until IS NULL OR active_from <= active_until);
  END IF;
END;
$$;
