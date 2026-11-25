-- Keep vehicle availability consistent with active trip assignments.
-- Deferred constraint triggers validate the transaction's final state, allowing
-- start_trip and finish_trip to update both records atomically in either order.

create or replace function private.assert_vehicle_trip_status(p_fleet_id uuid,p_vehicle_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $guard$
declare
  v_status text;
  v_has_active_trip boolean;
begin
  select v.status into v_status
  from public.vehicles v
  where v.fleet_id = p_fleet_id and v.id = p_vehicle_id
  for update;

  if not found then
    return;
  end if;

  select exists (
    select 1
    from public.trips t
    where t.fleet_id = p_fleet_id
      and t.vehicle_id = p_vehicle_id
      and t.status = 'active'
  ) into v_has_active_trip;

  if v_has_active_trip and v_status <> 'on_trip' then
    raise exception 'Vehicle must remain on_trip while an active trip exists'
      using errcode = '23514';
  elsif not v_has_active_trip and v_status = 'on_trip' then
    raise exception 'Vehicle cannot be on_trip without an active trip'
      using errcode = '23514';
  end if;
end;
$guard$;

create or replace function private.check_vehicle_state_after_trip_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $guard$
begin
  if tg_op = 'INSERT' then
    perform private.assert_vehicle_trip_status(new.fleet_id, new.vehicle_id);
  elsif tg_op = 'DELETE' then
    perform private.assert_vehicle_trip_status(old.fleet_id, old.vehicle_id);
  else
    perform private.assert_vehicle_trip_status(old.fleet_id, old.vehicle_id);
    perform private.assert_vehicle_trip_status(new.fleet_id, new.vehicle_id);
  end if;
  return null;
end;
$guard$;

create or replace function private.check_vehicle_state_after_vehicle_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $guard$
begin
  perform private.assert_vehicle_trip_status(new.fleet_id, new.id);
  return null;
end;
$guard$;

revoke all on function private.assert_vehicle_trip_status(uuid,uuid) from public,anon,authenticated;
revoke all on function private.check_vehicle_state_after_trip_change() from public,anon,authenticated;
revoke all on function private.check_vehicle_state_after_vehicle_change() from public,anon,authenticated;

drop trigger if exists trips_vehicle_state_consistency on public.trips;
create constraint trigger trips_vehicle_state_consistency
after insert or update or delete on public.trips
deferrable initially deferred
for each row
execute function private.check_vehicle_state_after_trip_change();

drop trigger if exists vehicles_trip_state_consistency on public.vehicles;
create constraint trigger vehicles_trip_state_consistency
after insert or update on public.vehicles
deferrable initially deferred
for each row
execute function private.check_vehicle_state_after_vehicle_change();
