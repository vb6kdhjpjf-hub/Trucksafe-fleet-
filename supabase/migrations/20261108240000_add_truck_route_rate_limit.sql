-- Rolling per-user quota for paid HERE truck-routing requests.
-- Ten route calculations per authenticated user in any ten-minute window.
create table if not exists private.truck_route_requests (
  user_id uuid not null,
  requested_at timestamptz not null default pg_catalog.now()
);

create index if not exists truck_route_requests_user_time_idx
  on private.truck_route_requests (user_id, requested_at desc);

revoke all on table private.truck_route_requests from public, anon, authenticated;

create or replace function public.consume_truck_route_quota()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_request_count integer;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'authenticated' then
    return false;
  end if;

  v_user_id := auth.uid();
  if v_user_id is null then
    return false;
  end if;

  -- Serialize concurrent requests for the same user before counting/inserting.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 0)
  );

  delete from private.truck_route_requests
  where user_id = v_user_id
    and requested_at <= pg_catalog.now() - interval '10 minutes';

  select pg_catalog.count(*)::integer
    into v_request_count
  from private.truck_route_requests
  where user_id = v_user_id
    and requested_at > pg_catalog.now() - interval '10 minutes';

  if v_request_count >= 10 then
    return false;
  end if;

  insert into private.truck_route_requests (user_id) values (v_user_id);
  return true;
end;
$$;

revoke all on function public.consume_truck_route_quota() from public, anon, authenticated;
grant execute on function public.consume_truck_route_quota() to authenticated;
