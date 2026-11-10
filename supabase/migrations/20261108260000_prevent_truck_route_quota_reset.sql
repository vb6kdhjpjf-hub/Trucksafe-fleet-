-- Prevent clients from deleting their own quota history to reset the limit.
-- Keep the RPC invoker-scoped: clients can only read/insert their own rows.
drop policy if exists truck_route_requests_delete_own on private.truck_route_requests;
revoke delete on table private.truck_route_requests from public, anon, authenticated;
grant select, insert on table private.truck_route_requests to authenticated;

create or replace function private.prune_truck_route_quota_rows()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from private.truck_route_requests
  where user_id = new.user_id
    and requested_at <= pg_catalog.now() - interval '10 minutes';
  return new;
end;
$$;

revoke all on function private.prune_truck_route_quota_rows() from public, anon, authenticated;

drop trigger if exists prune_truck_route_quota_rows_after_insert on private.truck_route_requests;
create trigger prune_truck_route_quota_rows_after_insert
after insert on private.truck_route_requests
for each row execute function private.prune_truck_route_quota_rows();

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
