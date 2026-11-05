-- Safety, authorization, lifecycle and privacy assertions for the disposable database.
-- Exercises driver and manager authorization, lifecycle, safety lockout, and RPC grants.
-- Keep each DO block's opening and closing dollar-quote tag identical.
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
  other_driver_user uuid := '50000000-0000-0000-0000-000000000005';
  other_driver_id uuid := '20000000-0000-0000-0000-000000000002';
  other_vehicle_id uuid := '30000000-0000-0000-0000-000000000007';
  other_task_id uuid := '40000000-0000-0000-0000-000000000006';
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
    (f,driver_user,'driver'),(f,manager_user,'fleet_manager'),(f,dispatcher_user,'dispatcher'),(f,other_driver_user,'driver');
  INSERT INTO public.drivers(id,fleet_id,status,user_id,full_name,license_expires_at) VALUES
    (d,f,'active',driver_user,'Test Driver',current_date + 365),
    (other_driver_id,f,'active',other_driver_user,'Other Test Driver',current_date + 365);
  INSERT INTO public.vehicles(id,fleet_id,status,assigned_driver_id) VALUES
    (v_ok,f,'available',d),(v_bad,f,'available',d),
    (v_manager,f,'available',d),(v_unauthorized,f,'available',d),
    (other_vehicle_id,f,'available',other_driver_id);
  INSERT INTO public.tasks(id,fleet_id,assigned_driver_id,assigned_vehicle_id,status) VALUES
    (t_ok,f,d,v_ok,'assigned'),(t_bad,f,d,v_bad,'assigned'),
    (t_manager,f,d,v_manager,'assigned'),(t_unauthorized,f,d,v_unauthorized,'assigned'),
    (other_task_id,f,other_driver_id,other_vehicle_id,'assigned');

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

  -- A fleet manager must document corrective action before the lockout is
  -- released. Once resolved, the same vehicle can pass a fresh inspection.
  PERFORM set_config('request.jwt.claim.sub', manager_user::text, true);
  UPDATE public.incidents
  SET status='resolved', resolution_notes='בוצעה בדיקה חוזרת ותוקנה תקלה במערכת הבלמים'
  WHERE vehicle_id=v_bad AND status='open';
  IF NOT EXISTS (
    SELECT 1 FROM public.incidents
    WHERE vehicle_id=v_bad AND status='resolved'
      AND resolved_at IS NOT NULL AND resolved_by=manager_user
      AND resolution_notes IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Incident resolution evidence or server metadata was not saved';
  END IF;
  PERFORM set_config('request.jwt.claim.sub', driver_user::text, true);
  checklist := jsonb_set(checklist - '_defect_details',
    '{"בלמים ובלם חניה תקינים"}','true'::jsonb);
  v_trip_id := public.start_trip_with_inspection(f,t_bad,d,v_bad,'Origin','Destination',checklist);
  IF v_trip_id IS NULL THEN RAISE EXCEPTION 'Resolved safety lockout did not release after a fresh passed inspection'; END IF;
  PERFORM public.finish_trip(f,v_trip_id);

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
  IF (SELECT prosecdef FROM pg_proc WHERE oid='private.enforce_incident_resolution()'::regprocedure) IS TRUE
     OR has_function_privilege('anon','private.enforce_incident_resolution()','EXECUTE')
     OR NOT has_function_privilege('authenticated','private.enforce_incident_resolution()','EXECUTE')
     OR NOT ((SELECT proconfig FROM pg_proc WHERE oid='private.enforce_incident_resolution()'::regprocedure) @> ARRAY['search_path=""']) THEN
    RAISE EXCEPTION 'Incident resolution trigger security is misconfigured';
  END IF;
  IF NOT ((SELECT proconfig FROM pg_proc WHERE oid='public.start_trip_with_inspection(uuid,uuid,uuid,uuid,text,text,jsonb)'::regprocedure) @> ARRAY['search_path=""'])
     OR NOT ((SELECT proconfig FROM pg_proc WHERE oid='public.finish_trip(uuid,uuid)'::regprocedure) @> ARRAY['search_path=""']) THEN
    RAISE EXCEPTION 'Privileged RPC search_path is not empty';
  END IF;
  IF NOT ((SELECT proconfig FROM pg_proc WHERE oid='public.add_fleet_owner_membership()'::regprocedure) @> ARRAY['search_path=""'])
     OR NOT ((SELECT proconfig FROM pg_proc WHERE oid='public.handle_new_auth_user()'::regprocedure) @> ARRAY['search_path=""']) THEN
    RAISE EXCEPTION 'SECURITY DEFINER trigger search_path is not empty';
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
  UPDATE public.drivers SET license_expires_at = current_date + 365 WHERE id = d;
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
  active_trip_id uuid;
BEGIN
  INSERT INTO public.trip_locations(trip_id,driver_id,latitude,longitude,speed_kmh,heading_degrees)
  SELECT t.id,t.driver_id,31.7000,35.1000,35,180
  FROM public.trips t
  WHERE t.task_id='40000000-0000-0000-0000-000000000005' AND t.status='active';
  IF (SELECT count(*) FROM public.drivers WHERE fleet_id=f) <> 1 THEN
    RAISE EXCEPTION 'Driver can read other driver rows: visible_count=%', (SELECT count(*) FROM public.drivers WHERE fleet_id=f);
  END IF;
  IF EXISTS (SELECT 1 FROM public.vehicles WHERE id='30000000-0000-0000-0000-000000000007') THEN
    RAISE EXCEPTION 'Driver can read another driver vehicle';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tasks WHERE id='40000000-0000-0000-0000-000000000006') THEN
    RAISE EXCEPTION 'Driver can read another driver task';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fleet_members WHERE user_id='50000000-0000-0000-0000-000000000005') THEN
    RAISE EXCEPTION 'Driver can read another fleet member private record';
  END IF;
  SELECT id INTO active_trip_id FROM public.trips
  WHERE task_id='40000000-0000-0000-0000-000000000005' AND status='active';
  IF active_trip_id IS NULL THEN RAISE EXCEPTION 'Active GPS test trip was not found'; END IF;
  SELECT count(*) INTO map_count FROM public.get_active_trip_map_data(f);
  SELECT jsonb_array_length(history), latitude INTO history_count, latest_lat
  FROM public.get_active_trip_map_data(f) LIMIT 1;
  SELECT count(*) INTO latest_count FROM public.get_latest_trip_locations(f);
  SELECT distance_km, point_count INTO distance_value, gps_points
  FROM public.get_trip_distance_summaries(f,ARRAY[active_trip_id]::uuid[]);
  SELECT points INTO history_points
  FROM public.get_trip_history_data(f,ARRAY[active_trip_id]::uuid[]);
  IF map_count <> 1 OR latest_count <> 1 OR history_count <> 3 OR latest_lat <> 31.7 THEN
    RAISE EXCEPTION 'Fleet map RPC returned incomplete or non-latest GPS data';
  END IF;
  IF distance_value IS NULL OR distance_value <= 0 OR gps_points <> 3 OR jsonb_array_length(history_points) <> 3 THEN
    RAISE EXCEPTION 'GPS analytics RPC returned incomplete trip data: distance=%, point_count=%, history_count=%', distance_value, gps_points, CASE WHEN history_points IS NULL THEN NULL ELSE jsonb_array_length(history_points) END;
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

