-- Rolling route quota: concurrency-safe per-user limit and row-level isolation.
DO $$
DECLARE
  user_a uuid := '33333333-3333-4333-8333-333333333333';
  user_b uuid := '44444444-4444-4444-8444-444444444444';
  allowed boolean;
  visible_count integer;
  is_security_definer boolean;
  i integer;
BEGIN
  IF NOT has_table_privilege('anon', 'private.truck_route_requests', 'SELECT') THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Anonymous users must not read the private route quota table';
  END IF;
  IF has_table_privilege('anon', 'private.truck_route_requests', 'INSERT') THEN
    RAISE EXCEPTION 'Anonymous users must not write the private route quota table';
  END IF;
  IF has_function_privilege('anon', 'public.consume_truck_route_quota()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous users must not execute the route quota function';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.consume_truck_route_quota()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated users must be able to consume their route quota';
  END IF;

  SELECT prosecdef INTO is_security_definer
  FROM pg_catalog.pg_proc
  WHERE oid = 'public.consume_truck_route_quota()'::regprocedure;
  IF is_security_definer THEN
    RAISE EXCEPTION 'Public route quota RPC must use invoker rights';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = 'private.truck_route_requests'::regclass) THEN
    RAISE EXCEPTION 'Route quota rows must be protected by RLS';
  END IF;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);

  FOR i IN 1..10 LOOP
    SELECT public.consume_truck_route_quota() INTO allowed;
    IF allowed IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'User A was blocked before reaching the ten-request limit at request %', i;
    END IF;
  END LOOP;

  SELECT public.consume_truck_route_quota() INTO allowed;
  IF allowed IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'User A was not blocked after ten requests in the rolling window';
  END IF;

  SELECT count(*) INTO visible_count FROM private.truck_route_requests;
  IF visible_count <> 10 THEN
    RAISE EXCEPTION 'User A should see only their own ten quota rows';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', user_b::text, true);
  SELECT count(*) INTO visible_count FROM private.truck_route_requests;
  IF visible_count <> 0 THEN
    RAISE EXCEPTION 'User B can see another user quota rows';
  END IF;

  SELECT public.consume_truck_route_quota() INTO allowed;
  IF allowed IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'User B should have an independent quota';
  END IF;

  SELECT count(*) INTO visible_count FROM private.truck_route_requests;
  IF visible_count <> 1 THEN
    RAISE EXCEPTION 'User B should see only their own quota row';
  END IF;

  BEGIN
    INSERT INTO private.truck_route_requests (user_id) VALUES (user_a);
    RAISE EXCEPTION 'Cross-user quota row insertion was not blocked by RLS';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  SELECT public.consume_truck_route_quota() INTO allowed;
  IF allowed IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Quota must fail closed when auth.uid() is absent';
  END IF;
END;
$$;
