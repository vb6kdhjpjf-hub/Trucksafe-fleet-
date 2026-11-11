-- Rollback-only cross-fleet integrity and delete-action tests.
-- Runs only against the dedicated TruckSafe Fleet Test database.
BEGIN;

\ir ../../supabase/migrations/20261111162000_enforce_fleet_scoped_foreign_keys.sql

CREATE TEMP TABLE trucksafe_fk_results (
  scenario text PRIMARY KEY,
  outcome text NOT NULL
) ON COMMIT DROP;

CREATE FUNCTION pg_temp.assert_fk_rejects(statement text, scenario text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE statement;
  RAISE EXCEPTION 'Expected foreign-key rejection: %', scenario;
EXCEPTION WHEN foreign_key_violation THEN
  INSERT INTO pg_temp.trucksafe_fk_results VALUES (scenario, 'PASS');
  RETURN;
END;
$$;

DO $test$
DECLARE
  u_a uuid := 'aa000000-0000-4000-8000-000000000001';
  u_b uuid := 'aa000000-0000-4000-8000-000000000002';
  f_a uuid := 'bb000000-0000-4000-8000-000000000001';
  f_b uuid := 'bb000000-0000-4000-8000-000000000002';
  d_a uuid := 'cc000000-0000-4000-8000-000000000001';
  d_b uuid := 'cc000000-0000-4000-8000-000000000002';
  d_extra uuid := 'cc000000-0000-4000-8000-000000000003';
  v_a uuid := 'dd000000-0000-4000-8000-000000000001';
  v_b uuid := 'dd000000-0000-4000-8000-000000000002';
  v_extra uuid := 'dd000000-0000-4000-8000-000000000003';
  task_a uuid := 'ee000000-0000-4000-8000-000000000001';
  task_b uuid := 'ee000000-0000-4000-8000-000000000002';
  task_extra uuid := 'ee000000-0000-4000-8000-000000000003';
  task_trip_extra uuid := 'ee000000-0000-4000-8000-000000000004';
  trip_a uuid := 'ff000000-0000-4000-8000-000000000001';
  trip_b uuid := 'ff000000-0000-4000-8000-000000000002';
  trip_extra uuid := 'ff000000-0000-4000-8000-000000000003';
  inc_a uuid := '11000000-0000-4000-8000-000000000001';
  inc_b uuid := '11000000-0000-4000-8000-000000000002';
  inc_extra uuid := '11000000-0000-4000-8000-000000000003';
  inc_trip_extra uuid := '11000000-0000-4000-8000-000000000004';
  insp_a uuid := '22000000-0000-4000-8000-000000000001';
  insp_b uuid := '22000000-0000-4000-8000-000000000002';
  insp_extra uuid := '22000000-0000-4000-8000-000000000003';
  mr_a uuid := '33000000-0000-4000-8000-000000000001';
  mr_b uuid := '33000000-0000-4000-8000-000000000002';
  mr_extra uuid := '33000000-0000-4000-8000-000000000003';
  mr_inc_extra uuid := '33000000-0000-4000-8000-000000000004';
  n integer;
BEGIN
  -- Synthetic auth identities; all records are rolled back at transaction end.
  INSERT INTO auth.users (id, aud, role, email, created_at, updated_at)
  VALUES
    (u_a, 'authenticated', 'authenticated', 'fleet-a-fk-test@example.invalid', now(), now()),
    (u_b, 'authenticated', 'authenticated', 'fleet-b-fk-test@example.invalid', now(), now());

  INSERT INTO public.fleets (id, name, owner_user_id)
  VALUES (f_a, 'FK Test Fleet A', u_a), (f_b, 'FK Test Fleet B', u_b);

  INSERT INTO public.drivers (id, fleet_id, full_name)
  VALUES
    (d_a, f_a, 'Synthetic Driver A'),
    (d_b, f_b, 'Synthetic Driver B'),
    (d_extra, f_a, 'Synthetic Optional Driver');

  INSERT INTO public.vehicles (id, fleet_id, registration_number, assigned_driver_id)
  VALUES
    (v_a, f_a, 'FKTEST-A-001', d_a),
    (v_b, f_b, 'FKTEST-B-001', d_b),
    (v_extra, f_a, 'FKTEST-A-EXTRA', NULL);

  INSERT INTO public.tasks (id, fleet_id, title, assigned_driver_id, assigned_vehicle_id)
  VALUES
    (task_a, f_a, 'Fleet A task', d_a, v_a),
    (task_b, f_b, 'Fleet B task', d_b, v_b),
    (task_extra, f_a, 'Optional links task', d_extra, v_extra),
    (task_trip_extra, f_a, 'Task deletion behavior', d_a, v_a);

  -- The production trip trigger requires a signed-in actor context.
  PERFORM set_config('request.jwt.claim.sub', u_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  INSERT INTO public.trips (id, fleet_id, task_id, driver_id, vehicle_id)
  VALUES
    (trip_a, f_a, task_a, d_a, v_a),
    (trip_b, f_b, task_b, d_b, v_b),
    (trip_extra, f_a, task_trip_extra, d_a, v_a);

  INSERT INTO public.incidents
    (id, fleet_id, trip_id, driver_id, vehicle_id, incident_type, description)
  VALUES
    (inc_a, f_a, trip_a, d_a, v_a, 'collision', 'Synthetic fleet A incident'),
    (inc_b, f_b, trip_b, d_b, v_b, 'collision', 'Synthetic fleet B incident'),
    (inc_extra, f_a, NULL, NULL, NULL, 'other', 'Incident delete behavior'),
    (inc_trip_extra, f_a, trip_extra, d_a, v_a, 'other', 'Trip delete behavior');

  INSERT INTO public.inspections
    (id, fleet_id, trip_id, vehicle_id, driver_id, checklist, passed)
  VALUES
    (insp_a, f_a, trip_a, v_a, d_a, '{}'::jsonb, true),
    (insp_b, f_b, trip_b, v_b, d_b, '{}'::jsonb, true),
    (insp_extra, f_a, trip_extra, v_a, d_a, '{}'::jsonb, true);

  INSERT INTO public.maintenance_records
    (id, fleet_id, vehicle_id, incident_id, maintenance_type)
  VALUES
    (mr_a, f_a, v_a, inc_a, 'inspection'),
    (mr_b, f_b, v_b, inc_b, 'inspection'),
    (mr_extra, f_a, v_extra, NULL, 'repair'),
    (mr_inc_extra, f_a, v_a, inc_extra, 'repair');

  INSERT INTO public.trip_locations (trip_id, driver_id, latitude, longitude)
  VALUES
    (trip_a, d_a, 32.0001, 34.0001),
    (trip_b, d_b, 32.0002, 34.0002),
    (trip_extra, d_a, 32.0003, 34.0003);

  -- Positive same-fleet references must remain accepted.
  INSERT INTO pg_temp.trucksafe_fk_results VALUES
    ('same-fleet task, trip, incident, inspection and maintenance links', 'PASS'),
    ('trip location matches its trip driver', 'PASS');

  -- Negative cross-fleet references must be rejected by the database itself.
  PERFORM pg_temp.assert_fk_rejects(
    format('INSERT INTO public.vehicles (fleet_id, registration_number, assigned_driver_id) VALUES (%L,%L,%L)', f_a, 'FKTEST-CROSS-VEHICLE', d_b),
    'vehicle assigned driver cannot cross fleets');

  PERFORM pg_temp.assert_fk_rejects(
    format('INSERT INTO public.tasks (fleet_id,title,assigned_driver_id) VALUES (%L,%L,%L)', f_a, 'bad task driver', d_b),
    'task driver cannot cross fleets');
  PERFORM pg_temp.assert_fk_rejects(
    format('INSERT INTO public.tasks (fleet_id,title,assigned_vehicle_id) VALUES (%L,%L,%L)', f_a, 'bad task vehicle', v_b),
    'task vehicle cannot cross fleets');

  PERFORM pg_temp.assert_fk_rejects(
    format('INSERT INTO public.trips (fleet_id,driver_id,vehicle_id,task_id) VALUES (%L,%L,%L,%L)', f_a, d_a, v_a, task_b),
    'trip task cannot cross fleets');
  PERFORM pg_temp.assert_fk_rejects(
    format('INSERT INTO public.trips (fleet_id,driver_id,vehicle_id) VALUES (%L,%L,%L)', f_a, d_b, v_a),
    'trip driver cannot cross fleets');
  PERFORM pg_temp.assert_fk_rejects(
    format('INSERT INTO public.trips (fleet_id,driver_id,vehicle_id) VALUES (%L,%L,%L)', f_a, d_a, v_b),
    'trip vehicle cannot cross fleets');

  PERFORM pg_temp.assert_fk_rejects(
    format('INSERT INTO public.incidents (fleet_id,trip_id,driver_id,vehicle_id,incident_type,description) VALUES (%L,%L,%L,%L,%L,%L)', f_a, trip_b, d_a, v_a, 'other', 'bad trip'),
    'incident trip cannot cross fleets');
  PERFORM pg_temp.assert_fk_rejects(
    format('INSERT INTO public.incidents (fleet_id,driver_id,incident_type,description) VALUES (%L,%L,%L,%L)', f_a, d_b, 'other', 'bad driver'),
    'incident driver cannot cross fleets');
  PERFORM pg_temp.assert_fk_rejects(
    format('INSERT INTO public.incidents (fleet_id,vehicle_id,incident_type,description) VALUES (%L,%L,%L,%L)', f_a, v_b, 'other', 'bad vehicle'),
    'incident vehicle cannot cross fleets');

  PERFORM pg_temp.assert_fk_rejects(
    format('INSERT INTO public.inspections (fleet_id,trip_id,vehicle_id,driver_id) VALUES (%L,%L,%L,%L)', f_a, trip_b, v_a, d_a),
    'inspection trip cannot cross fleets');
  PERFORM pg_temp.assert_fk_rejects(
    format('INSERT INTO public.inspections (fleet_id,trip_id,vehicle_id,driver_id) VALUES (%L,%L,%L,%L)', f_a, trip_a, v_a, d_b),
    'inspection driver cannot cross fleets');
  PERFORM pg_temp.assert_fk_rejects(
    format('INSERT INTO public.inspections (fleet_id,trip_id,vehicle_id,driver_id) VALUES (%L,%L,%L,%L)', f_a, trip_a, v_b, d_a),
    'inspection vehicle cannot cross fleets');

  PERFORM pg_temp.assert_fk_rejects(
    format('INSERT INTO public.maintenance_records (fleet_id,vehicle_id,maintenance_type,incident_id) VALUES (%L,%L,%L,%L)', f_a, v_b, 'repair', inc_a),
    'maintenance vehicle cannot cross fleets');
  PERFORM pg_temp.assert_fk_rejects(
    format('INSERT INTO public.maintenance_records (fleet_id,vehicle_id,maintenance_type,incident_id) VALUES (%L,%L,%L,%L)', f_a, v_a, 'repair', inc_b),
    'maintenance incident cannot cross fleets');

  PERFORM pg_temp.assert_fk_rejects(
    format('INSERT INTO public.trip_locations (trip_id,driver_id,latitude,longitude) VALUES (%L,%L,32.1,34.1)', trip_a, d_b),
    'trip location driver must match trip driver');

  -- ON DELETE SET NULL preserves the owning fleet and only clears the optional reference.
  DELETE FROM public.drivers WHERE id = d_extra;
  SELECT count(*) INTO n FROM public.tasks
    WHERE id = task_extra AND fleet_id = f_a AND assigned_driver_id IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'Task driver delete did not null only assigned_driver_id'; END IF;
  INSERT INTO pg_temp.trucksafe_fk_results VALUES ('task driver delete sets optional reference null', 'PASS');

  DELETE FROM public.vehicles WHERE id = v_extra;
  SELECT count(*) INTO n FROM public.tasks
    WHERE id = task_extra AND fleet_id = f_a AND assigned_vehicle_id IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'Task vehicle delete did not null only assigned_vehicle_id'; END IF;
  SELECT count(*) INTO n FROM public.maintenance_records WHERE id = mr_extra;
  IF n <> 0 THEN RAISE EXCEPTION 'Vehicle delete did not cascade maintenance record'; END IF;
  INSERT INTO pg_temp.trucksafe_fk_results VALUES ('vehicle delete nulls task link and cascades maintenance', 'PASS');

  DELETE FROM public.incidents WHERE id = inc_extra;
  SELECT count(*) INTO n FROM public.maintenance_records
    WHERE id = mr_inc_extra AND incident_id IS NULL AND fleet_id = f_a;
  IF n <> 1 THEN RAISE EXCEPTION 'Incident delete did not null only incident_id'; END IF;
  INSERT INTO pg_temp.trucksafe_fk_results VALUES ('incident delete sets optional maintenance link null', 'PASS');

  DELETE FROM public.tasks WHERE id = task_trip_extra;
  SELECT count(*) INTO n FROM public.trips
    WHERE id = trip_extra AND task_id IS NULL AND fleet_id = f_a;
  IF n <> 1 THEN RAISE EXCEPTION 'Task delete did not null trip task_id'; END IF;
  INSERT INTO pg_temp.trucksafe_fk_results VALUES ('task delete sets trip task_id null', 'PASS');

  -- Trip deletion clears optional trip references and cascades location history.
  DELETE FROM public.trips WHERE id = trip_extra;
  SELECT count(*) INTO n FROM public.inspections
    WHERE id = insp_extra AND trip_id IS NULL AND fleet_id = f_a;
  IF n <> 1 THEN RAISE EXCEPTION 'Trip delete did not null inspection trip_id'; END IF;
  SELECT count(*) INTO n FROM public.trip_locations WHERE trip_id = trip_extra;
  IF n <> 0 THEN RAISE EXCEPTION 'Trip delete did not cascade trip locations'; END IF;
  SELECT count(*) INTO n FROM public.incidents
    WHERE id = inc_trip_extra AND trip_id IS NULL AND fleet_id = f_a;
  IF n <> 1 THEN RAISE EXCEPTION 'Trip delete did not null incident trip_id'; END IF;
  INSERT INTO pg_temp.trucksafe_fk_results VALUES ('trip delete nulls incident and inspection links and cascades locations', 'PASS');

  -- Driver and vehicle references on active trip/inspection rows remain NO ACTION.
  PERFORM pg_temp.assert_fk_rejects(
    format('DELETE FROM public.drivers WHERE id = %L', d_a),
    'driver delete is blocked while operational references exist');
  PERFORM pg_temp.assert_fk_rejects(
    format('DELETE FROM public.vehicles WHERE id = %L', v_a),
    'vehicle delete is blocked while operational references exist');
END
$test$;

SELECT scenario, outcome FROM pg_temp.trucksafe_fk_results ORDER BY scenario;
ROLLBACK;