-- A dispatcher is a fleet member but is not the assigned driver, so cannot
-- inject a GPS point on another user's active trip.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000004',false);
DO $test$
BEGIN
  BEGIN
    INSERT INTO public.trip_locations(trip_id,driver_id,latitude,longitude)
    SELECT t.id,t.driver_id,31.8,35.2
    FROM public.trips t
    WHERE t.task_id='40000000-0000-0000-0000-000000000005' AND t.status='active';
    RAISE EXCEPTION 'Dispatcher injected a driver GPS point';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END $test$;
RESET ROLE;

-- Dispatchers retain operational fleet-wide visibility, but cannot inspect
-- other members' account records. Fleet managers can review all memberships.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000004',false);
DO $test$
DECLARE
  f uuid := '10000000-0000-0000-0000-000000000001';
BEGIN
  IF (SELECT count(*) FROM public.drivers WHERE fleet_id=f) <> 2
     OR (SELECT count(*) FROM public.vehicles WHERE fleet_id=f) <> 6
     OR (SELECT count(*) FROM public.tasks WHERE fleet_id=f) <> 6
     OR (SELECT count(*) FROM public.fleet_members WHERE fleet_id=f) <> 1 THEN
    RAISE EXCEPTION 'Dispatcher operational visibility or membership privacy is misconfigured';
  END IF;
END $test$;
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000002',false);
DO $test$
DECLARE
  f uuid := '10000000-0000-0000-0000-000000000001';
