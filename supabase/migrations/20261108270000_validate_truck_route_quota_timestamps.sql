-- Prevent clients from inserting fabricated timestamps into their own quota history.
drop policy if exists truck_route_requests_insert_own on private.truck_route_requests;
create policy truck_route_requests_insert_own
on private.truck_route_requests for insert to authenticated
with check (
  user_id = (select auth.uid())
  and requested_at >= pg_catalog.now() - interval '1 minute'
  and requested_at <= pg_catalog.now() + interval '1 minute'
);
