-- READ-ONLY preflight for the fleet-scoped composite-FK migration.
-- Run against a target database before any persistent schema rollout.
-- This file is diagnostic only: it performs SELECTs and never repairs data.
-- Any returned row is a blocker requiring investigation; do not auto-correct it.

WITH violations AS (
  SELECT 'vehicles.assigned_driver_id'::text AS relationship,
         v.id::text AS row_id, v.assigned_driver_id::text AS parent_id,
         v.fleet_id::text AS row_fleet_id, d.fleet_id::text AS parent_fleet_id
  FROM public.vehicles v
  LEFT JOIN public.drivers d ON d.id = v.assigned_driver_id
  WHERE v.assigned_driver_id IS NOT NULL
    AND (d.id IS NULL OR d.fleet_id IS DISTINCT FROM v.fleet_id)

  UNION ALL
  SELECT 'tasks.assigned_driver_id', t.id::text, t.assigned_driver_id::text,
         t.fleet_id::text, d.fleet_id::text
  FROM public.tasks t
  LEFT JOIN public.drivers d ON d.id = t.assigned_driver_id
  WHERE t.assigned_driver_id IS NOT NULL
    AND (d.id IS NULL OR d.fleet_id IS DISTINCT FROM t.fleet_id)

  UNION ALL
  SELECT 'tasks.assigned_vehicle_id', t.id::text, t.assigned_vehicle_id::text,
         t.fleet_id::text, v.fleet_id::text
  FROM public.tasks t
  LEFT JOIN public.vehicles v ON v.id = t.assigned_vehicle_id
  WHERE t.assigned_vehicle_id IS NOT NULL
    AND (v.id IS NULL OR v.fleet_id IS DISTINCT FROM t.fleet_id)

  UNION ALL
  SELECT 'trips.task_id', t.id::text, t.task_id::text,
         t.fleet_id::text, task.fleet_id::text
  FROM public.trips t
  LEFT JOIN public.tasks task ON task.id = t.task_id
  WHERE t.task_id IS NOT NULL
    AND (task.id IS NULL OR task.fleet_id IS DISTINCT FROM t.fleet_id)

  UNION ALL
  SELECT 'trips.driver_id', t.id::text, t.driver_id::text,
         t.fleet_id::text, d.fleet_id::text
  FROM public.trips t
  LEFT JOIN public.drivers d ON d.id = t.driver_id
  WHERE d.id IS NULL OR d.fleet_id IS DISTINCT FROM t.fleet_id

  UNION ALL
  SELECT 'trips.vehicle_id', t.id::text, t.vehicle_id::text,
         t.fleet_id::text, v.fleet_id::text
  FROM public.trips t
  LEFT JOIN public.vehicles v ON v.id = t.vehicle_id
  WHERE v.id IS NULL OR v.fleet_id IS DISTINCT FROM t.fleet_id

  UNION ALL
  SELECT 'incidents.trip_id', i.id::text, i.trip_id::text,
         i.fleet_id::text, t.fleet_id::text
  FROM public.incidents i
  LEFT JOIN public.trips t ON t.id = i.trip_id
  WHERE i.trip_id IS NOT NULL
    AND (t.id IS NULL OR t.fleet_id IS DISTINCT FROM i.fleet_id)

  UNION ALL
  SELECT 'incidents.driver_id', i.id::text, i.driver_id::text,
         i.fleet_id::text, d.fleet_id::text
  FROM public.incidents i
  LEFT JOIN public.drivers d ON d.id = i.driver_id
  WHERE i.driver_id IS NOT NULL
    AND (d.id IS NULL OR d.fleet_id IS DISTINCT FROM i.fleet_id)

  UNION ALL
  SELECT 'incidents.vehicle_id', i.id::text, i.vehicle_id::text,
         i.fleet_id::text, v.fleet_id::text
  FROM public.incidents i
  LEFT JOIN public.vehicles v ON v.id = i.vehicle_id
  WHERE i.vehicle_id IS NOT NULL
    AND (v.id IS NULL OR v.fleet_id IS DISTINCT FROM i.fleet_id)

  UNION ALL
  SELECT 'inspections.trip_id', i.id::text, i.trip_id::text,
         i.fleet_id::text, t.fleet_id::text
  FROM public.inspections i
  LEFT JOIN public.trips t ON t.id = i.trip_id
  WHERE i.trip_id IS NOT NULL
    AND (t.id IS NULL OR t.fleet_id IS DISTINCT FROM i.fleet_id)

  UNION ALL
  SELECT 'inspections.driver_id', i.id::text, i.driver_id::text,
         i.fleet_id::text, d.fleet_id::text
  FROM public.inspections i
  LEFT JOIN public.drivers d ON d.id = i.driver_id
  WHERE d.id IS NULL OR d.fleet_id IS DISTINCT FROM i.fleet_id

  UNION ALL
  SELECT 'inspections.vehicle_id', i.id::text, i.vehicle_id::text,
         i.fleet_id::text, v.fleet_id::text
  FROM public.inspections i
  LEFT JOIN public.vehicles v ON v.id = i.vehicle_id
  WHERE v.id IS NULL OR v.fleet_id IS DISTINCT FROM i.fleet_id

  UNION ALL
  SELECT 'maintenance_records.incident_id', m.id::text, m.incident_id::text,
         m.fleet_id::text, i.fleet_id::text
  FROM public.maintenance_records m
  LEFT JOIN public.incidents i ON i.id = m.incident_id
  WHERE m.incident_id IS NOT NULL
    AND (i.id IS NULL OR i.fleet_id IS DISTINCT FROM m.fleet_id)

  UNION ALL
  SELECT 'maintenance_records.vehicle_id', m.id::text, m.vehicle_id::text,
         m.fleet_id::text, v.fleet_id::text
  FROM public.maintenance_records m
  LEFT JOIN public.vehicles v ON v.id = m.vehicle_id
  WHERE v.id IS NULL OR v.fleet_id IS DISTINCT FROM m.fleet_id

  UNION ALL
  SELECT 'trip_locations.trip_id/driver_id', tl.id::text, tl.trip_id::text,
         t.fleet_id::text, d.fleet_id::text
  FROM public.trip_locations tl
  LEFT JOIN public.trips t ON t.id = tl.trip_id
  LEFT JOIN public.drivers d ON d.id = tl.driver_id
  WHERE t.id IS NULL OR d.id IS NULL
     OR tl.driver_id IS DISTINCT FROM t.driver_id
     OR d.fleet_id IS DISTINCT FROM t.fleet_id
)
SELECT relationship, row_id, parent_id, row_fleet_id, parent_fleet_id
FROM violations
ORDER BY relationship, row_id;
