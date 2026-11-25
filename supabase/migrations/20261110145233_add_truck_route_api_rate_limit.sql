
-- Rate-limit paid HERE geocoding/routing calls per authenticated user.
-- This migration is safe to apply to production and the isolated test database.
create table if not exists private.truck_route_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  requested_at timestamptz not null default pg_catalog.now()
);

create index if not exists truck_route_requests_user_time_idx
  on private.truck_route_requests (user_id, requested_at desc);

alter table private.truck_route_requests enable row level security;

drop policy if exists truck_route_requests_select_own on private.truck_route_requests;
create policy truck_route_requests_select_own
on private.truck_route_requests for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists truck_route_requests_insert_own on private.truck_route_requests;
create policy truck_route_requests_insert_own
on private.truck_route_requests for insert to authenticated
with check (
  user_id = (select auth.uid())
  and requested_at >= pg_catalog.now() - interval '1 minute'
  and requested_at <= pg_catalog.now() + interval '1 minute'
);

grant usage on schema private to authenticated;
revoke all on table private.truck_route_requests from public, anon, authenticated;
grant select on table private.truck_route_requests to authenticated;
grant insert (user_id, requested_at) on table private.truck_route_requests to authenticated;

create or replace function private.prune_truck_route_quota_rows()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  delete from private.truck_route_requests
  where user_id = new.user_id
    and requested_at <= pg_catalog.now() - interval '10 minutes';
  return new;
end;
$function$;

revoke all on function private.prune_truck_route_quota_rows() from public, anon, authenticated, service_role;

drop trigger if exists prune_truck_route_quota_rows_after_insert on private.truck_route_requests;
create trigger prune_truck_route_quota_rows_after_insert
after insert on private.truck_route_requests
for each row execute function private.prune_truck_route_quota_rows();

create or replace function public.consume_truck_route_quota()
returns boolean
language plpgsql
security invoker
set search_path = ''
as $function$
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
$function$;

revoke all on function public.consume_truck_route_quota() from public, anon, authenticated, service_role;
grant execute on function public.consume_truck_route_quota() to authenticated;
