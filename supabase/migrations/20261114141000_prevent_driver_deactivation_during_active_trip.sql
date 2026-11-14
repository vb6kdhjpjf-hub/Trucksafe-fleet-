-- Serialize driver status changes with active trip creation/completion.
-- Deferred constraint triggers check the transaction's final state and lock
-- the driver row, so concurrent RPC/direct-table writes cannot race past the guard.

create or replace function private.assert_driver_trip_status(p_fleet_id uuid,p_driver_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $guard$
declare
  v_status text;
  v_has_active_trip boolean;
begin
  select d.status into v_status
  from public.drivers d
  where d.fleet_id = p_fleet_id
    and d.id = p_driver_id
  for update;

  if not found then
    return;
  end if;

  select exists (
    select 1
    from public.trips t
    where t.fleet_id = p_fleet_id
      and t.driver_id = p_driver_id
      and t.status = 'active'
  ) into v_has_active_trip;

  if v_has_active_trip and v_status <> 'active' then
    raise exception 'Driver must remain active while an active trip exists'
      using errcode = '23514';
  end if;
end;
$guard$;

create or replace function private.check_driver_state_after_driver_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $guard$
begin
  perform private.assert_driver_trip_status(new.fleet_id, new.id);
  return null;
end;
$guard$;

create or replace function private.check_driver_state_after_trip_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $guard$
begin
  if tg_op = 'INSERT' then
    perform private.assert_driver_trip_status(new.fleet_id, new.driver_id);
  elsif tg_op = 'DELETE' then
    perform private.assert_driver_trip_status(old.fleet_id, old.driver_id);
  else
    perform private.assert_driver_trip_status(old.fleet_id, old.driver_id);
    perform private.assert_driver_trip_status(new.fleet_id, new.driver_id);
  end if;
  return null;
end;
$guard$;

revoke all on function private.assert_driver_trip_status(uuid,uuid) from public,anon,authenticated;
revoke all on function private.check_driver_state_after_driver_change() from public,anon,authenticated;
revoke all on function private.check_driver_state_after_trip_change() from public,anon,authenticated;

drop trigger if exists prevent_driver_deactivation_during_active_trip on public.drivers;
drop trigger if exists drivers_active_trip_state_consistency on public.drivers;
create constraint trigger drivers_active_trip_state_consistency
after update of status on public.drivers
deferrable initially deferred
for each row
execute function private.check_driver_state_after_driver_change();

drop trigger if exists trips_driver_state_consistency on public.trips;
create constraint trigger trips_driver_state_consistency
after insert or update or delete on public.trips
deferrable initially deferred
for each row
execute function private.check_driver_state_after_trip_change();

drop function if exists private.prevent_driver_deactivation_during_active_trip();
