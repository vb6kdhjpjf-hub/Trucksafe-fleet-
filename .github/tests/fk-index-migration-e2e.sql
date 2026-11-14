-- Exercise the additive migration against the dedicated test schema only.
-- The migration and its index objects are rolled back at the end.
BEGIN;

\ir ../../supabase/migrations/20261111160000_add_verified_by_fk_indexes.sql

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_road_restrictions_verified_by'
      AND indexdef ILIKE '%(verified_by)%'
  ) THEN
    RAISE EXCEPTION 'Missing road_restrictions.verified_by index';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_vehicles_registration_verified_by'
      AND indexdef ILIKE '%(registration_verified_by)%'
  ) THEN
    RAISE EXCEPTION 'Missing vehicles.registration_verified_by index';
  END IF;
END
$$;

ROLLBACK;
