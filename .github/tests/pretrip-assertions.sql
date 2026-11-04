-- Exercises driver and manager authorization, lifecycle, safety lockout, and RPC grants.
DO $test$
DECLARE
  f uuid := '10000000-0000-0000-0000-000000000001';
  d uuid := '20000000-0000-0000-0000-000000000001';
  v_ok uuid := '30000000-0000-0000-0000-000000000001';
  v_bad uuid := '30000000-0000-0000-0000-000000000002';
  v_manager uuid := '30000000-0000-0000-0000-000000000003';
  v_unauthorized uuid := '30000000-0000-0000-0000-000000000004';
  t_ok uuid := '40000000-0000-0000-0000-000000000001';
  t_bad uuid := '40000000-0000-0000-0000-000000000002';
  t_manager uuid := '40000000-0000-0000-0000-000000000003';
  t_unauthorized uuid := '40000000-0000-0000-0000-000000000004';
  driver_user uuid := '50000000-0000-0000-0000-000000000001';
  manager_user uuid := '50000000-0000-0000-0000-000000000002';
  dispatcher_user uuid := '50000000-0000-0000-0000-000000000004';
  outsider_user uuid := '50000000-0000-0000-0000-000000000003';
  v_trip_id uuid;
  checklist jsonb := jsonb_build_object(
    'צמיגים ולחץ אוויר תקינים', true,
    'בלמים ובלם חניה תקינים', true,
    'אורות, איתותים וצופר תקינים', true,
    'מראות, שמשות ומגבים תקינים', true,
    'אין נזילות או נזק גלוי', true,
    'המטען מאובטח והמשקל מתאים', true,
    'מסמכי רכב ורישיון נהיגה בתוקף', true
  );
