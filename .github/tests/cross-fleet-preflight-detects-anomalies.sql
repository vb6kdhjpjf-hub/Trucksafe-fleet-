-- Rollback-only negative test: the read-only preflight must detect a legacy cross-fleet link.
-- Runs only against the dedicated TruckSafe Fleet Test database.
BEGIN;

-- @auth-fixture 'ab000000-0000-4000-8000-000000000001' preflight-a@example.invalid
-- @auth-fixture 'ab000000-0000-4000-8000-000000000002' preflight-b@example.invalid

INSERT INTO public.fleets (id, name, owner_user_id)
VALUES
  ('bc000000-0000-4000-8000-000000000001', 'Preflight Fleet A', 'ab000000-0000-4000-8000-000000000001'),
  ('bc000000-0000-4000-8000-000000000002', 'Preflight Fleet B', 'ab000000-0000-4000-8000-000000000002');

INSERT INTO public.drivers (id, fleet_id, full_name)
VALUES ('cd000000-0000-4000-8000-000000000002', 'bc000000-0000-4000-8000-000000000002', 'Synthetic Cross-Fleet Driver');

-- Legacy single-column FK permits this mismatch; the preflight must flag it.
INSERT INTO public.tasks (id, fleet_id, title, assigned_driver_id)
VALUES (
  'de000000-0000-4000-8000-000000000001',
  'bc000000-0000-4000-8000-000000000001',
  'Synthetic cross-fleet anomaly',
  'cd000000-0000-4000-8000-000000000002'
);

\ir ../../supabase/diagnostics/cross_fleet_integrity_preflight.sql
ROLLBACK;
