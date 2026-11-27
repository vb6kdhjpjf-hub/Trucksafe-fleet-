-- Test-database-only migration. Never place under supabase/migrations or apply to Production.
-- Migration name: test_move_daily_plan_guard_into_driver_constraint_trigger_v4
-- The guard is placed in the deferred constraint-trigger function so it does not
-- depend on the separately managed assert_driver_trip_status helper definition.

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
  select d.status
    into v_status
  from public.drivers d
  where d.fleet_id = new.fleet_id
    and d.id = new.id;

  if not found then
    return null;
  end if;

  select exists (
    select 1
    from public.trips t
    where t.fleet_id = new.fleet_id
      and t.driver_id = new.id
      and t.status = 'active'
  ) into v_has_active_trip;

  select exists (
    select 1
    from public.daily_work_plans p
    where p.fleet_id = new.fleet_id
      and p.driver_id = new.id
      and p.status = 'active'
  ) into v_has_active_plan;

  if (v_has_active_trip or v_has_active_plan) and v_status <> 'active' then
    raise exception 'Driver must remain active while an active trip or daily work plan exists'
      using errcode = '23514';
  end if;

  return null;
end;
$function$;

REVOKE ALL ON FUNCTION private.check_driver_state_after_driver_change() FROM PUBLIC, anon, authenticated;
