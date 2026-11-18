-- Require verified, present vehicle registration evidence at the server trip boundary.
-- This migration is included in rollback-only Test CI; never apply directly to Production.
CREATE OR REPLACE FUNCTION public.start_trip_with_inspection(p_fleet_id uuid, p_task_id uuid, p_driver_id uuid, p_vehicle_id uuid, p_origin_address text, p_destination_address text, p_checklist jsonb)
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
  v_today date := (pg_catalog.now() at time zone 'Asia/Jerusalem')::date;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'יש להתחבר כדי לפתוח נסיעה';
  END IF;
  IF NOT private.is_fleet_member(p_fleet_id) THEN
    RAISE EXCEPTION 'רק חבר צי פעיל יכול לפתוח נסיעה';
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

  -- Do not rely only on the driver's self-attested checklist. The fleet
  -- must have a recorded licence expiry date and it must still be valid.
  IF v_driver.license_expires_at IS NULL THEN
    RAISE EXCEPTION 'חסר תאריך תוקף לרישיון הנהיגה. יש להשלים את פרטי הנהג לפני פתיחת נסיעה';
  END IF;
  IF v_driver.license_expires_at::date < v_today THEN
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

  -- Missing compliance dates are unknown, not proof of validity. Require all
  -- three legal vehicle-document dates before allowing a trip.
  IF v_vehicle.test_due_at IS NULL
     OR v_vehicle.insurance_due_at IS NULL
     OR v_vehicle.registration_due_at IS NULL THEN
    RAISE EXCEPTION 'חסרים תאריכי תוקף למסמכי הרכב. יש להשלים טסט, ביטוח ורישיון רכב לפני פתיחת נסיעה';
  END IF;
  IF v_vehicle.test_due_at::date < v_today
     OR v_vehicle.insurance_due_at::date < v_today
     OR v_vehicle.registration_due_at::date < v_today THEN
    RAISE EXCEPTION 'אחד ממסמכי הרכב פג תוקף. יש לעדכן את הטסט, הביטוח או רישיון הרכב לפני פתיחת נסיעה';
  END IF;

  -- Require an explicitly reviewed registration document, not just an unexpired date.
  IF v_vehicle.registration_verification_status IS DISTINCT FROM 'verified'
     OR v_vehicle.registration_document_path IS NULL
     OR v_vehicle.registration_document_path NOT LIKE p_fleet_id::text || '/' || p_vehicle_id::text || '/%'
     OR v_vehicle.registration_document_uploaded_at IS NULL
     OR v_vehicle.registration_verified_at IS NULL
     OR v_vehicle.registration_verified_by IS NULL
     OR NULLIF(btrim(v_vehicle.registration_verification_note), '') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM storage.objects o
       WHERE o.bucket_id = 'vehicle-registrations'
         AND o.name = v_vehicle.registration_document_path
         AND COALESCE(o.is_delete_marker, false) = false
         AND o.archived_at IS NULL
     ) THEN
    RAISE EXCEPTION 'רישיון הרכב טרם אומת או שמסמך הרישוי אינו זמין. יש להשלים בדיקה לפני פתיחת נסיעה';
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
