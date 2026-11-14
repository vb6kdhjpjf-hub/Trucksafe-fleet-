-- Keep a driver operationally active until every active trip has ended.
-- The trigger is private and is not an RPC/API entry point.

create or replace function private.prevent_driver_deactivation_during_active_trip()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
     and new.status <> 'active'
     and exists (
       select 1
       from public.trips t
       where t.fleet_id = old.fleet_id
         and t.driver_id = old.id
         and t.status = 'active'
     ) then
    raise exception 'Cannot change driver status while an active trip is in progress'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.prevent_driver_deactivation_during_active_trip()
  from public, anon, authenticated;

drop trigger if exists prevent_driver_deactivation_during_active_trip on public.drivers;

create trigger prevent_driver_deactivation_during_active_trip
before update of status on public.drivers
for each row
execute function private.prevent_driver_deactivation_during_active_trip();
