-- Synthetic query-plan regression tests only.
-- Temporary relations mirror two high-value production index shapes.
-- No public tables, schema, or persistent data are changed.
BEGIN;

CREATE TEMP TABLE trucksafe_perf_tasks (
  id bigint GENERATED ALWAYS AS IDENTITY,
  fleet_id integer NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL
) ON COMMIT DROP;

INSERT INTO trucksafe_perf_tasks (fleet_id, status, created_at)
SELECT
  ((g - 1) % 10) + 1,
  CASE WHEN g % 20 = 0 THEN 'pending'
       WHEN g % 20 = 1 THEN 'assigned'
       ELSE 'completed' END,
  now() - (g % 365) * interval '1 day'
FROM generate_series(1, 100000) AS g;

CREATE INDEX idx_trucksafe_perf_tasks_fleet_status
  ON trucksafe_perf_tasks (fleet_id, status);
ANALYZE trucksafe_perf_tasks;

-- Expected to use the fleet/status index for a selective fleet task query.
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT id, created_at
FROM trucksafe_perf_tasks
WHERE fleet_id = 10 AND status = 'pending'
ORDER BY created_at DESC
LIMIT 100;

CREATE TEMP TABLE trucksafe_perf_locations (
  id bigint GENERATED ALWAYS AS IDENTITY,
  trip_id integer NOT NULL,
  recorded_at timestamptz NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL
) ON COMMIT DROP;

INSERT INTO trucksafe_perf_locations (trip_id, recorded_at, latitude, longitude)
SELECT
  ((g - 1) % 1000) + 1,
  now() - g * interval '1 second',
  32 + (g % 1000) * 0.00001,
  34 + (g % 1000) * 0.00001
FROM generate_series(1, 100000) AS g;

CREATE INDEX idx_trucksafe_perf_locations_trip_recorded
  ON trucksafe_perf_locations (trip_id, recorded_at DESC);
ANALYZE trucksafe_perf_locations;

-- Expected to use the trip/time index and avoid a full history sort.
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT recorded_at, latitude, longitude
FROM trucksafe_perf_locations
WHERE trip_id = 444
ORDER BY recorded_at DESC
LIMIT 100;

ROLLBACK;