BEGIN
  INSERT INTO public.fleet_members VALUES
    (f,driver_user,'driver'),(f,manager_user,'fleet_manager'),(f,dispatcher_user,'dispatcher');
  INSERT INTO public.drivers VALUES (d,f,'active',driver_user,current_date + 365);
  INSERT INTO public.vehicles(id,fleet_id,status,assigned_driver_id) VALUES
    (v_ok,f,'available',d),(v_bad,f,'available',d),
    (v_manager,f,'available',d),(v_unauthorized,f,'available',d);
  INSERT INTO public.tasks(id,fleet_id,assigned_driver_id,assigned_vehicle_id,status) VALUES
    (t_ok,f,d,v_ok,'assigned'),(t_bad,f,d,v_bad,'assigned'),
    (t_manager,f,d,v_manager,'assigned'),(t_unauthorized,f,d,v_unauthorized,'assigned');

  -- Assigned driver can start and finish their own trip.
  PERFORM set_config('request.jwt.claim.sub', driver_user::text, true);
  v_trip_id := public.start_trip_with_inspection(f,t_ok,d,v_ok,'Origin','Destination',checklist);
  IF v_trip_id IS NULL THEN RAISE EXCEPTION 'Assigned driver could not start a valid trip'; END IF;
  IF (SELECT status FROM public.trips WHERE id=v_trip_id) <> 'active'
     OR (SELECT status FROM public.vehicles WHERE id=v_ok) <> 'on_trip'
     OR NOT (SELECT passed FROM public.inspections WHERE inspections.trip_id=v_trip_id) THEN
    RAISE EXCEPTION 'Successful pre-trip lifecycle was not saved correctly';
  END IF;
  PERFORM public.finish_trip(f,v_trip_id);
  IF (SELECT status FROM public.trips WHERE id=v_trip_id) <> 'completed'
     OR (SELECT status FROM public.vehicles WHERE id=v_ok) <> 'available'
     OR (SELECT status FROM public.tasks WHERE id=t_ok) <> 'completed' THEN
    RAISE EXCEPTION 'finish_trip did not complete trip, task, and release vehicle';
  END IF;

  -- A non-member cannot start a trip for another driver's assignment.
  PERFORM set_config('request.jwt.claim.sub', outsider_user::text, true);
  BEGIN
    PERFORM public.start_trip_with_inspection(f,t_unauthorized,d,v_unauthorized,'Origin','Destination',checklist);
    RAISE EXCEPTION 'Non-member unexpectedly started a trip';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Non-member unexpectedly started a trip' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM public.trips WHERE task_id=t_unauthorized AND status='active') THEN
    RAISE EXCEPTION 'Unauthorized trip was created';
  END IF;

  -- A fleet manager can act for a driver in their fleet.
  PERFORM set_config('request.jwt.claim.sub', manager_user::text, true);
  v_trip_id := public.start_trip_with_inspection(f,t_manager,d,v_manager,'Origin','Destination',checklist);
  IF v_trip_id IS NULL THEN RAISE EXCEPTION 'Fleet manager could not start an assigned trip'; END IF;
  PERFORM set_config('request.jwt.claim.sub', outsider_user::text, true);
  BEGIN
    PERFORM public.finish_trip(f,v_trip_id);
    RAISE EXCEPTION 'Non-member unexpectedly finished a trip';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Non-member unexpectedly finished a trip' THEN RAISE; END IF;
  END;
  IF (SELECT status FROM public.trips WHERE id=v_trip_id) <> 'active' THEN
    RAISE EXCEPTION 'Unauthorized user changed trip status';
  END IF;
  PERFORM set_config('request.jwt.claim.sub', manager_user::text, true);
  PERFORM public.finish_trip(f,v_trip_id);
  IF (SELECT status FROM public.trips WHERE id=v_trip_id) <> 'completed' THEN
    RAISE EXCEPTION 'Fleet manager could not finish the trip';
  END IF;

  -- Driver-reported failed inspection is retained and blocks the vehicle.
  PERFORM set_config('request.jwt.claim.sub', driver_user::text, true);
  checklist := jsonb_set(checklist,'{"בלמים ובלם חניה תקינים"}','false'::jsonb);
  BEGIN
    PERFORM public.start_trip_with_inspection(f,t_bad,d,v_bad,'Origin','Destination',checklist);
    RAISE EXCEPTION 'Failed inspection without details was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Failed inspection without details was accepted' THEN RAISE; END IF;
  END;
  checklist := checklist || jsonb_build_object('_defect_details','Brake fault');
  v_trip_id := public.start_trip_with_inspection(f,t_bad,d,v_bad,'Origin','Destination',checklist);
  IF v_trip_id IS NOT NULL THEN RAISE EXCEPTION 'Failed inspection unexpectedly created a trip'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inspections WHERE vehicle_id=v_bad AND passed=false AND trip_id IS NULL)
     OR NOT EXISTS (SELECT 1 FROM public.incidents WHERE vehicle_id=v_bad AND status='open' AND severity='high') THEN
    RAISE EXCEPTION 'Failed inspection or high-severity incident was not recorded';
  END IF;

  BEGIN
    PERFORM public.start_trip_with_inspection(f,t_bad,d,v_bad,'Origin','Destination',checklist);
    RAISE EXCEPTION 'Open safety incident did not block another trip';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Open safety incident did not block another trip' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.start_trip_with_inspection(f,t_bad,d,v_bad,'Origin','Destination',checklist - 'מסמכי רכב ורישיון נהיגה בתוקף');
    RAISE EXCEPTION 'Incomplete checklist was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Incomplete checklist was accepted' THEN RAISE; END IF;
  END;

  -- Complete all checklist items, then verify that missing and expired
  -- compliance data independently blocks a trip.
  checklist := jsonb_set(checklist - '_defect_details',
    '{"בלמים ובלם חניה תקינים"}','true'::jsonb);
  UPDATE public.vehicles SET test_due_at = NULL WHERE id = v_unauthorized;
  BEGIN
    PERFORM public.start_trip_with_inspection(f,t_unauthorized,d,v_unauthorized,'Origin','Destination',checklist);
    RAISE EXCEPTION 'Missing vehicle document date was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Missing vehicle document date was accepted' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%חסרים תאריכי תוקף%' THEN RAISE; END IF;
  END;
  UPDATE public.vehicles SET test_due_at = current_date - 1 WHERE id = v_unauthorized;
  BEGIN
    PERFORM public.start_trip_with_inspection(f,t_unauthorized,d,v_unauthorized,'Origin','Destination',checklist);
    RAISE EXCEPTION 'Expired vehicle document was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Expired vehicle document was accepted' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%פג תוקף%' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM public.trips WHERE task_id=t_unauthorized AND status='active') THEN
    RAISE EXCEPTION 'Trip was created for a vehicle with expired documents';
  END IF;
  UPDATE public.vehicles SET test_due_at = current_date + 365 WHERE id = v_unauthorized;
  UPDATE public.drivers SET license_expires_at = NULL WHERE id = d;
  BEGIN
    PERFORM public.start_trip_with_inspection(f,t_unauthorized,d,v_unauthorized,'Origin','Destination',checklist);
    RAISE EXCEPTION 'Missing driver licence expiry was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Missing driver licence expiry was accepted' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%חסר תאריך תוקף לרישיון%' THEN RAISE; END IF;
  END;
  UPDATE public.drivers SET license_expires_at = current_date - 1 WHERE id = d;
  BEGIN
    PERFORM public.start_trip_with_inspection(f,t_unauthorized,d,v_unauthorized,'Origin','Destination',checklist);
    RAISE EXCEPTION 'Expired driver licence was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Expired driver licence was accepted' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%רישיון הנהיגה%' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM public.trips WHERE task_id=t_unauthorized AND status='active') THEN
    RAISE EXCEPTION 'Trip was created for a driver with an expired licence';
  END IF;
