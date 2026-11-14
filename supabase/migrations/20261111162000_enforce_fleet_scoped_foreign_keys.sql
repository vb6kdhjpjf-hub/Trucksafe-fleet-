-- Enforce fleet-scoped relationships for operational records.
-- Apply only after the isolated cross-fleet integration test passes.
-- PostgreSQL 15+ is required for column-list ON DELETE SET NULL.

ALTER TABLE public.vehicles
  ADD CONSTRAINT vehicles_fleet_id_id_key UNIQUE (fleet_id, id);

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
