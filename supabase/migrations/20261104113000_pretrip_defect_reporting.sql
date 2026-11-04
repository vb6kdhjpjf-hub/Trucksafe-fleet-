-- Preserve the existing authenticated, fleet-scoped workflow while recording failed checks.
CREATE OR REPLACE FUNCTION public.start_trip_with_inspection(
  p_fleet_id uuid,
  p_task_id uuid,
  p_driver_id uuid,
  p_vehicle_id uuid,
  p_origin_address text,
  p_destination_address text,
  p_checklist jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_trip_id uuid;
  v_user_id uuid := auth.uid();
  v_task public.tasks%rowtype;
  v_vehicle public.vehicles%rowtype;
  v_driver public.drivers%rowtype;
  v_expected_keys text[] := ARRAY[
    'צמיגים ולחץ אוויר תקינים',
    'בלמים ובלם חניה תקינים',
    'אורות, איתותים וצופר תקינים',
    'מראות, שמשות ומגבים תקינים',
    'אין נזילות או נזק גלוי',
    'המטען מאובטח והמשקל מתאים',
    'מסמכי רכב ורישיון נהיגה בתוקף'
  ];
  v_checklist jsonb;
  v_defect_details text;
  v_failed_items text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'יש להתחבר כדי לפתוח נסיעה';
  END IF;

  -- Validate the JSON container before calling object-only JSON functions.
  IF p_checklist IS NULL OR jsonb_typeof(p_checklist) <> 'object' THEN
    RAISE EXCEPTION 'יש לבחור תקין או נמצאה תקלה בכל שבעת סעיפי הבדיקה';
  END IF;

  IF (SELECT count(*) FROM jsonb_object_keys(p_checklist)) NOT IN (7, 8)
     OR EXISTS (
       SELECT 1 FROM jsonb_object_keys(p_checklist) AS supplied(key)
       WHERE supplied.key <> ALL(v_expected_keys)
         AND supplied.key <> '_defect_details'
     )
     OR EXISTS (
       SELECT 1 FROM unnest(v_expected_keys) AS k
       WHERE NOT (p_checklist ? k)
          OR jsonb_typeof(p_checklist -> k) <> 'boolean'
     ) THEN
    RAISE EXCEPTION 'יש לבחור תקין או נמצאה תקלה בכל שבעת סעיפי הבדיקה';
  END IF;

  v_checklist := p_checklist - '_defect_details';
  v_defect_details := NULLIF(btrim(p_checklist ->> '_defect_details'), '');

  IF p_checklist ? '_defect_details'
     AND (jsonb_typeof(p_checklist -> '_defect_details') <> 'string'
          OR length(COALESCE(p_checklist ->> '_defect_details', '')) > 1000) THEN
    RAISE EXCEPTION 'תיאור התקלה אינו תקין';
  END IF;

  v_failed_items := NULLIF(array_to_string(ARRAY(
    SELECT k FROM unnest(v_expected_keys) AS k
    WHERE p_checklist ->> k = 'false'
  ), ', '), '');

  IF p_checklist ? '_defect_details' AND v_defect_details IS NULL THEN
    RAISE EXCEPTION 'תיאור התקלה אינו יכול להיות ריק';
  END IF;

  IF v_failed_items IS NOT NULL AND v_defect_details IS NULL THEN
    RAISE EXCEPTION 'יש לפרט את הליקוי לפני שמירת הבדיקה';
  END IF;

  IF v_failed_items IS NULL AND v_defect_details IS NOT NULL THEN
    RAISE EXCEPTION 'נוסף תיאור תקלה אך כל הסעיפים סומנו תקינים';
  END IF;

  SELECT * INTO v_task
  FROM public.tasks
  WHERE id = p_task_id AND fleet_id = p_fleet_id
    AND assigned_driver_id = p_driver_id AND assigned_vehicle_id = p_vehicle_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'המשימה, הנהג או הרכב אינם משויכים כראוי';
  END IF;
  IF v_task.status NOT IN ('pending', 'assigned') THEN
    RAISE EXCEPTION 'המשימה אינה זמינה לפתיחת נסיעה';
  END IF;

  SELECT * INTO v_driver FROM public.drivers
  WHERE id = p_driver_id AND fleet_id = p_fleet_id
  FOR UPDATE;
  IF NOT FOUND OR v_driver.status <> 'active' THEN
    RAISE EXCEPTION 'הנהג אינו פעיל או שאינו שייך לצי';
  END IF;

  -- Do not rely only on the driver's self-attested checklist when the fleet
  -- has a recorded licence expiry date.
  IF v_driver.license_expires_at IS NOT NULL
     AND v_driver.license_expires_at::date < current_date THEN
    RAISE EXCEPTION 'רישיון הנהיגה של הנהג פג תוקף. יש לעדכן את המסמכים לפני פתיחת נסיעה';
  END IF;

  IF NOT private.has_fleet_role(p_fleet_id, ARRAY['owner','fleet_manager','dispatcher'])
     AND v_driver.user_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'רק מנהל הצי או הנהג המשויך למשימה יכולים לפתוח נסיעה';
  END IF;

  SELECT * INTO v_vehicle FROM public.vehicles
  WHERE id = p_vehicle_id AND fleet_id = p_fleet_id
  FOR UPDATE;
  IF NOT FOUND OR v_vehicle.status NOT IN ('available', 'assigned') THEN
    RAISE EXCEPTION 'הרכב אינו זמין לנסיעה או שאינו שייך לצי';
  END IF;

  -- A recorded expired vehicle document is a hard stop, independent of the
  -- driver's checklist response.
  IF (v_vehicle.test_due_at IS NOT NULL AND v_vehicle.test_due_at::date < current_date)
     OR (v_vehicle.insurance_due_at IS NOT NULL AND v_vehicle.insurance_due_at::date < current_date)
     OR (v_vehicle.registration_due_at IS NOT NULL AND v_vehicle.registration_due_at::date < current_date) THEN
    RAISE EXCEPTION 'אחד ממסמכי הרכב פג תוקף. יש לעדכן את הטסט, הביטוח או רישיון הרכב לפני פתיחת נסיעה';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.incidents i
    WHERE i.fleet_id = p_fleet_id
      AND i.vehicle_id = p_vehicle_id
      AND i.incident_type = 'ליקוי בבדיקת בטיחות לפני נסיעה'
      AND i.status IN ('open', 'investigating')
  ) THEN
    RAISE EXCEPTION 'קיימת תקלה בטיחותית פתוחה לרכב. מנהל הבטיחות חייב לאשר את הטיפול לפני בדיקה ונסיעה חדשה';
  END IF;

  IF EXISTS (SELECT 1 FROM public.trips WHERE task_id = p_task_id AND status IN ('planned', 'active')) THEN
    RAISE EXCEPTION 'כבר קיימת נסיעה פעילה או מתוכננת למשימה';
  END IF;
  IF EXISTS (SELECT 1 FROM public.trips WHERE vehicle_id = p_vehicle_id AND status = 'active') THEN
    RAISE EXCEPTION 'כבר קיימת נסיעה פעילה לרכב זה';
  END IF;

  -- A failed inspection is saved for the audit trail, but no trip is created.
  IF v_failed_items IS NOT NULL THEN
    INSERT INTO public.inspections (
      fleet_id, trip_id, vehicle_id, driver_id, inspection_type,
      checklist, defects, passed, inspected_at
    ) VALUES (
      p_fleet_id, NULL, p_vehicle_id, p_driver_id, 'pre_trip',
      v_checklist, v_failed_items || '. פירוט הנהג: ' || v_defect_details,
      false, now()
    );

    INSERT INTO public.incidents (
      fleet_id, driver_id, vehicle_id, severity, incident_type,
      description, status, reported_at, created_by
    ) VALUES (
      p_fleet_id, p_driver_id, p_vehicle_id, 'high',
      'ליקוי בבדיקת בטיחות לפני נסיעה',
      'סעיפים שנכשלו: ' || v_failed_items || '. פירוט הנהג: ' || v_defect_details,
      'open', now(), v_user_id
    );
    RETURN NULL;
  END IF;

  UPDATE public.vehicles SET status = 'on_trip'
  WHERE id = p_vehicle_id AND fleet_id = p_fleet_id;

  INSERT INTO public.trips (
    fleet_id, task_id, driver_id, vehicle_id, status,
    origin_address, destination_address, started_at
  ) VALUES (
    p_fleet_id, p_task_id, p_driver_id, p_vehicle_id, 'active',
    p_origin_address, p_destination_address, now()
  ) RETURNING id INTO v_trip_id;

  INSERT INTO public.inspections (
    fleet_id, trip_id, vehicle_id, driver_id, inspection_type,
    checklist, defects, passed, inspected_at
  ) VALUES (
    p_fleet_id, v_trip_id, p_vehicle_id, p_driver_id, 'pre_trip',
    v_checklist, NULL, true, now()
  );

  UPDATE public.tasks SET status = 'in_progress'
  WHERE id = p_task_id AND fleet_id = p_fleet_id;

  RETURN v_trip_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.start_trip_with_inspection(uuid, uuid, uuid, uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_trip_with_inspection(uuid, uuid, uuid, uuid, text, text, jsonb) TO authenticated;


-- Permit an authenticated, assigned driver (or fleet manager) to save a failed
-- pre-trip inspection with no trip_id. Keep the original policy for trip-linked
-- inspections unchanged.
DROP POLICY IF EXISTS inspections_insert_authorized ON public.inspections;

CREATE POLICY inspections_insert_authorized
ON public.inspections
FOR INSERT
TO authenticated
WITH CHECK (
  (
    trip_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.trips t
      WHERE t.id = inspections.trip_id
        AND t.fleet_id = inspections.fleet_id
        AND t.vehicle_id = inspections.vehicle_id
        AND t.driver_id = inspections.driver_id
        AND t.status = 'active'
        AND (
          private.has_fleet_role(t.fleet_id, ARRAY['owner','fleet_manager','dispatcher'])
          OR EXISTS (
            SELECT 1
            FROM public.drivers d
            WHERE d.id = t.driver_id
              AND d.fleet_id = t.fleet_id
              AND d.user_id = (SELECT auth.uid())
              AND d.status = 'active'
          )
        )
    )
  )
  OR
  (
    trip_id IS NULL
    AND inspection_type = 'pre_trip'
    AND passed = false
    AND defects IS NOT NULL
    AND private.is_fleet_member(fleet_id)
    AND EXISTS (
      SELECT 1
      FROM public.drivers d
      WHERE d.id = inspections.driver_id
        AND d.fleet_id = inspections.fleet_id
        AND d.status = 'active'
        AND (
          private.has_fleet_role(inspections.fleet_id, ARRAY['owner','fleet_manager','dispatcher'])
          OR d.user_id = (SELECT auth.uid())
        )
    )
    AND EXISTS (
      SELECT 1
      FROM public.vehicles v
      WHERE v.id = inspections.vehicle_id
        AND v.fleet_id = inspections.fleet_id
        AND v.status IN ('available','assigned')
    )
  )
);

