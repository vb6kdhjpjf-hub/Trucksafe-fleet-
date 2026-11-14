-- Keep trip completion lock ordering consistent with trip start:
-- driver first, then vehicle. This prevents a start/finish lock inversion.

create or replace function public.finish_trip(p_fleet_id uuid, p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_trip public.trips%rowtype;
  v_driver public.drivers%rowtype;
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

  -- Match start_trip_with_inspection's driver -> vehicle lock order.
  select * into v_driver
  from public.drivers
  where id = v_trip.driver_id and fleet_id = p_fleet_id
  for update;

  if not found then
    raise exception 'הנהג של הנסיעה לא נמצא בצי';
  end if;

  if not private.has_fleet_role(p_fleet_id, array['owner','fleet_manager','dispatcher'])
     and v_driver.user_id is distinct from auth.uid() then
    raise exception 'רק מנהל הצי או הנהג המשויך לנסיעה יכולים לסיים אותה';
  end if;

  -- Serialize completion of trips sharing one vehicle.
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
