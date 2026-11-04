-- Exercises driver and manager authorization, lifecycle, safety lockout, and RPC grants.
DO $$
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
    (f,driver_user,'driver'),(f,manager_user,'fleet_manager');
  INSERT INTO public.drivers VALUES (d,f,'active',driver_user);
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
  PERFORM public.finish_trip(f,v_trip_id);
  IF (SELECT status FROM public.trips WHERE id=v_trip_id) <> 'completed' THEN
    RAISE EXCEPTION 'Fleet manager could not finish the trip';
  END IF;

  -- Driver-reported failed inspection is retained and blocks the vehicle.
  PERFORM set_config('request.jwt.claim.sub', driver_user::text, true);
  checklist := jsonb_set(checklist,'{"בלמים ובלם חניה תקינים"}','false'::jsonb);
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
END $$;

DO $$
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
  IF NOT ((SELECT proconfig FROM pg_proc WHERE oid='public.start_trip_with_inspection(uuid,uuid,uuid,uuid,text,text,jsonb)'::regprocedure) @> ARRAY['search_path=""'])
     OR NOT ((SELECT proconfig FROM pg_proc WHERE oid='public.finish_trip(uuid,uuid)'::regprocedure) @> ARRAY['search_path=""']) THEN
    RAISE EXCEPTION 'Privileged RPC search_path is not empty';
  END IF;
END $$;
