-- Enforce fleet-consistent assignments and prevent concurrent active trips.
-- Applied to the isolated Test project only; Production is intentionally untouched.

-- Tasks need a composite candidate key so trips can reference task+fleet safely.
alter table public.tasks
  add constraint tasks_fleet_id_id_unique unique (fleet_id, id);

-- Composite references ensure an assigned driver/vehicle belongs to the task's fleet.
alter table public.tasks
  add constraint tasks_fleet_assigned_driver_fkey
  foreign key (fleet_id, assigned_driver_id)
  references public.drivers (fleet_id, id);

alter table public.tasks
  add constraint tasks_fleet_assigned_vehicle_fkey
  foreign key (fleet_id, assigned_vehicle_id)
  references public.vehicles (fleet_id, id);

-- Keep trip participants and optional task within the same fleet.
alter table public.trips
  add constraint trips_fleet_driver_fkey
  foreign key (fleet_id, driver_id)
  references public.drivers (fleet_id, id);

alter table public.trips
  add constraint trips_fleet_vehicle_fkey
  foreign key (fleet_id, vehicle_id)
  references public.vehicles (fleet_id, id);

alter table public.trips
  add constraint trips_fleet_task_fkey
  foreign key (fleet_id, task_id)
  references public.tasks (fleet_id, id);

-- A driver, vehicle, or task may participate in at most one active trip.
-- Partial unique indexes make this race-safe even if requests arrive concurrently.
create unique index trips_one_active_per_driver
  on public.trips (driver_id)
  where status = 'active';

create unique index trips_one_active_per_vehicle
  on public.trips (vehicle_id)
  where status = 'active';

create unique index trips_one_active_per_task
  on public.trips (task_id)
  where status = 'active' and task_id is not null;
