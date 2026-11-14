-- Rollback-only verification of active-trip uniqueness protections.
begin;

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
  from pg_indexes
  where schemaname = 'public'
    and indexname = any(expected)
    and indexdef ilike '%WHERE (status = ''active''::text)%';

  if actual_count <> 3 then
    raise exception 'Expected all three active-trip unique indexes with active predicate; found %', actual_count;
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