-- Direct vehicle-row updates are manager-only. Drivers change trip state only
-- through the narrowly validated SECURITY DEFINER trip RPCs above. This prevents
-- a driver assigned to one vehicle from editing its registration or compliance data.
DROP POLICY IF EXISTS vehicles_update_authorized ON public.vehicles;

CREATE POLICY vehicles_update_authorized
ON public.vehicles
FOR UPDATE
TO authenticated
USING (
  private.has_fleet_role(fleet_id, ARRAY['owner','fleet_manager','dispatcher'])
)
WITH CHECK (
  private.has_fleet_role(fleet_id, ARRAY['owner','fleet_manager','dispatcher'])
);

-- The helper was moved to the private schema by an earlier hardening migration.
-- This narrowly validated RPC runs as its owner; keep all authorization checks explicit.
CREATE OR REPLACE FUNCTION public.finish_trip(
  p_fleet_id uuid,
  p_trip_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_trip public.trips%rowtype;
  v_driver_user_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'יש להתחבר כדי לסיים נסיעה';
  END IF;

  SELECT * INTO v_trip
  FROM public.trips
  WHERE id = p_trip_id AND fleet_id = p_fleet_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'הנסיעה לא נמצאה בצי';
  END IF;
  IF v_trip.status <> 'active' THEN
    RAISE EXCEPTION 'הנסיעה אינה פעילה או שכבר הסתיימה';
  END IF;

  SELECT d.user_id INTO v_driver_user_id
  FROM public.drivers d
  WHERE d.id = v_trip.driver_id AND d.fleet_id = p_fleet_id;

  IF NOT private.has_fleet_role(p_fleet_id, ARRAY['owner','fleet_manager','dispatcher'])
     AND v_driver_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'רק מנהל הצי או הנהג המשויך לנסיעה יכולים לסיים אותה';
  END IF;

  -- Serialize completion of trips sharing one vehicle. Without this row lock,
  -- two concurrent finish calls could both observe the other's trip as active,
  -- skip releasing the vehicle, and leave it stuck in on_trip after both commit.
  PERFORM 1
  FROM public.vehicles
  WHERE id = v_trip.vehicle_id AND fleet_id = p_fleet_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'הרכב של הנסיעה לא נמצא בצי';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.trips
    WHERE fleet_id = p_fleet_id
      AND vehicle_id = v_trip.vehicle_id
      AND status = 'active'
      AND id <> p_trip_id
  ) THEN
    UPDATE public.vehicles
    SET status = 'available', updated_at = now()
    WHERE id = v_trip.vehicle_id
      AND fleet_id = p_fleet_id
      AND status = 'on_trip';
  END IF;

  UPDATE public.trips
  SET status = 'completed', ended_at = now(), updated_at = now()
  WHERE id = p_trip_id AND fleet_id = p_fleet_id;

  IF v_trip.task_id IS NOT NULL THEN
    UPDATE public.tasks
    SET status = 'completed', updated_at = now()
    WHERE id = v_trip.task_id AND fleet_id = p_fleet_id;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.finish_trip(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_trip(uuid, uuid) TO authenticated;


-- Close direct-write paths that could bypass the pre-trip inspection and the
-- atomic trip/vehicle/task lifecycle. The authenticated client must use the
-- validated RPCs above; audit records remain read-only to fleet users.
DROP POLICY IF EXISTS trips_insert_authorized ON public.trips;
DROP POLICY IF EXISTS trips_update_authorized ON public.trips;
DROP POLICY IF EXISTS trips_delete_managers ON public.trips;
REVOKE INSERT, UPDATE, DELETE ON public.trips FROM PUBLIC, anon, authenticated;

-- Inspection rows are created only by the validated lifecycle RPC so a client
-- cannot record a failed check without also creating the safety incident/lockout.
DROP POLICY IF EXISTS inspections_insert_authorized ON public.inspections;
REVOKE INSERT, UPDATE, DELETE ON public.inspections FROM PUBLIC, anon, authenticated;

-- Drivers must not mark tasks complete directly. start_trip_with_inspection
-- and finish_trip update task state atomically as their owner; managers retain
-- the ordinary task-management path.
DROP POLICY IF EXISTS tasks_update_authorized ON public.tasks;
CREATE POLICY tasks_update_authorized
ON public.tasks
FOR UPDATE
TO authenticated
USING (
  private.has_fleet_role(fleet_id, ARRAY['owner','fleet_manager','dispatcher'])
)
WITH CHECK (
  private.has_fleet_role(fleet_id, ARRAY['owner','fleet_manager','dispatcher'])
);

-- Incident reports may be created by any authenticated fleet member, but the
-- reporter must identify themselves and a new report cannot be inserted as
-- already resolved/closed.
DROP POLICY IF EXISTS incidents_insert_member ON public.incidents;
CREATE POLICY incidents_insert_member
ON public.incidents
FOR INSERT
TO authenticated
WITH CHECK (
  private.is_fleet_member(fleet_id)
  AND created_by = (SELECT auth.uid())
  AND status = 'open'
);

-- Harden the private membership helpers against search_path object shadowing.
CREATE OR REPLACE FUNCTION private.has_fleet_role(target_fleet uuid, allowed_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.fleet_members fm
    WHERE fm.fleet_id = target_fleet
      AND fm.user_id = auth.uid()
      AND fm.role = ANY(allowed_roles)
  );
$function$;

CREATE OR REPLACE FUNCTION private.is_fleet_member(target_fleet uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.fleet_members fm
    WHERE fm.fleet_id = target_fleet
      AND fm.user_id = auth.uid()
  );
$function$;
