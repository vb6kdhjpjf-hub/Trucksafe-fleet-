DO $$
DECLARE
  anon_exec boolean;
  auth_exec boolean;
BEGIN
  SELECT has_function_privilege('anon', 'public.add_fleet_owner_membership()', 'EXECUTE'),
         has_function_privilege('authenticated', 'public.add_fleet_owner_membership()', 'EXECUTE')
    INTO anon_exec, auth_exec;
  IF anon_exec OR auth_exec THEN RAISE EXCEPTION 'Trigger-only fleet function is directly executable'; END IF;

  SELECT has_function_privilege('anon', 'public.handle_new_auth_user()', 'EXECUTE'),
         has_function_privilege('authenticated', 'public.handle_new_auth_user()', 'EXECUTE')
    INTO anon_exec, auth_exec;
  IF anon_exec OR auth_exec THEN RAISE EXCEPTION 'Trigger-only auth function is directly executable'; END IF;

  SELECT has_function_privilege('anon', 'public.finish_trip(uuid,uuid)', 'EXECUTE'),
         has_function_privilege('authenticated', 'public.finish_trip(uuid,uuid)', 'EXECUTE')
    INTO anon_exec, auth_exec;
  IF anon_exec OR NOT auth_exec THEN RAISE EXCEPTION 'finish_trip grants are incorrect'; END IF;

  SELECT has_function_privilege('anon', 'public.start_trip_with_inspection(uuid,uuid,uuid,uuid,text,text,jsonb)', 'EXECUTE'),
         has_function_privilege('authenticated', 'public.start_trip_with_inspection(uuid,uuid,uuid,uuid,text,text,jsonb)', 'EXECUTE')
    INTO anon_exec, auth_exec;
  IF anon_exec OR NOT auth_exec THEN RAISE EXCEPTION 'start_trip_with_inspection grants are incorrect'; END IF;
END;
$$;
