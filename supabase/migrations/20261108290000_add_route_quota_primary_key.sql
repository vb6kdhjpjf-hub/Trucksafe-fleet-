-- Give the private request ledger a stable primary key without allowing
-- authenticated callers to choose or mutate it.
ALTER TABLE private.truck_route_requests
  ADD COLUMN IF NOT EXISTS id uuid;

UPDATE private.truck_route_requests
SET id = gen_random_uuid()
WHERE id IS NULL;

ALTER TABLE private.truck_route_requests
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'private.truck_route_requests'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE private.truck_route_requests
      ADD CONSTRAINT truck_route_requests_pkey PRIMARY KEY (id);
  END IF;
END;
$$;

REVOKE INSERT ON TABLE private.truck_route_requests FROM public, anon, authenticated;
GRANT INSERT (user_id, requested_at) ON TABLE private.truck_route_requests TO authenticated;
