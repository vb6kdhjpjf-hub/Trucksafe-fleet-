-- Rollback-only database-boundary tests for task assignment eligibility.
-- Auth identities are created by the SQL runner through Supabase Auth Admin API.
BEGIN;

\\ir ../../supabase/migrations/20261118194500_guard_task_assignment_eligibility.sql

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

DO $test$
DECLARE
  rejected boolean;
BEGIN
  INSERT INTO public.tasks (fleet_id,title,assigned_driver_id,assigned_vehicle_id,status)
  VALUES ('bb000000-0000-4000-8000-000000000001','Valid assigned task',
    'bc000000-0000-4000-8000-000000000001','bd000000-0000-4000-8000-000000000001','assigned');

  INSERT INTO public.tasks (fleet_id,title,status)
  VALUES ('bb000000-0000-4000-8000-000000000001','Valid unassigned task','pending');

  BEGIN
    INSERT INTO public.tasks (fleet_id,title,assigned_driver_id,status)
    VALUES ('bb000000-0000-4000-8000-000000000001','Partial assignment',
      'bc000000-0000-4000-8000-000000000001','pending');
  EXCEPTION WHEN raise_exception OR check_violation THEN rejected := true;
  END;
  IF NOT coalesce(rejected,false) THEN RAISE EXCEPTION 'Partial driver-only assignment was accepted'; END IF;
  rejected := false;

  BEGIN
    INSERT INTO public.tasks (fleet_id,title,assigned_driver_id,assigned_vehicle_id,status)
    VALUES ('bb000000-0000-4000-8000-000000000001','Inactive driver assignment',
      'bc000000-0000-4000-8000-000000000002','bd000000-0000-4000-8000-000000000001','assigned');
  EXCEPTION WHEN raise_exception THEN rejected := true;
  END;
  IF NOT coalesce(rejected,false) THEN RAISE EXCEPTION 'Inactive driver assignment was accepted'; END IF;
  rejected := false;

  BEGIN
    INSERT INTO public.tasks (fleet_id,title,assigned_driver_id,assigned_vehicle_id,status)
    VALUES ('bb000000-0000-4000-8000-000000000001','Expired driver assignment',
      'bc000000-0000-4000-8000-000000000003','bd000000-0000-4000-8000-000000000001','assigned');
  EXCEPTION WHEN raise_exception THEN rejected := true;
  END;
  IF NOT coalesce(rejected,false) THEN RAISE EXCEPTION 'Expired driver assignment was accepted'; END IF;
  rejected := false;

  BEGIN
    INSERT INTO public.tasks (fleet_id,title,assigned_driver_id,assigned_vehicle_id,status)
    VALUES ('bb000000-0000-4000-8000-000000000001','Missing expiry assignment',
      'bc000000-0000-4000-8000-000000000004','bd000000-0000-4000-8000-000000000001','assigned');
  EXCEPTION WHEN raise_exception THEN rejected := true;
  END;
  IF NOT coalesce(rejected,false) THEN RAISE EXCEPTION 'Missing expiry assignment was accepted'; END IF;
  rejected := false;

  BEGIN
    INSERT INTO public.tasks (fleet_id,title,assigned_driver_id,assigned_vehicle_id,status)
    VALUES ('bb000000-0000-4000-8000-000000000001','Maintenance vehicle assignment',
      'bc000000-0000-4000-8000-000000000001','bd000000-0000-4000-8000-000000000002','assigned');
  EXCEPTION WHEN raise_exception THEN rejected := true;
  END;
  IF NOT coalesce(rejected,false) THEN RAISE EXCEPTION 'Maintenance vehicle assignment was accepted'; END IF;
  rejected := false;

  BEGIN
    INSERT INTO public.tasks (fleet_id,title,assigned_driver_id,assigned_vehicle_id,status)
    VALUES ('bb000000-0000-4000-8000-000000000001','Demo vehicle assignment',
      'bc000000-0000-4000-8000-000000000001','bd000000-0000-4000-8000-000000000003','assigned');
  EXCEPTION WHEN raise_exception THEN rejected := true;
  END;
  IF NOT coalesce(rejected,false) THEN RAISE EXCEPTION 'Demo vehicle assignment was accepted'; END IF;
  rejected := false;

  BEGIN
    INSERT INTO public.tasks (fleet_id,title,assigned_driver_id,assigned_vehicle_id,status)
    VALUES ('bb000000-0000-4000-8000-000000000001','On-trip vehicle assignment',
      'bc000000-0000-4000-8000-000000000001','bd000000-0000-4000-8000-000000000004','assigned');
  EXCEPTION WHEN raise_exception THEN rejected := true;
  END;
  IF NOT coalesce(rejected,false) THEN RAISE EXCEPTION 'On-trip vehicle assignment was accepted'; END IF;
  rejected := false;

  BEGIN
    INSERT INTO public.tasks (fleet_id,title,assigned_driver_id,assigned_vehicle_id,status)
    VALUES ('bb000000-0000-4000-8000-000000000001','Assigned without pair',
      'bc000000-0000-4000-8000-000000000001',NULL,'assigned');
  EXCEPTION WHEN raise_exception OR check_violation THEN rejected := true;
  END;
  IF NOT coalesce(rejected,false) THEN RAISE EXCEPTION 'Assigned task without both references was accepted'; END IF;
  rejected := false;

  UPDATE public.tasks
  SET assigned_driver_id = 'bc000000-0000-4000-8000-000000000002'
  WHERE title = 'Valid assigned task';
  -- The update must fail and leave the valid original assignment unchanged.
  RAISE EXCEPTION 'Inactive driver update was unexpectedly accepted';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM = 'Inactive driver update was unexpectedly accepted' THEN RAISE; END IF;
  -- The expected trigger exception is swallowed by this nested block.
END
$test$;

ROLLBACK;