BEGIN
  IF (SELECT count(*) FROM public.fleet_members WHERE fleet_id=f) <> 4 THEN
    RAISE EXCEPTION 'Fleet manager cannot review all fleet memberships';
  END IF;
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
  BEGIN
    UPDATE public.drivers SET license_expires_at=current_date+500
    WHERE id='20000000-0000-0000-0000-000000000001';
    IF FOUND THEN RAISE EXCEPTION 'Dispatcher directly updated a driver licence'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    DELETE FROM public.drivers
    WHERE id='20000000-0000-0000-0000-000000000001';
    IF FOUND THEN RAISE EXCEPTION 'Dispatcher directly deleted a driver'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
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
  IF has_table_privilege('authenticated','public.trip_locations','INSERT')
     OR NOT has_column_privilege('authenticated','public.trip_locations','trip_id','INSERT')
     OR NOT has_column_privilege('authenticated','public.trip_locations','driver_id','INSERT')
     OR NOT has_column_privilege('authenticated','public.trip_locations','latitude','INSERT')
     OR NOT has_column_privilege('authenticated','public.trip_locations','longitude','INSERT')
     OR has_column_privilege('authenticated','public.trip_locations','recorded_at','INSERT')
     OR has_column_privilege('authenticated','public.trip_locations','id','INSERT')
     OR has_table_privilege('authenticated','public.trip_locations','UPDATE')
     OR has_table_privilege('authenticated','public.trip_locations','DELETE')
     OR has_table_privilege('anon','public.trip_locations','INSERT') THEN
    RAISE EXCEPTION 'GPS telemetry column privileges are misconfigured';
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
UPDATE public.tasks SET status='cancelled'
WHERE id='40000000-0000-0000-0000-000000000004';
RESET ROLE;

-- Task lifecycle states cannot be forged or historical tasks deleted by a
-- manager; only start_trip/finish_trip may set in_progress/completed.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000002',false);
DO $test$
BEGIN
  BEGIN
    UPDATE public.tasks SET status='in_progress'
    WHERE id='40000000-0000-0000-0000-000000000004';
    RAISE EXCEPTION 'Manager directly set task in_progress';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.tasks SET status='completed'
    WHERE id='40000000-0000-0000-0000-000000000004';
    RAISE EXCEPTION 'Manager directly completed task';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE public.tasks SET status='assigned'
  WHERE id='40000000-0000-0000-0000-000000000001';
  IF FOUND THEN RAISE EXCEPTION 'Manager changed a completed historical task'; END IF;
  BEGIN
    DELETE FROM public.tasks WHERE id='40000000-0000-0000-0000-000000000004';
    RAISE EXCEPTION 'Manager deleted a task history record';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $test$;
RESET ROLE;

-- A fleet member may create a new report only as themselves and in the open state.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000001',false);
INSERT INTO public.incidents (
  fleet_id, driver_id, vehicle_id, severity, incident_type,
  description, status, reported_at, created_by, photo_path
) VALUES (
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000002',
  'medium','test','Valid incident report','open',now(),
  '50000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001/incidents/test-photo.jpg'
);
RESET ROLE;
INSERT INTO storage.objects (bucket_id,name,owner) VALUES (
  'incident-photos',
  '10000000-0000-0000-0000-000000000001/incidents/test-photo.jpg',
  '50000000-0000-0000-0000-000000000001'
);

-- A different driver in the same fleet must not read this incident's photo.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000005',false);
DO $test$
BEGIN
  IF EXISTS (SELECT 1 FROM storage.objects WHERE name='10000000-0000-0000-0000-000000000001/incidents/test-photo.jpg') THEN
    RAISE EXCEPTION 'Unrelated fleet driver could read another incident photo';
  END IF;
END $test$;
RESET ROLE;



-- A driver assigned to a different incident's vehicle may read that incident
-- and photo, while another driver in the same fleet remains blocked.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000002',false);
INSERT INTO public.incidents (
  fleet_id, driver_id, vehicle_id, severity, incident_type,
  description, status, reported_at, created_by, photo_path
) VALUES (
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000007',
  'low','test','Assigned driver visibility test','open',now(),
  '50000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001/incidents/assigned-driver-photo.jpg'
);
RESET ROLE;
INSERT INTO storage.objects (bucket_id,name,owner) VALUES (
  'incident-photos',
  '10000000-0000-0000-0000-000000000001/incidents/assigned-driver-photo.jpg',
  '50000000-0000-0000-0000-000000000002'
);

-- The driver assigned to the incident vehicle can read its row and photo.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000005',false);
DO $test$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.incidents
    WHERE description='Assigned driver visibility test'
  ) THEN
    RAISE EXCEPTION 'Assigned driver could not read an incident for their vehicle';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE name='10000000-0000-0000-0000-000000000001/incidents/assigned-driver-photo.jpg'
  ) THEN
    RAISE EXCEPTION 'Assigned driver could not read the corresponding incident photo';
  END IF;
END $test$;
RESET ROLE;

