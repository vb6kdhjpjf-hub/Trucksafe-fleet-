-- Test-database-only migration. Never place under supabase/migrations or apply to Production.
-- Applied to the dedicated Test project as migration 20261127122759.
-- The deferred driver constraint trigger independently checks both active trips
-- and active daily work plans. The rollback-only test runner strips transaction
-- boundaries from included migrations so lifecycle replay cannot commit this repair.

CREATE OR REPLACE FUNCTION private.check_driver_state_after_driver_change()
RETURNS trigger
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
  where d.fleet_id = new.fleet_id and d.id = new.id;
  if not found then return null; end if;

  select exists (
    select 1 from public.trips t
    where t.fleet_id = new.fleet_id and t.driver_id = new.id and t.status = 'active'
  ) into v_has_active_trip;

  select exists (
    select 1 from public.daily_work_plans p
    where p.fleet_id = new.fleet_id and p.driver_id = new.id and p.status = 'active'
  ) into v_has_active_plan;

  if (v_has_active_trip or v_has_active_plan) and v_status <> 'active' then
    raise exception 'Driver must remain active while an active trip or daily work plan exists'
      using errcode = '23514';
  end if;
  return null;
end;
$function$;

REVOKE ALL ON FUNCTION private.check_driver_state_after_driver_change() FROM PUBLIC, anon, authenticated;
