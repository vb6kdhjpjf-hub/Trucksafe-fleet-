-- Historical repair for the invoker-rights route quota RPC.
-- Keep this grant column-scoped: authenticated callers may supply only the
-- caller ID and timestamp columns. The ledger ID remains database-generated.
GRANT INSERT (user_id, requested_at)
ON TABLE private.truck_route_requests
TO authenticated;
