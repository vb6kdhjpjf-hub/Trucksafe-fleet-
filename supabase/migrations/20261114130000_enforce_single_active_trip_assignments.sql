-- Enforce at most one active trip per driver, vehicle, and task.
-- Partial unique indexes are race-safe and complement row-level locks in RPCs.
-- Existing violations are detected before any permanent index is created.

do $preflight$
declare
  duplicate_groups bigint;
begin
  select count(*) into duplicate_groups
  from (
    select driver_id from public.trips
    where status = 'active'
    group by driver_id having count(*) > 1
  ) duplicates;
  if duplicate_groups > 0 then
    raise exception 'Cannot enforce active-trip uniqueness: % driver(s) already have multiple active trips', duplicate_groups;
  end if;

  select count(*) into duplicate_groups
  from (
    select vehicle_id from public.trips
    where status = 'active'
    group by vehicle_id having count(*) > 1
  ) duplicates;
  if duplicate_groups > 0 then
    raise exception 'Cannot enforce active-trip uniqueness: % vehicle(s) already have multiple active trips', duplicate_groups;
  end if;

  select count(*) into duplicate_groups
  from (
    select task_id from public.trips
    where status = 'active' and task_id is not null
    group by task_id having count(*) > 1
  ) duplicates;
  if duplicate_groups > 0 then
    raise exception 'Cannot enforce active-trip uniqueness: % task(s) already have multiple active trips', duplicate_groups;
  end if;
end
$preflight$;

create unique index if not exists trips_one_active_per_driver
  on public.trips (driver_id)
  where status = 'active';

create unique index if not exists trips_one_active_per_vehicle
  on public.trips (vehicle_id)
  where status = 'active';

create unique index if not exists trips_one_active_per_task
  on public.trips (task_id)
  where status = 'active' and task_id is not null;