END $test$;

DO $test$
BEGIN
  IF (SELECT prosecdef FROM pg_proc WHERE oid='public.start_trip_with_inspection(uuid,uuid,uuid,uuid,text,text,jsonb)'::regprocedure) IS NOT TRUE
     OR (SELECT prosecdef FROM pg_proc WHERE oid='public.finish_trip(uuid,uuid)'::regprocedure) IS NOT TRUE THEN
    RAISE EXCEPTION 'Trip RPCs are not SECURITY DEFINER';
  END IF;
  IF has_function_privilege('anon','public.start_trip_with_inspection(uuid,uuid,uuid,uuid,text,text,jsonb)','EXECUTE')
     OR has_function_privilege('anon','public.finish_trip(uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute privileged RPC';
  END IF;
  IF NOT has_function_privilege('authenticated','public.start_trip_with_inspection(uuid,uuid,uuid,uuid,text,text,jsonb)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.finish_trip(uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot execute trip lifecycle RPCs';
  END IF;
  IF (SELECT prosecdef FROM pg_proc WHERE oid='public.get_latest_trip_locations(uuid)'::regprocedure) IS TRUE
     OR (SELECT prosecdef FROM pg_proc WHERE oid='public.get_active_trip_map_data(uuid)'::regprocedure) IS TRUE THEN
    RAISE EXCEPTION 'Fleet location read RPCs must remain SECURITY INVOKER';
  END IF;
  IF has_function_privilege('anon','public.get_latest_trip_locations(uuid)','EXECUTE')
     OR has_function_privilege('anon','public.get_active_trip_map_data(uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.get_latest_trip_locations(uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.get_active_trip_map_data(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Fleet location RPC grants are misconfigured';
  END IF;
  IF NOT ((SELECT proconfig FROM pg_proc WHERE oid='public.get_latest_trip_locations(uuid)'::regprocedure) @> ARRAY['search_path=""'])
     OR NOT ((SELECT proconfig FROM pg_proc WHERE oid='public.get_active_trip_map_data(uuid)'::regprocedure) @> ARRAY['search_path=""'])
     OR NOT ((SELECT proconfig FROM pg_proc WHERE oid='public.get_trip_distance_summaries(uuid,uuid[])'::regprocedure) @> ARRAY['search_path=""'])
     OR NOT ((SELECT proconfig FROM pg_proc WHERE oid='public.get_trip_history_data(uuid,uuid[])'::regprocedure) @> ARRAY['search_path=""']) THEN
    RAISE EXCEPTION 'Fleet read RPC search_path is not empty';
  END IF;
  IF has_function_privilege('anon','public.get_trip_distance_summaries(uuid,uuid[])','EXECUTE')
     OR has_function_privilege('anon','public.get_trip_history_data(uuid,uuid[])','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.get_trip_distance_summaries(uuid,uuid[])','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.get_trip_history_data(uuid,uuid[])','EXECUTE') THEN
    RAISE EXCEPTION 'GPS analytics RPC grants are misconfigured';
  END IF;
  IF has_function_privilege('anon','private.has_fleet_role(uuid,text[])','EXECUTE')
     OR has_function_privilege('anon','private.is_fleet_member(uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated','private.has_fleet_role(uuid,text[])','EXECUTE')
     OR NOT has_function_privilege('authenticated','private.is_fleet_member(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Private membership helper grants are misconfigured';
  END IF;
  IF NOT ((SELECT proconfig FROM pg_proc WHERE oid='public.start_trip_with_inspection(uuid,uuid,uuid,uuid,text,text,jsonb)'::regprocedure) @> ARRAY['search_path=""'])
     OR NOT ((SELECT proconfig FROM pg_proc WHERE oid='public.finish_trip(uuid,uuid)'::regprocedure) @> ARRAY['search_path=""']) THEN
    RAISE EXCEPTION 'Privileged RPC search_path is not empty';
  END IF;
  IF position('WHERE id = v_trip.vehicle_id AND fleet_id = p_fleet_id' IN
       pg_get_functiondef('public.finish_trip(uuid,uuid)'::regprocedure)) = 0
     OR position('FOR UPDATE' IN
       substring(pg_get_functiondef('public.finish_trip(uuid,uuid)'::regprocedure)
         FROM position('WHERE id = v_trip.vehicle_id AND fleet_id = p_fleet_id' IN
           pg_get_functiondef('public.finish_trip(uuid,uuid)'::regprocedure)))) = 0 THEN
    RAISE EXCEPTION 'finish_trip does not lock the vehicle before checking concurrent active trips';
  END IF;
END $test$;

-- Exercise least-privilege table grants under the authenticated role, not only
-- the SECURITY DEFINER RPC's catalog metadata.
GRANT USAGE ON SCHEMA public, private, auth TO authenticated;
GRANT SELECT ON public.drivers, public.vehicles, public.trips, public.inspections TO authenticated;
GRANT UPDATE ON public.vehicles TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;

-- Build a live map fixture, then call the invoker RPCs as an authenticated
-- fleet member to prove they remain behind the underlying RLS policies.
DO $test$
DECLARE
  f uuid := '10000000-0000-0000-0000-000000000001';
  d uuid := '20000000-0000-0000-0000-000000000001';
  v uuid := '30000000-0000-0000-0000-000000000005';
  t uuid := '40000000-0000-0000-0000-000000000005';
  trip_id uuid;
BEGIN
  INSERT INTO public.vehicles(id,fleet_id,status,assigned_driver_id) VALUES (v,f,'available',d);
  INSERT INTO public.tasks(id,fleet_id,assigned_driver_id,assigned_vehicle_id,status) VALUES (t,f,d,v,'assigned');
  PERFORM set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000001',true);
  trip_id := public.start_trip_with_inspection(f,t,d,v,'Origin','Destination',jsonb_build_object(
    'צמיגים ולחץ אוויר תקינים',true,
    'בלמים ובלם חניה תקינים',true,
    'אורות, איתותים וצופר תקינים',true,
    'מראות, שמשות ומגבים תקינים',true,
    'אין נזילות או נזק גלוי',true,
    'המטען מאובטח והמשקל מתאים',true,
    'מסמכי רכב ורישיון נהיגה בתוקף',true
  ));
  INSERT INTO public.trip_locations(trip_id,driver_id,latitude,longitude,recorded_at) VALUES
    (trip_id,d,31.5000,34.9000,now()-interval '30 seconds'),
    (trip_id,d,31.6000,35.0000,now());
  BEGIN
    INSERT INTO public.trip_locations(trip_id,driver_id,latitude,longitude,recorded_at)
    VALUES (trip_id,d,91,35,now());
    RAISE EXCEPTION 'Out-of-range GPS latitude was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
  BEGIN
    INSERT INTO public.trip_locations(trip_id,driver_id,latitude,longitude,speed_kmh,recorded_at)
    VALUES (trip_id,d,31.6,35,-1,now());
    RAISE EXCEPTION 'Negative GPS speed was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END $test$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000001',false);
DO $test$
DECLARE
  f uuid := '10000000-0000-0000-0000-000000000001';
  map_count integer;
  latest_count integer;
  history_count integer;
  latest_lat double precision;
  distance_value double precision;
  gps_points bigint;
  history_points jsonb;
BEGIN
  SELECT count(*) INTO map_count FROM public.get_active_trip_map_data(f);
  SELECT jsonb_array_length(history), latitude INTO history_count, latest_lat
  FROM public.get_active_trip_map_data(f) LIMIT 1;
  SELECT count(*) INTO latest_count FROM public.get_latest_trip_locations(f);
  SELECT distance_km, point_count INTO distance_value, gps_points
  FROM public.get_trip_distance_summaries(f,ARRAY['40000000-0000-0000-0000-000000000005']::uuid[]);
  SELECT points INTO history_points
  FROM public.get_trip_history_data(f,ARRAY['40000000-0000-0000-0000-000000000005']::uuid[]);
  IF map_count <> 1 OR latest_count <> 1 OR history_count <> 2 OR latest_lat <> 31.6 THEN
    RAISE EXCEPTION 'Fleet map RPC returned incomplete or non-latest GPS data';
  END IF;
  IF distance_value IS NULL OR distance_value <= 0 OR gps_points <> 2 OR jsonb_array_length(history_points) <> 2 THEN
    RAISE EXCEPTION 'GPS analytics RPC returned incomplete trip data';
  END IF;
END $test$;
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000003',false);
DO $test$
DECLARE
  f uuid := '10000000-0000-0000-0000-000000000001';
  n integer;
BEGIN
  SELECT count(*) INTO n FROM public.get_active_trip_map_data(f);
  IF n <> 0 THEN RAISE EXCEPTION 'Non-member received fleet map data'; END IF;
END $test$;
RESET ROLE;

-- Assigned drivers must not directly edit vehicle identity or compliance data.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000001',false);
DO $test$
BEGIN
  BEGIN
    UPDATE public.vehicles
    SET registration_number = 'DRIVER-TAMPER'
    WHERE id = '30000000-0000-0000-0000-000000000001';
    IF FOUND THEN
      RAISE EXCEPTION 'Assigned driver unexpectedly updated vehicle identity';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END $test$;
RESET ROLE;

-- Fleet managers retain direct vehicle update access.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000002',false);
UPDATE public.vehicles
SET registration_number = 'MANAGER-OK'
WHERE id = '30000000-0000-0000-0000-000000000001';
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000001',false);
DO $test$
BEGIN
  BEGIN
    INSERT INTO public.inspections (
      fleet_id, trip_id, vehicle_id, driver_id, inspection_type,
      checklist, defects, passed, inspected_at
    ) VALUES (
      '10000000-0000-0000-0000-000000000001', NULL,
      '30000000-0000-0000-0000-000000000002',
      '20000000-0000-0000-0000-000000000001',
      'pre_trip', '{"brakes":false}', 'RLS driver test', false, now()
    );
    RAISE EXCEPTION 'Authenticated client directly inserted an inspection';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END $test$;
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000003',false);
DO $test$
BEGIN
  BEGIN
    INSERT INTO public.inspections (
      fleet_id, trip_id, vehicle_id, driver_id, inspection_type,
      checklist, defects, passed, inspected_at
    ) VALUES (
      '10000000-0000-0000-0000-000000000001', NULL,
      '30000000-0000-0000-0000-000000000002',
      '20000000-0000-0000-0000-000000000001',
      'pre_trip', '{"brakes":false}', 'Unauthorized RLS test', false, now()
    );
    RAISE EXCEPTION 'Authenticated client directly inserted an inspection after write privileges were revoked';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  IF (SELECT count(*) FROM public.inspections
      WHERE defects = 'RLS driver test') <> 0 THEN
    RAISE EXCEPTION 'Non-member can read another fleet inspection';
  END IF;
END $test$;
RESET ROLE;

-- Dispatchers may assign work, but cannot create, alter, or delete vehicle
-- identity or compliance records.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000004',false);
DO $test$
BEGIN
  BEGIN
    INSERT INTO public.vehicles(id,fleet_id,registration_number,status)
    VALUES ('30000000-0000-0000-0000-000000000006',
      '10000000-0000-0000-0000-000000000001','DISPATCHER-INSERT','available');
    RAISE EXCEPTION 'Dispatcher directly inserted a vehicle';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  UPDATE public.vehicles SET registration_number='DISPATCHER-UPDATE'
  WHERE id='30000000-0000-0000-0000-000000000001';
  IF FOUND THEN RAISE EXCEPTION 'Dispatcher directly updated a vehicle'; END IF;
  DELETE FROM public.vehicles
  WHERE id='30000000-0000-0000-0000-000000000001';
  IF FOUND THEN RAISE EXCEPTION 'Dispatcher directly deleted a vehicle'; END IF;
END $test$;
RESET ROLE;

-- Driver licence identity and expiry data can be changed only by a fleet
-- owner/manager, never by a dispatcher.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000004',false);
DO $test$
BEGIN
  BEGIN
    INSERT INTO public.drivers(id,fleet_id,status,user_id,license_expires_at)
    VALUES ('20000000-0000-0000-0000-000000000005',
      '10000000-0000-0000-0000-000000000001','active',NULL,current_date+365);
    RAISE EXCEPTION 'Dispatcher directly inserted a driver';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  UPDATE public.drivers SET license_expires_at=current_date+500
  WHERE id='20000000-0000-0000-0000-000000000001';
  IF FOUND THEN RAISE EXCEPTION 'Dispatcher directly updated a driver licence'; END IF;
  DELETE FROM public.drivers
  WHERE id='20000000-0000-0000-0000-000000000001';
  IF FOUND THEN RAISE EXCEPTION 'Dispatcher directly deleted a driver'; END IF;
END $test$;
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000002',false);
UPDATE public.drivers SET license_expires_at=current_date+200
WHERE id='20000000-0000-0000-0000-000000000001';
RESET ROLE;

-- Direct trip lifecycle writes are disabled; only the validated RPCs may mutate trips.
DO $test$
BEGIN
  IF has_table_privilege('authenticated','public.trips','INSERT')
     OR has_table_privilege('authenticated','public.trips','UPDATE')
     OR has_table_privilege('authenticated','public.trips','DELETE') THEN
    RAISE EXCEPTION 'Authenticated clients retain direct trip write privileges';
  END IF;
  IF has_table_privilege('authenticated','public.inspections','INSERT')
     OR has_table_privilege('authenticated','public.inspections','UPDATE')
     OR has_table_privilege('authenticated','public.inspections','DELETE') THEN
    RAISE EXCEPTION 'Authenticated clients retain direct inspection write privileges';
  END IF;
  IF has_table_privilege('authenticated','public.fleet_members','INSERT')
     OR has_table_privilege('authenticated','public.fleet_members','UPDATE')
     OR has_table_privilege('authenticated','public.fleet_members','DELETE') THEN
    RAISE EXCEPTION 'Authenticated clients retain direct fleet membership write privileges';
  END IF;
  IF has_table_privilege('authenticated','public.fleets','UPDATE')
     OR has_table_privilege('authenticated','public.fleets','DELETE')
     OR NOT has_table_privilege('authenticated','public.fleets','INSERT') THEN
    RAISE EXCEPTION 'Fleet creation or ownership metadata privileges are misconfigured';
  END IF;
END $test$;

-- Assigned drivers cannot mark tasks completed directly; managers can still
-- perform ordinary task administration.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000001',false);
DO $test$
BEGIN
  UPDATE public.tasks SET status='completed'
  WHERE id='40000000-0000-0000-0000-000000000004';
  IF FOUND THEN
    RAISE EXCEPTION 'Assigned driver directly completed a task';
  END IF;
END $test$;
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000002',false);
UPDATE public.tasks SET status='in_progress'
WHERE id='40000000-0000-0000-0000-000000000004';
RESET ROLE;

-- A fleet member may create a new report only as themselves and in the open state.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000001',false);
INSERT INTO public.incidents (
  fleet_id, driver_id, vehicle_id, severity, incident_type,
  description, status, reported_at, created_by
) VALUES (
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000002',
  'medium','test','Valid incident report','open',now(),
  '50000000-0000-0000-0000-000000000001'
);
DO $test$
BEGIN
  BEGIN
    INSERT INTO public.incidents (
      fleet_id, driver_id, vehicle_id, severity, incident_type,
      description, status, reported_at, created_by
    ) VALUES (
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000002',
      'critical','test','Spoofed closed incident','closed',now(),
      '50000000-0000-0000-0000-000000000003'
    );
    RAISE EXCEPTION 'Incident insert bypassed reporter/status checks';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END $test$;
RESET ROLE;

