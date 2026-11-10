-- Keep route quota writes narrowly scoped to the invoker-rights RPC.
-- Authenticated users may insert only their own user_id and requested_at;
-- they must never receive table-wide INSERT or permission to choose the row id.
REVOKE INSERT ON TABLE private.truck_route_requests FROM authenticated, anon, public;
GRANT INSERT (user_id, requested_at) ON TABLE private.truck_route_requests TO authenticated;
