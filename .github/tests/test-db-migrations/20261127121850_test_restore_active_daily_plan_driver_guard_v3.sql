-- Test-database-only migration. Do not place under supabase/migrations or apply to production.
-- Applied to the dedicated TruckSafe Fleet Test project as migration 20261127121850.
-- Restores the active daily-work-plan guard after the function definition was found reverted
-- despite the previous Test-only migration history entry.

CREATE OR REPLACE FUNCTION private.assert_driver_trip_status(p_fleet_id uuid, p_driver_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_status text;
  v_has_active_trip boolean;
  v_has_active_plan boolean;
begin
  select d.status into v_status
  from public.drivers d
  where d.fleet_id = p_fleet_id
    and d.id = p_driver_id
  for update;

  if not found then return; end if;

  select exists (
    select 1 from public.trips t
    where t.fleet_id = p_fleet_id
      and t.driver_id = p_driver_id
      and t.status = 'active'
  ) into v_has_active_trip;

  select exists (
    select 1 from public.daily_work_plans p
    where p.fleet_id = p_fleet_id
      and p.driver_id = p_driver_id
      and p.status = 'active'
  ) into v_has_active_plan;

  if (v_has_active_trip or v_has_active_plan) and v_status <> 'active' then
    raise exception 'Driver must remain active while an active trip or daily work plan exists'
      using errcode = '23514';
  end if;
end;
$function$;
