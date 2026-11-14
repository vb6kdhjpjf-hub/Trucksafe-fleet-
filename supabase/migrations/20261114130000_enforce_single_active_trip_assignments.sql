-- Enforce at most one active trip per driver, vehicle, and task.
-- Partial unique indexes are race-safe and complement row-level locks in RPCs.
-- This migration is intended for the isolated Test environment first.

create unique index if not exists trips_one_active_per_driver
  on public.trips (driver_id)
  where status = 'active';

create unique index if not exists trips_one_active_per_vehicle
  on public.trips (vehicle_id)
  where status = 'active';

create unique index if not exists trips_one_active_per_task
  on public.trips (task_id)
  where status = 'active' and task_id is not null;
