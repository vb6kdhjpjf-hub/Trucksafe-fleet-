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
SET search_path TO 'public'
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
    'מסמכי רכב ורישום בתוקף ותקינים'
  ];
  v_checklist jsonb;
  v_defect_details text;
  v_failed_items text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'יש להתחבר כדי לפתוח נסיעה';
  END IF;

  IF jsonb_typeof(p_checklist) <> 'object'
     OR jsonb_object_length(p_checklist) NOT IN (7, 8)
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

  v_failed_items := array_to_string(ARRAY(
    SELECT k FROM unnest(v_expected_keys) AS k
    WHERE p_checklist ->> k = 'false'
  ), ', ');

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

  IF NOT public.has_fleet_role(p_fleet_id, ARRAY['owner','fleet_manager','dispatcher'])
     AND v_driver.user_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'רק מנהל הצי או הנהג המשויך למשימה יכולים לפתוח נסיעה';
  END IF;

  SELECT * INTO v_vehicle FROM public.vehicles
  WHERE id = p_vehicle_id AND fleet_id = p_fleet_id
  FOR UPDATE;
  IF NOT FOUND OR v_vehicle.status NOT IN ('available', 'assigned') THEN
    RAISE EXCEPTION 'הרכב אינו זמין לנסיעה או שאינו שייך לצי';
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
