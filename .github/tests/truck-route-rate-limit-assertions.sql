-- Rolling route quota: concurrency-safe per-user limit, no client table access.
DO $$
DECLARE
  user_a uuid := '33333333-3333-4333-8333-333333333333';
  user_b uuid := '44444444-4444-4444-8444-444444444444';
  allowed boolean;
  i integer;
BEGIN
  IF has_table_privilege('authenticated', 'private.truck_route_requests', 'SELECT') THEN
    RAISE EXCEPTION 'Authenticated users must not read the private route quota table';
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

  PERFORM set_config('request.jwt.claim.sub', user_b::text, true);
  SELECT public.consume_truck_route_quota() INTO allowed;
  IF allowed IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'User B should have an independent quota';
  END IF;

  -- A missing authenticated identity must fail closed.
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SELECT public.consume_truck_route_quota() INTO allowed;
  IF allowed IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Quota must fail closed when auth.uid() is absent';
  END IF;
END;
$$;
