-- Keep the public RPC invoker-scoped; isolate quota rows with RLS.
alter table private.truck_route_requests enable row level security;

drop policy if exists truck_route_requests_select_own on private.truck_route_requests;
create policy truck_route_requests_select_own
on private.truck_route_requests for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists truck_route_requests_insert_own on private.truck_route_requests;
create policy truck_route_requests_insert_own
on private.truck_route_requests for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists truck_route_requests_delete_own on private.truck_route_requests;
create policy truck_route_requests_delete_own
on private.truck_route_requests for delete to authenticated
using (user_id = (select auth.uid()));

grant usage on schema private to authenticated;
revoke all on table private.truck_route_requests from public, anon, authenticated;
grant select, insert, delete on table private.truck_route_requests to authenticated;

create or replace function public.consume_truck_route_quota()
returns boolean
language plpgsql
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
