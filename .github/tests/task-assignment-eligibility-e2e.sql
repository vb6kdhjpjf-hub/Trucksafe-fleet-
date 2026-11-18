-- Rollback-only database-boundary tests for task assignment eligibility.
-- Auth identities are created by the SQL runner through Supabase Auth Admin API.
BEGIN;

\ir ../../supabase/migrations/20261118194500_guard_task_assignment_eligibility.sql

-- @auth-fixture 'ba000000-0000-4000-8000-000000000001' task-guard-owner@example.invalid

INSERT INTO public.fleets (id, name, owner_user_id)
VALUES ('bb000000-0000-4000-8000-000000000001', 'Task Guard Test Fleet', 'ba000000-0000-4000-8000-000000000001');

INSERT INTO public.drivers (id, fleet_id, full_name, status, license_expires_at)
VALUES
 ('bc000000-0000-4000-8000-000000000001','bb000000-0000-4000-8000-000000000001','Valid driver','active',(now() at time zone 'Asia/Jerusalem')::date + 30),
 ('bc000000-0000-4000-8000-000000000002','bb000000-0000-4000-8000-000000000001','Inactive driver','off_duty',(now() at time zone 'Asia/Jerusalem')::date + 30),
 ('bc000000-0000-4000-8000-000000000003','bb000000-0000-4000-8000-000000000001','Expired driver','active',(now() at time zone 'Asia/Jerusalem')::date - 1),
 ('bc000000-0000-4000-8000-000000000004','bb000000-0000-4000-8000-000000000001','Missing expiry driver','active',NULL);

INSERT INTO public.vehicles (id, fleet_id, registration_number, status, is_demo)
VALUES
 ('bd000000-0000-4000-8000-000000000001','bb000000-0000-4000-8000-000000000001','TASK-GUARD-AVAILABLE','available',false),
 ('bd000000-0000-4000-8000-000000000002','bb000000-0000-4000-8000-000000000001','TASK-GUARD-MAINT','maintenance',false),
 ('bd000000-0000-4000-8000-000000000003','bb000000-0000-4000-8000-000000000001','TASK-GUARD-DEMO','available',true),
 ('bd000000-0000-4000-8000-000000000004','bb000000-0000-4000-8000-000000000001','TASK-GUARD-TRIP','on_trip',false);

CREATE FUNCTION pg_temp.assert_assignment_rejected(statement text, scenario text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  rejected boolean := false;
BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE IN ('P0001','23514','23503') THEN
      rejected := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'Expected database rejection: %', scenario;
  END IF;
END;
$$;

DO $test$
DECLARE
  valid_task uuid;
BEGIN
  INSERT INTO public.tasks (fleet_id,title,assigned_driver_id,assigned_vehicle_id,status)
  VALUES ('bb000000-0000-4000-8000-000000000001','Valid assigned task',
    'bc000000-0000-4000-8000-000000000001','bd000000-0000-4000-8000-000000000001','assigned')
  RETURNING id INTO valid_task;

  INSERT INTO public.tasks (fleet_id,title,status)
  VALUES ('bb000000-0000-4000-8000-000000000001','Valid unassigned task','pending');

  PERFORM pg_temp.assert_assignment_rejected(
    $sql$INSERT INTO public.tasks (fleet_id,title,assigned_driver_id,status)
      VALUES ('bb000000-0000-4000-8000-000000000001','Partial assignment',
        'bc000000-0000-4000-8000-000000000001','pending')$sql$,
    'partial driver-only assignment');

  PERFORM pg_temp.assert_assignment_rejected(
    $sql$INSERT INTO public.tasks (fleet_id,title,assigned_driver_id,assigned_vehicle_id,status)
      VALUES ('bb000000-0000-4000-8000-000000000001','Inactive driver assignment',
        'bc000000-0000-4000-8000-000000000002','bd000000-0000-4000-8000-000000000001','assigned')$sql$,
    'inactive driver assignment');

  PERFORM pg_temp.assert_assignment_rejected(
    $sql$INSERT INTO public.tasks (fleet_id,title,assigned_driver_id,assigned_vehicle_id,status)
      VALUES ('bb000000-0000-4000-8000-000000000001','Expired driver assignment',
        'bc000000-0000-4000-8000-000000000003','bd000000-0000-4000-8000-000000000001','assigned')$sql$,
    'expired driver assignment');

  PERFORM pg_temp.assert_assignment_rejected(
    $sql$INSERT INTO public.tasks (fleet_id,title,assigned_driver_id,assigned_vehicle_id,status)
      VALUES ('bb000000-0000-4000-8000-000000000001','Missing expiry assignment',
        'bc000000-0000-4000-8000-000000000004','bd000000-0000-4000-8000-000000000001','assigned')$sql$,
    'missing driver expiry');

  PERFORM pg_temp.assert_assignment_rejected(
    $sql$INSERT INTO public.tasks (fleet_id,title,assigned_driver_id,assigned_vehicle_id,status)
      VALUES ('bb000000-0000-4000-8000-000000000001','Maintenance vehicle assignment',
        'bc000000-0000-4000-8000-000000000001','bd000000-0000-4000-8000-000000000002','assigned')$sql$,
    'maintenance vehicle assignment');

  PERFORM pg_temp.assert_assignment_rejected(
    $sql$INSERT INTO public.tasks (fleet_id,title,assigned_driver_id,assigned_vehicle_id,status)
      VALUES ('bb000000-0000-4000-8000-000000000001','Demo vehicle assignment',
        'bc000000-0000-4000-8000-000000000001','bd000000-0000-4000-8000-000000000003','assigned')$sql$,
    'demo vehicle assignment');

  PERFORM pg_temp.assert_assignment_rejected(
    $sql$INSERT INTO public.tasks (fleet_id,title,assigned_driver_id,assigned_vehicle_id,status)
      VALUES ('bb000000-0000-4000-8000-000000000001','On-trip vehicle assignment',
        'bc000000-0000-4000-8000-000000000001','bd000000-0000-4000-8000-000000000004','assigned')$sql$,
    'on-trip vehicle assignment');

  PERFORM pg_temp.assert_assignment_rejected(
    $sql$INSERT INTO public.tasks (fleet_id,title,assigned_driver_id,status)
      VALUES ('bb000000-0000-4000-8000-000000000001','Assigned without pair',
        'bc000000-0000-4000-8000-000000000001','assigned')$sql$,
    'assigned task without both references');

  PERFORM pg_temp.assert_assignment_rejected(
    format('UPDATE public.tasks SET assigned_driver_id = %L WHERE id = %L',
      'bc000000-0000-4000-8000-000000000002', valid_task),
    'update to inactive driver');

  IF NOT EXISTS (
    SELECT 1 FROM public.tasks
    WHERE id = valid_task
      AND assigned_driver_id = 'bc000000-0000-4000-8000-000000000001'
      AND assigned_vehicle_id = 'bd000000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'Rejected assignment update changed the previously valid task';
  END IF;
END
$test$;

ROLLBACK;
