-- Restrict exposed SECURITY DEFINER RPC and trigger functions.
-- Trigger invocation does not require callers to have EXECUTE on the trigger function.
-- Fleet trip RPCs remain available to signed-in clients and service_role only.

revoke all on function public.add_fleet_owner_membership() from public, anon, authenticated;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;

revoke all on function public.finish_trip(uuid, uuid) from public, anon;
grant execute on function public.finish_trip(uuid, uuid) to authenticated, service_role;

revoke all on function public.start_trip_with_inspection(uuid, uuid, uuid, uuid, text, text, jsonb) from public, anon;
grant execute on function public.start_trip_with_inspection(uuid, uuid, uuid, uuid, text, text, jsonb) to authenticated, service_role;
