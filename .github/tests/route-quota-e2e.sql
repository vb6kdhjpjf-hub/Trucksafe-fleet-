-- Rollback-only integration test for the authenticated per-user route quota.
-- Uses synthetic identities only and never calls the paid routing provider.
begin;

do $test$
declare
  user_a uuid := 'a8100000-0000-4000-8000-000000000001';
  user_b uuid := 'a8100000-0000-4000-8000-000000000002';
  i integer;
  visible_count integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', user_a::text, true);

  for i in 1..10 loop
    if public.consume_truck_route_quota() is distinct from true then
      raise exception 'Quota integration test: request % for user A should be allowed', i;
    end if;
  end loop;

  if public.consume_truck_route_quota() is distinct from false then
    raise exception 'Quota integration test: request 11 for user A should be denied';
  end if;

  select count(*)::integer into visible_count
  from private.truck_route_requests
  where user_id = user_a;
  if visible_count <> 10 then
    raise exception 'Quota integration test: expected 10 rows for user A, got %', visible_count;
  end if;

  -- A second authenticated user has an independent quota window.
  perform set_config('request.jwt.claim.sub', user_b::text, true);
  if public.consume_truck_route_quota() is distinct from true then
    raise exception 'Quota integration test: first request for user B should be allowed';
  end if;

  select count(*)::integer into visible_count
  from private.truck_route_requests
  where user_id = user_b;
  if visible_count <> 1 then
    raise exception 'Quota integration test: expected 1 row for user B, got %', visible_count;
  end if;
end
$test$;

-- Synthetic quota rows and all test state are discarded.
rollback;
