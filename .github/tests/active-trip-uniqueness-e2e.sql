-- Rollback-only verification of active-trip uniqueness protections.
-- Keep the DDL inline: this runner executes SQL through node-postgres, not psql.
begin;

create unique index if not exists trips_one_active_per_driver
  on public.trips (driver_id)
  where status = 'active';

create unique index if not exists trips_one_active_per_vehicle
  on public.trips (vehicle_id)
  where status = 'active';

create unique index if not exists trips_one_active_per_task
  on public.trips (task_id)
  where status = 'active' and task_id is not null;

do $$
declare
  expected text[] := array[
    'trips_one_active_per_driver',
    'trips_one_active_per_vehicle',
    'trips_one_active_per_task'
  ];
  actual_count integer;
  duplicate_count integer;
begin
  select count(*) into actual_count
  from pg_index i
  join pg_class idx on idx.oid = i.indexrelid
  join pg_namespace ns on ns.oid = idx.relnamespace
  where ns.nspname = 'public'
    and idx.relname = any(expected)
    and i.indisunique
    and pg_get_expr(i.indpred, i.indrelid) like '%status = ''active''%';

  if actual_count <> 3 then
    raise exception 'Expected all three unique partial indexes with active predicate; found %', actual_count;
  end if;

  select count(*) into duplicate_count
  from (
    select driver_id
    from public.trips
    where status = 'active'
    group by driver_id
    having count(*) > 1
  ) duplicates;

  if duplicate_count <> 0 then
    raise exception 'Existing active trips contain duplicate drivers';
  end if;
end
$$;

rollback;
