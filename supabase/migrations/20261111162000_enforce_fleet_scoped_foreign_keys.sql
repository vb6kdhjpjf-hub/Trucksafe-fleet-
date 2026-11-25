-- Enforce fleet-scoped relationships for operational records.
-- Apply only after the isolated cross-fleet integration test passes.
-- PostgreSQL 15+ is required for column-list ON DELETE SET NULL.

-- A prior Test-only equipment migration may already have installed an
-- equivalent composite unique key under a different constraint name. Reuse it
-- instead of creating a duplicate unique index.
DO $vehicle_fleet_key$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = 'public.vehicles'::regclass
      AND c.contype IN ('p', 'u')
      AND (
        SELECT array_agg(a.attname ORDER BY k.ord)
        FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
        JOIN pg_attribute a
          ON a.attrelid = c.conrelid
         AND a.attnum = k.attnum
      ) = ARRAY['fleet_id', 'id']::name[]
  ) THEN
    ALTER TABLE public.vehicles
      ADD CONSTRAINT vehicles_fleet_id_id_key UNIQUE (fleet_id, id);
  END IF;
END
$vehicle_fleet_key$;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_fleet_id_id_key UNIQUE (fleet_id, id);

ALTER TABLE public.trips
  ADD CONSTRAINT trips_fleet_id_id_key UNIQUE (fleet_id, id),
  ADD CONSTRAINT trips_id_driver_id_key UNIQUE (id, driver_id);

ALTER TABLE public.incidents
  ADD CONSTRAINT incidents_fleet_id_id_key UNIQUE (fleet_id, id);

-- Preserve the existing vehicles -> assigned driver same-fleet FK.
-- Replace relationships that previously checked only the referenced row ID.

ALTER TABLE public.tasks
  DROP CONSTRAINT tasks_assigned_driver_id_fkey,
  DROP CONSTRAINT tasks_assigned_vehicle_id_fkey,
  ADD CONSTRAINT tasks_assigned_driver_same_fleet_fkey
    FOREIGN KEY (fleet_id, assigned_driver_id)
    REFERENCES public.drivers (fleet_id, id)
    ON DELETE SET NULL (assigned_driver_id),
  ADD CONSTRAINT tasks_assigned_vehicle_same_fleet_fkey
    FOREIGN KEY (fleet_id, assigned_vehicle_id)
    REFERENCES public.vehicles (fleet_id, id)
    ON DELETE SET NULL (assigned_vehicle_id);

ALTER TABLE public.trips
  DROP CONSTRAINT trips_task_id_fkey,
  DROP CONSTRAINT trips_driver_id_fkey,
  DROP CONSTRAINT trips_vehicle_id_fkey,
  ADD CONSTRAINT trips_task_same_fleet_fkey
    FOREIGN KEY (fleet_id, task_id)
    REFERENCES public.tasks (fleet_id, id)
    ON DELETE SET NULL (task_id),
  ADD CONSTRAINT trips_driver_same_fleet_fkey
    FOREIGN KEY (fleet_id, driver_id)
    REFERENCES public.drivers (fleet_id, id),
  ADD CONSTRAINT trips_vehicle_same_fleet_fkey
    FOREIGN KEY (fleet_id, vehicle_id)
    REFERENCES public.vehicles (fleet_id, id);

ALTER TABLE public.incidents
  DROP CONSTRAINT incidents_trip_id_fkey,
  DROP CONSTRAINT incidents_driver_id_fkey,
  DROP CONSTRAINT incidents_vehicle_id_fkey,
  ADD CONSTRAINT incidents_trip_same_fleet_fkey
    FOREIGN KEY (fleet_id, trip_id)
    REFERENCES public.trips (fleet_id, id)
    ON DELETE SET NULL (trip_id),
  ADD CONSTRAINT incidents_driver_same_fleet_fkey
    FOREIGN KEY (fleet_id, driver_id)
    REFERENCES public.drivers (fleet_id, id)
    ON DELETE SET NULL (driver_id),
  ADD CONSTRAINT incidents_vehicle_same_fleet_fkey
    FOREIGN KEY (fleet_id, vehicle_id)
    REFERENCES public.vehicles (fleet_id, id)
    ON DELETE SET NULL (vehicle_id);

ALTER TABLE public.inspections
  DROP CONSTRAINT inspections_trip_id_fkey,
  DROP CONSTRAINT inspections_driver_id_fkey,
  DROP CONSTRAINT inspections_vehicle_id_fkey,
  ADD CONSTRAINT inspections_trip_same_fleet_fkey
    FOREIGN KEY (fleet_id, trip_id)
    REFERENCES public.trips (fleet_id, id)
    ON DELETE SET NULL (trip_id),
  ADD CONSTRAINT inspections_driver_same_fleet_fkey
    FOREIGN KEY (fleet_id, driver_id)
    REFERENCES public.drivers (fleet_id, id),
  ADD CONSTRAINT inspections_vehicle_same_fleet_fkey
    FOREIGN KEY (fleet_id, vehicle_id)
    REFERENCES public.vehicles (fleet_id, id);

ALTER TABLE public.maintenance_records
  DROP CONSTRAINT maintenance_records_incident_id_fkey,
  DROP CONSTRAINT maintenance_records_vehicle_id_fkey,
  ADD CONSTRAINT maintenance_records_incident_same_fleet_fkey
    FOREIGN KEY (fleet_id, incident_id)
    REFERENCES public.incidents (fleet_id, id)
    ON DELETE SET NULL (incident_id),
  ADD CONSTRAINT maintenance_records_vehicle_same_fleet_fkey
    FOREIGN KEY (fleet_id, vehicle_id)
    REFERENCES public.vehicles (fleet_id, id)
    ON DELETE CASCADE;

-- A location's driver must be the actual driver assigned to that trip.
ALTER TABLE public.trip_locations
  DROP CONSTRAINT trip_locations_trip_id_fkey,
  DROP CONSTRAINT trip_locations_driver_id_fkey,
  ADD CONSTRAINT trip_locations_trip_driver_fkey
    FOREIGN KEY (trip_id, driver_id)
    REFERENCES public.trips (id, driver_id)
    ON DELETE CASCADE;

-- Child-side indexes for the fleet-scoped composite foreign keys.
create index if not exists incidents_fleet_driver_idx on public.incidents(fleet_id,driver_id);
create index if not exists incidents_fleet_trip_idx on public.incidents(fleet_id,trip_id);
create index if not exists incidents_fleet_vehicle_idx on public.incidents(fleet_id,vehicle_id);
create index if not exists inspections_fleet_driver_idx on public.inspections(fleet_id,driver_id);
create index if not exists inspections_fleet_trip_idx on public.inspections(fleet_id,trip_id);
create index if not exists inspections_fleet_vehicle_idx on public.inspections(fleet_id,vehicle_id);
create index if not exists maintenance_records_fleet_incident_idx on public.maintenance_records(fleet_id,incident_id);
create index if not exists tasks_fleet_assigned_driver_idx on public.tasks(fleet_id,assigned_driver_id);
create index if not exists tasks_fleet_assigned_vehicle_idx on public.tasks(fleet_id,assigned_vehicle_id);
create index if not exists trip_locations_trip_driver_idx on public.trip_locations(trip_id,driver_id);
create index if not exists trips_fleet_driver_idx on public.trips(fleet_id,driver_id);
create index if not exists trips_fleet_task_idx on public.trips(fleet_id,task_id);
create index if not exists trips_fleet_vehicle_idx on public.trips(fleet_id,vehicle_id);