-- The original driver is neither reporter nor assigned to this incident.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000001',false);
DO $test$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.incidents
    WHERE description='Assigned driver visibility test'
  ) THEN
    RAISE EXCEPTION 'Unexpected incident visibility: uid=%, creator_match=%, role=%, driver_match=%, vehicle_match=%, task_match=%',
      auth.uid(),
      (SELECT created_by = auth.uid() FROM public.incidents WHERE description='Assigned driver visibility test'),
      private.has_fleet_role('10000000-0000-0000-0000-000000000001', ARRAY['owner','fleet_manager','dispatcher','safety_manager']),
      EXISTS (SELECT 1 FROM public.drivers d WHERE d.fleet_id='10000000-0000-0000-0000-000000000001' AND d.user_id=auth.uid() AND d.id='20000000-0000-0000-0000-000000000002'),
      EXISTS (SELECT 1 FROM public.drivers d JOIN public.vehicles v ON v.assigned_driver_id=d.id WHERE d.fleet_id='10000000-0000-0000-0000-000000000001' AND d.user_id=auth.uid() AND v.id='30000000-0000-0000-0000-000000000005'),
      EXISTS (SELECT 1 FROM public.drivers d JOIN public.tasks t ON t.assigned_driver_id=d.id WHERE d.fleet_id='10000000-0000-0000-0000-000000000001' AND d.user_id=auth.uid() AND t.assigned_vehicle_id='30000000-0000-0000-0000-000000000005' AND t.status IN ('pending','assigned','in_progress'));
  END IF;
  IF EXISTS (
    SELECT 1 FROM storage.objects
    WHERE name='10000000-0000-0000-0000-000000000001/incidents/assigned-driver-photo.jpg'
  ) THEN
    RAISE EXCEPTION 'Unassigned driver could read a photo assigned to another driver';
  END IF;
END $test$;
RESET ROLE;

-- The incident reporter and fleet manager may read the corresponding photo.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000001',false);
DO $test$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE name='10000000-0000-0000-0000-000000000001/incidents/test-photo.jpg') THEN
    RAISE EXCEPTION 'Incident reporter could not read their own photo';
  END IF;
END $test$;
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000002',false);
DO $test$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE name='10000000-0000-0000-0000-000000000001/incidents/test-photo.jpg') THEN
    RAISE EXCEPTION 'Fleet manager could not read an incident photo';
  END IF;
END $test$;
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000002',false);
DO $test$
DECLARE
  incident_id uuid;
  resolved_at timestamptz;
  resolved_by uuid;
BEGIN
  SELECT id INTO incident_id FROM public.incidents
  WHERE description='Valid incident report'
    AND fleet_id='10000000-0000-0000-0000-000000000001'
  LIMIT 1;
  BEGIN
    UPDATE public.incidents
    SET status='resolved', resolution_notes='   '
    WHERE id=incident_id;
    RAISE EXCEPTION 'Incident resolved without resolution notes';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Incident resolved without resolution notes' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%תיעוד טיפול%' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.incidents
    SET status='resolved', resolution_notes=repeat('x',1001)
    WHERE id=incident_id;
    RAISE EXCEPTION 'Incident accepted resolution notes longer than 1,000 characters';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Incident accepted resolution notes longer than 1,000 characters' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%1,000%' THEN RAISE; END IF;
  END;
  UPDATE public.incidents
  SET status='resolved', resolution_notes='בוצעה בדיקה חוזרת והתקלה טופלה'
  WHERE id=incident_id;
  SELECT incidents.resolved_at, incidents.resolved_by
  INTO resolved_at, resolved_by
  FROM public.incidents WHERE id=incident_id;
  IF resolved_at IS NULL OR resolved_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Incident resolution metadata was not assigned by the database';
  END IF;
END $test$;
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000001',false);
DO $test$
BEGIN
  BEGIN
    INSERT INTO public.incidents (
      fleet_id, driver_id, vehicle_id, severity, incident_type,
      description, status, reported_at, created_by, resolution_notes
    ) VALUES (
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000002',
      'critical','test','Spoofed closed incident','closed',now(),
      '50000000-0000-0000-0000-000000000003','attempted spoof'
    );
    RAISE EXCEPTION 'Incident insert bypassed reporter/status checks';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END $test$;
RESET ROLE;


-- Keep this assertion suite on the latest feature-branch revision for PR CI validation.

-- Trigger fresh PR validation after workflow is enabled on main.

-- Trigger push-based SQL validation after adding the branch push event.

-- Ensure the migration removes the legacy permissive incident policy; RLS policies OR together.
DO $test$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='incidents'
      AND policyname='incidents_update_safety' AND cmd='UPDATE'
  ) THEN
    RAISE EXCEPTION 'Legacy incidents_update_safety policy survived migration';
  END IF;
END $test$;

