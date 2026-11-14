-- Keep trip completion lock ordering consistent with trip start and deferred
-- driver/vehicle state guards: driver row first, then vehicle row.
-- This avoids a driver/vehicle lock inversion between concurrent start and finish.

create or replace function public.finish_trip(p_fleet_id uuid, p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_trip public.trips%rowtype;
  v_driver_user_id uuid;
begin
  if auth.uid() is null then
    raise exception 'יש להתחבר כדי לסיים נסיעה';
  end if;
  if not private.is_fleet_member(p_fleet_id) then
    raise exception 'רק חבר צי פעיל יכול לסיים נסיעה';
  end if;

  select * into v_trip
  from public.trips
  where id = p_trip_id and fleet_id = p_fleet_id
  for update;

  if not found then
    raise exception 'הנסיעה לא נמצאה בצי';
  end if;
  if v_trip.status <> 'active' then
    raise exception 'הנסיעה אינה פעילה או שכבר הסתיימה';
  end if;

  -- Lock driver before vehicle, matching start_trip_with_inspection and the
  -- deferred trip-state triggers. This prevents lock-order inversion/deadlocks.
  select d.user_id into v_driver_user_id
  from public.drivers d
  where d.id = v_trip.driver_id and d.fleet_id = p_fleet_id
  for update;

  if not private.has_fleet_role(p_fleet_id, array['owner','fleet_manager','dispatcher'])
     and v_driver_user_id is distinct from auth.uid() then
    raise exception 'רק מנהל הצי או הנהג המשויך לנסיעה יכולים לסיים אותה';
  end if;

  -- Serialize completion of trips sharing one vehicle. Without this row lock,
  -- two concurrent finish calls could both observe the other's trip as active,
  -- skip releasing the vehicle, and leave it stuck in on_trip after both commit.
  perform 1
  from public.vehicles
  where id = v_trip.vehicle_id and fleet_id = p_fleet_id
  for update;
  if not found then
    raise exception 'הרכב של הנסיעה לא נמצא בצי';
  end if;

  if not exists (
    select 1 from public.trips
    where fleet_id = p_fleet_id
      and vehicle_id = v_trip.vehicle_id
      and status = 'active'
      and id <> p_trip_id
  ) then
    update public.vehicles
    set status = 'available', updated_at = now()
    where id = v_trip.vehicle_id
      and fleet_id = p_fleet_id
      and status = 'on_trip';
  end if;

  update public.trips
  set status = 'completed', ended_at = now(), updated_at = now()
  where id = p_trip_id and fleet_id = p_fleet_id;

  if v_trip.task_id is not null then
    update public.tasks
    set status = 'completed', updated_at = now()
    where id = v_trip.task_id and fleet_id = p_fleet_id;
  end if;
end;
$function$;
