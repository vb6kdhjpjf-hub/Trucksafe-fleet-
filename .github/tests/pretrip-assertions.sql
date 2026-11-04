DO $$
DECLARE
  f uuid := '10000000-0000-0000-0000-000000000001';
  d uuid := '20000000-0000-0000-0000-000000000001';
  v_ok uuid := '30000000-0000-0000-0000-000000000001';
  v_bad uuid := '30000000-0000-0000-0000-000000000002';
  t_ok uuid := '40000000-0000-0000-0000-000000000001';
  t_bad uuid := '40000000-0000-0000-0000-000000000002';
  user_id uuid := '50000000-0000-0000-0000-000000000001';
  trip_id uuid;
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
  INSERT INTO public.drivers VALUES (d,f,'active',user_id);
  INSERT INTO public.vehicles(id,fleet_id,status,assigned_driver_id) VALUES
    (v_ok,f,'available',d),(v_bad,f,'available',d);
  INSERT INTO public.tasks(id,fleet_id,assigned_driver_id,assigned_vehicle_id,status) VALUES
    (t_ok,f,d,v_ok,'assigned'),(t_bad,f,d,v_bad,'assigned');

  PERFORM set_config('request.jwt.claim.sub', user_id::text, true);
  PERFORM set_config('test.is_manager','false',true);
  trip_id := public.start_trip_with_inspection(f,t_ok,d,v_ok,'Origin','Destination',checklist);
  IF trip_id IS NULL THEN RAISE EXCEPTION 'Successful checklist did not create a trip'; END IF;
  IF (SELECT status FROM public.trips WHERE id=trip_id) <> 'active' THEN
    RAISE EXCEPTION 'Trip was not created as active';
  END IF;
  IF (SELECT status FROM public.vehicles WHERE id=v_ok) <> 'on_trip' THEN
    RAISE EXCEPTION 'Vehicle was not marked on_trip';
  END IF;
  IF NOT (SELECT passed FROM public.inspections WHERE trip_id=trip_id) THEN
    RAISE EXCEPTION 'Successful inspection was not saved as passed';
  END IF;

  PERFORM public.finish_trip(f,trip_id);
  IF (SELECT status FROM public.trips WHERE id=trip_id) <> 'completed' THEN
    RAISE EXCEPTION 'finish_trip did not complete trip';
  END IF;
  IF (SELECT status FROM public.vehicles WHERE id=v_ok) <> 'available' THEN
    RAISE EXCEPTION 'finish_trip did not release vehicle';
  END IF;

  checklist := jsonb_set(checklist,'{"בלמים ובלם חניה תקינים"}','false'::jsonb);
  checklist := checklist || jsonb_build_object('_defect_details','Brake fault');
  trip_id := public.start_trip_with_inspection(f,t_bad,d,v_bad,'Origin','Destination',checklist);
  IF trip_id IS NOT NULL THEN RAISE EXCEPTION 'Failed inspection unexpectedly created a trip'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inspections WHERE vehicle_id=v_bad AND passed=false AND trip_id IS NULL) THEN
    RAISE EXCEPTION 'Failed inspection was not recorded';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.incidents WHERE vehicle_id=v_bad AND status='open' AND severity='high') THEN
    RAISE EXCEPTION 'High severity safety incident was not opened';
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
  IF (SELECT prosecdef FROM pg_proc WHERE oid='public.start_trip_with_inspection(uuid,uuid,uuid,uuid,text,text,jsonb)'::regprocedure) IS NOT TRUE THEN
    RAISE EXCEPTION 'start_trip_with_inspection is not SECURITY DEFINER';
  END IF;
  IF (SELECT prosecdef FROM pg_proc WHERE oid='public.finish_trip(uuid,uuid)'::regprocedure) IS NOT TRUE THEN
    RAISE EXCEPTION 'finish_trip is not SECURITY DEFINER';
  END IF;
  IF has_function_privilege('anon','public.start_trip_with_inspection(uuid,uuid,uuid,uuid,text,text,jsonb)','EXECUTE')
     OR has_function_privilege('anon','public.finish_trip(uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute privileged RPC';
  END IF;
END $$;
