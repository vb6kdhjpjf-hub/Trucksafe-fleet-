-- Validate task assignments at the database boundary.
-- Runs in rollback-only Test CI; never apply directly to Production.
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_assignment_pair_check
  CHECK (
    (assigned_driver_id IS NULL AND assigned_vehicle_id IS NULL)
    OR
    (assigned_driver_id IS NOT NULL AND assigned_vehicle_id IS NOT NULL)
  ) NOT VALID;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_assigned_status_requires_pair_check
  CHECK (status <> 'assigned' OR (assigned_driver_id IS NOT NULL AND assigned_vehicle_id IS NOT NULL))
  NOT VALID;

ALTER TABLE public.tasks
  VALIDATE CONSTRAINT tasks_assignment_pair_check;

ALTER TABLE public.tasks
  VALIDATE CONSTRAINT tasks_assigned_status_requires_pair_check;

CREATE OR REPLACE FUNCTION private.validate_task_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_driver public.drivers%rowtype;
  v_vehicle public.vehicles%rowtype;
  v_today date := (pg_catalog.now() at time zone 'Asia/Jerusalem')::date;
BEGIN
  IF TG_OP = 'UPDATE'
     AND (
       NEW.assigned_driver_id IS DISTINCT FROM OLD.assigned_driver_id
       OR NEW.assigned_vehicle_id IS DISTINCT FROM OLD.assigned_vehicle_id
       OR NEW.fleet_id IS DISTINCT FROM OLD.fleet_id
     )
     AND OLD.status IN ('in_progress', 'completed') THEN
    RAISE EXCEPTION 'לא ניתן לשנות שיוך נהג או רכב לאחר שהמשימה החלה או הושלמה';
  END IF;

  IF NEW.assigned_driver_id IS NULL AND NEW.assigned_vehicle_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.assigned_driver_id IS NULL OR NEW.assigned_vehicle_id IS NULL THEN
    RAISE EXCEPTION 'שיבוץ משימה מחייב בחירה של נהג ורכב יחד';
  END IF;

  SELECT * INTO v_driver
  FROM public.drivers
  WHERE id = NEW.assigned_driver_id
    AND fleet_id = NEW.fleet_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'הנהג אינו שייך לצי של המשימה';
  END IF;

  IF v_driver.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'לא ניתן לשבץ נהג שאינו פעיל';
  END IF;

  IF v_driver.license_expires_at IS NULL
     OR v_driver.license_expires_at::date < v_today THEN
    RAISE EXCEPTION 'לא ניתן לשבץ נהג ללא תאריך תוקף רשום או עם תוקף שפג';
  END IF;

  SELECT * INTO v_vehicle
  FROM public.vehicles
  WHERE id = NEW.assigned_vehicle_id
    AND fleet_id = NEW.fleet_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'הרכב אינו שייך לצי של המשימה';
  END IF;

  IF v_vehicle.is_demo IS TRUE THEN
    RAISE EXCEPTION 'לא ניתן לשייך משימה לרכב הדגמה';
  END IF;

  IF v_vehicle.status NOT IN ('available', 'assigned') THEN
    RAISE EXCEPTION 'הרכב אינו זמין לשיבוץ חדש';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.validate_task_assignment() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS validate_task_assignment_before_write ON public.tasks;
CREATE TRIGGER validate_task_assignment_before_write
BEFORE INSERT OR UPDATE OF fleet_id, assigned_driver_id, assigned_vehicle_id
ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION private.validate_task_assignment();
