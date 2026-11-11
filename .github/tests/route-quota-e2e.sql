-- Rollback-only integration test for the authenticated per-user route quota.
-- Uses synthetic identities only and never calls the paid routing provider.
begin;
set local role authenticated;

-- Verify the quota boundary is enforced by an invoker-rights RPC and RLS,
-- not by elevated privileges granted to application callers.
do $security$
declare
  quota_is_invoker boolean;
  quota_search_path text[];
  cleanup_is_definer boolean;
  cleanup_search_path text[];
  rls_enabled boolean;
begin
  select prosecdef, proconfig
    into quota_is_invoker, quota_search_path
  from pg_catalog.pg_proc
  where oid = 'public.consume_truck_route_quota()'::regprocedure;
  if quota_is_invoker is distinct from false then
    raise exception 'Quota security test: public RPC must remain SECURITY INVOKER';
  end if;
  if not coalesce(quota_search_path @> array['search_path=""'], false) then
    raise exception 'Quota security test: public RPC must pin an empty search_path';
  end if;

  select prosecdef, proconfig
    into cleanup_is_definer, cleanup_search_path
  from pg_catalog.pg_proc
  where oid = 'private.prune_truck_route_quota_rows()'::regprocedure;
  if cleanup_is_definer is distinct from true then
    raise exception 'Quota security test: cleanup trigger must remain SECURITY DEFINER';
  end if;
  if not coalesce(cleanup_search_path @> array['search_path=""'], false) then
    raise exception 'Quota security test: cleanup trigger must pin an empty search_path';
  end if;

  select relrowsecurity into rls_enabled
  from pg_catalog.pg_class
  where oid = 'private.truck_route_requests'::regclass;
  if rls_enabled is distinct from true then
    raise exception 'Quota security test: quota history table must have RLS enabled';
  end if;

  if not has_function_privilege('authenticated', 'public.consume_truck_route_quota()', 'EXECUTE')
     or has_function_privilege('anon', 'public.consume_truck_route_quota()', 'EXECUTE') then
    raise exception 'Quota security test: RPC execute grants are not restricted to authenticated';
  end if;
  if not has_table_privilege('authenticated', 'private.truck_route_requests', 'SELECT')
     or not has_table_privilege('authenticated', 'private.truck_route_requests', 'INSERT')
     or has_table_privilege('authenticated', 'private.truck_route_requests', 'UPDATE')
     or has_table_privilege('authenticated', 'private.truck_route_requests', 'DELETE')
     or has_table_privilege('anon', 'private.truck_route_requests', 'SELECT')
     or has_table_privilege('anon', 'private.truck_route_requests', 'INSERT') then
    raise exception 'Quota security test: quota table grants are broader than intended';
  end if;
end
$security$;


do $test$
declare
  user_a uuid := 'a8100000-0000-4000-8000-000000000001';
  user_b uuid := 'a8100000-0000-4000-8000-000000000002';
  i integer;
  visible_count integer;
begin
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

  -- Row-level security must hide user B's rows from user A.
  perform set_config('request.jwt.claim.sub', user_a::text, true);
  select count(*)::integer into visible_count
  from private.truck_route_requests
  where user_id = user_b;
  if visible_count <> 0 then
    raise exception 'Quota integration test: user A can see user B quota rows';
  end if;

  -- Authenticated callers may not mutate or delete quota history directly.
  if has_table_privilege(current_user, 'private.truck_route_requests', 'UPDATE')
     or has_table_privilege(current_user, 'private.truck_route_requests', 'DELETE') then
    raise exception 'Quota integration test: authenticated role has unsafe table privileges';
  end if;
  if has_function_privilege('anon', 'public.consume_truck_route_quota()', 'EXECUTE') then
    raise exception 'Quota integration test: anonymous role can execute quota function';
  end if;
end
$test$;

-- Synthetic quota rows and all test state are discarded.
rollback;
