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

  -- Do not rely only on the driver's self-attested checklist. The fleet
  -- must have a recorded licence expiry date and it must still be valid.
  IF v_driver.license_expires_at IS NULL THEN
    RAISE EXCEPTION 'חסר תאריך תוקף לרישיון הנהיגה. יש להשלים את פרטי הנהג לפני פתיחת נסיעה';
  END IF;
  IF v_driver.license_expires_at::date < current_date THEN
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
  IF v_vehicle.test_due_at::date < current_date
     OR v_vehicle.insurance_due_at::date < current_date
     OR v_vehicle.registration_due_at::date < current_date THEN
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
DROP POLICY IF EXISTS vehicles_insert_managers ON public.vehicles;
DROP POLICY IF EXISTS vehicles_update_authorized ON public.vehicles;
DROP POLICY IF EXISTS vehicles_delete_managers ON public.vehicles;

CREATE POLICY vehicles_insert_managers
ON public.vehicles
FOR INSERT
TO authenticated
WITH CHECK (
  private.has_fleet_role(fleet_id, ARRAY['owner','fleet_manager'])
);

CREATE POLICY vehicles_update_authorized
ON public.vehicles
FOR UPDATE
TO authenticated
USING (
  private.has_fleet_role(fleet_id, ARRAY['owner','fleet_manager'])
)
WITH CHECK (
  private.has_fleet_role(fleet_id, ARRAY['owner','fleet_manager'])
);

CREATE POLICY vehicles_delete_managers
ON public.vehicles
FOR DELETE
TO authenticated
USING (
  private.has_fleet_role(fleet_id, ARRAY['owner','fleet_manager'])
);

-- Driver identity and licence data are safety-critical. Only the fleet owner
-- or fleet manager may create, edit, or remove driver records; dispatchers
-- may assign tasks but cannot alter driver compliance records.
DROP POLICY IF EXISTS drivers_insert_managers ON public.drivers;
DROP POLICY IF EXISTS drivers_update_managers ON public.drivers;
DROP POLICY IF EXISTS drivers_delete_managers ON public.drivers;

CREATE POLICY drivers_insert_managers
ON public.drivers
FOR INSERT
TO authenticated
WITH CHECK (
  private.has_fleet_role(fleet_id, ARRAY['owner','fleet_manager'])
);

CREATE POLICY drivers_update_managers
ON public.drivers
FOR UPDATE
TO authenticated
USING (
  private.has_fleet_role(fleet_id, ARRAY['owner','fleet_manager'])
)
WITH CHECK (
  private.has_fleet_role(fleet_id, ARRAY['owner','fleet_manager'])
);

CREATE POLICY drivers_delete_managers
ON public.drivers
FOR DELETE
TO authenticated
USING (
  private.has_fleet_role(fleet_id, ARRAY['owner','fleet_manager'])
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

-- Task lifecycle states are controlled by the trip RPCs. Managers and
-- dispatchers may assign, reassign, or cancel work before a trip starts, but
-- cannot manually set in_progress/completed or erase task history.
DROP POLICY IF EXISTS tasks_insert_managers ON public.tasks;
DROP POLICY IF EXISTS tasks_update_authorized ON public.tasks;
DROP POLICY IF EXISTS tasks_delete_managers ON public.tasks;
CREATE POLICY tasks_insert_managers
ON public.tasks
FOR INSERT
TO authenticated
WITH CHECK (
  private.has_fleet_role(fleet_id, ARRAY['owner','fleet_manager','dispatcher'])
  AND status IN ('pending','assigned')
);
CREATE POLICY tasks_update_authorized
ON public.tasks
FOR UPDATE
TO authenticated
USING (
  private.has_fleet_role(fleet_id, ARRAY['owner','fleet_manager','dispatcher'])
  AND status IN ('pending','assigned','cancelled')
)
WITH CHECK (
  private.has_fleet_role(fleet_id, ARRAY['owner','fleet_manager','dispatcher'])
  AND status IN ('pending','assigned','cancelled')
  AND NOT EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.task_id = tasks.id AND t.status = 'active'
  )
);
REVOKE DELETE ON public.tasks FROM PUBLIC, anon, authenticated;

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

-- Membership helpers are needed by authenticated RLS policies, not anonymous
-- clients. Keep their SECURITY DEFINER surface private.
REVOKE ALL ON FUNCTION private.has_fleet_role(uuid, text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_fleet_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_fleet_role(uuid, text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_fleet_member(uuid) TO authenticated, service_role;


-- Fleet membership is an authorization boundary, not an ordinary CRUD table.
-- No client role may directly add, promote, demote, or remove memberships.
-- Owner membership is provisioned only by the protected fleet-creation trigger;
-- future invitations/role changes must use a separately validated server RPC.
DROP POLICY IF EXISTS fleet_members_insert_managers ON public.fleet_members;
DROP POLICY IF EXISTS fleet_members_update_managers ON public.fleet_members;
DROP POLICY IF EXISTS fleet_members_delete_managers ON public.fleet_members;
REVOKE INSERT, UPDATE, DELETE ON public.fleet_members FROM PUBLIC, anon, authenticated;

-- No current client workflow edits or deletes fleet ownership metadata.
-- Keep fleet creation and member-scoped reads, but prevent manager-level
-- clients from changing owner_user_id through the Data API.
DROP POLICY IF EXISTS fleets_update_managers ON public.fleets;
REVOKE UPDATE, DELETE ON public.fleets FROM PUBLIC, anon, authenticated;


-- GPS telemetry is append-only. Clients may submit a point for an authorized
-- active trip, but cannot rewrite or erase previously recorded evidence.
REVOKE INSERT, UPDATE, DELETE ON public.trip_locations FROM PUBLIC, anon;
REVOKE UPDATE, DELETE ON public.trip_locations FROM authenticated;

-- Reject malformed telemetry at the database boundary. These checks validate
-- coordinate/measurement ranges; they do not authenticate the GPS source.
ALTER TABLE public.trip_locations
  ADD CONSTRAINT trip_locations_latitude_range
    CHECK (latitude BETWEEN -90 AND 90),
  ADD CONSTRAINT trip_locations_longitude_range
    CHECK (longitude BETWEEN -180 AND 180),
  ADD CONSTRAINT trip_locations_speed_nonnegative
    CHECK (speed_kmh IS NULL OR speed_kmh >= 0),
  ADD CONSTRAINT trip_locations_heading_range
    CHECK (heading_degrees IS NULL OR (heading_degrees >= 0 AND heading_degrees < 360));

-- Return one latest GPS point per active trip for the dashboard without N+1
-- client queries. SECURITY INVOKER preserves the underlying RLS policies.
CREATE OR REPLACE FUNCTION public.get_latest_trip_locations(p_fleet_id uuid)
RETURNS TABLE (
  trip_id uuid,
  driver_id uuid,
  vehicle_id uuid,
  latitude double precision,
  longitude double precision,
  speed_kmh numeric,
  recorded_at timestamptz,
  driver_name text,
  vehicle_registration text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT
    t.id,
    t.driver_id,
    t.vehicle_id,
    latest.latitude,
    latest.longitude,
    latest.speed_kmh,
    latest.recorded_at,
    d.full_name,
    v.registration_number
  FROM public.trips t
  JOIN LATERAL (
    SELECT tl.latitude, tl.longitude, tl.speed_kmh, tl.recorded_at
    FROM public.trip_locations tl
    WHERE tl.trip_id = t.id
    ORDER BY tl.recorded_at DESC
    LIMIT 1
  ) latest ON true
  LEFT JOIN public.drivers d
    ON d.id = t.driver_id AND d.fleet_id = t.fleet_id
  LEFT JOIN public.vehicles v
    ON v.id = t.vehicle_id AND v.fleet_id = t.fleet_id
  WHERE t.fleet_id = p_fleet_id
    AND t.status = 'active';
$function$;

-- Map view returns the latest location and at most 500 recent route points
-- per active trip in one database request.
CREATE OR REPLACE FUNCTION public.get_active_trip_map_data(p_fleet_id uuid)
RETURNS TABLE (
  trip_id uuid,
  driver_id uuid,
  vehicle_id uuid,
  origin_address text,
  destination_address text,
  started_at timestamptz,
  latitude double precision,
  longitude double precision,
  speed_kmh numeric,
  recorded_at timestamptz,
  history jsonb,
  driver_name text,
  vehicle_registration text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT
    t.id,
    t.driver_id,
    t.vehicle_id,
    t.origin_address,
    t.destination_address,
    t.started_at,
    latest.latitude,
    latest.longitude,
    latest.speed_kmh,
    latest.recorded_at,
    COALESCE(history.points, '[]'::jsonb),
    d.full_name,
    v.registration_number
  FROM public.trips t
  JOIN LATERAL (
    SELECT tl.latitude, tl.longitude, tl.speed_kmh, tl.recorded_at
    FROM public.trip_locations tl
    WHERE tl.trip_id = t.id
    ORDER BY tl.recorded_at DESC
    LIMIT 1
  ) latest ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'latitude', sample.latitude,
        'longitude', sample.longitude,
        'recorded_at', sample.recorded_at
      )
      ORDER BY sample.recorded_at ASC
    ) AS points
    FROM (
      SELECT tl.latitude, tl.longitude, tl.recorded_at
      FROM public.trip_locations tl
      WHERE tl.trip_id = t.id
      ORDER BY tl.recorded_at DESC
      LIMIT 500
    ) sample
  ) history ON true
  LEFT JOIN public.drivers d
    ON d.id = t.driver_id AND d.fleet_id = t.fleet_id
  LEFT JOIN public.vehicles v
    ON v.id = t.vehicle_id AND v.fleet_id = t.fleet_id
  WHERE t.fleet_id = p_fleet_id
    AND t.status = 'active';
$function$;

REVOKE ALL ON FUNCTION public.get_latest_trip_locations(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_active_trip_map_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_latest_trip_locations(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_trip_map_data(uuid) TO authenticated;


-- Compute trip distance in PostgreSQL instead of issuing one GPS query per
-- trip and transferring thousands of raw coordinates to the browser.
CREATE OR REPLACE FUNCTION public.get_trip_distance_summaries(
  p_fleet_id uuid,
  p_trip_ids uuid[]
)
RETURNS TABLE (
  trip_id uuid,
  distance_km double precision,
  point_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $function$
  WITH ordered_points AS (
    SELECT
      tl.trip_id,
      tl.latitude,
      tl.longitude,
      lag(tl.latitude) OVER (PARTITION BY tl.trip_id ORDER BY tl.recorded_at, tl.id) AS previous_latitude,
      lag(tl.longitude) OVER (PARTITION BY tl.trip_id ORDER BY tl.recorded_at, tl.id) AS previous_longitude
    FROM public.trip_locations tl
    JOIN public.trips t ON t.id = tl.trip_id
    WHERE t.fleet_id = p_fleet_id
      AND t.id = ANY(COALESCE(p_trip_ids, ARRAY[]::uuid[]))
      AND tl.latitude BETWEEN -90 AND 90
      AND tl.longitude BETWEEN -180 AND 180
  )
  SELECT
    op.trip_id,
    CASE WHEN count(*) >= 2 THEN
      sum(
        6371.0 * 2.0 * asin(sqrt(least(1.0, greatest(0.0,
          power(sin(radians(op.latitude - op.previous_latitude) / 2.0), 2)
          + cos(radians(op.previous_latitude)) * cos(radians(op.latitude))
          * power(sin(radians(op.longitude - op.previous_longitude) / 2.0), 2)
        ))))
      ) FILTER (WHERE op.previous_latitude IS NOT NULL AND op.previous_longitude IS NOT NULL)
    ELSE NULL END,
    count(*)::bigint
  FROM ordered_points op
  GROUP BY op.trip_id;
$function$;

-- Return a bounded, recent GPS history per trip in one request for the history
-- screen. Coordinates remain subject to the caller's trips/location RLS.
CREATE OR REPLACE FUNCTION public.get_trip_history_data(
  p_fleet_id uuid,
  p_trip_ids uuid[]
)
RETURNS TABLE (
  trip_id uuid,
  driver_name text,
  vehicle_registration text,
  points jsonb
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT
    t.id,
    d.full_name,
    v.registration_number,
    COALESCE(history.points, '[]'::jsonb)
  FROM public.trips t
  LEFT JOIN public.drivers d
    ON d.id = t.driver_id AND d.fleet_id = t.fleet_id
  LEFT JOIN public.vehicles v
    ON v.id = t.vehicle_id AND v.fleet_id = t.fleet_id
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'latitude', sample.latitude,
        'longitude', sample.longitude,
        'recorded_at', sample.recorded_at
      )
      ORDER BY sample.recorded_at ASC
    ) AS points
    FROM (
      SELECT tl.latitude, tl.longitude, tl.recorded_at
      FROM public.trip_locations tl
      WHERE tl.trip_id = t.id
      ORDER BY tl.recorded_at DESC
      LIMIT 500
    ) sample
  ) history ON true
  WHERE t.fleet_id = p_fleet_id
    AND t.id = ANY(COALESCE(p_trip_ids, ARRAY[]::uuid[]));
$function$;

REVOKE ALL ON FUNCTION public.get_trip_distance_summaries(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_trip_history_data(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_trip_distance_summaries(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_trip_history_data(uuid, uuid[]) TO authenticated;


-- A safety incident cannot release a vehicle lockout without a recorded
-- resolution note. The server, not the browser, owns resolution timestamps
-- and the resolving user's identity.
ALTER TABLE public.incidents
  ADD COLUMN resolution_notes text,
  ADD COLUMN resolved_by uuid;

CREATE OR REPLACE FUNCTION private.enforce_incident_resolution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IN ('resolved','closed') THEN
      IF NULLIF(btrim(NEW.resolution_notes), '') IS NULL THEN
        RAISE EXCEPTION 'יש להזין תיעוד טיפול לפני סגירת אירוע בטיחות';
      END IF;
      NEW.resolved_at := now();
      NEW.resolved_by := auth.uid();
    ELSE
      NEW.resolved_at := NULL;
      NEW.resolved_by := NULL;
      NEW.resolution_notes := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IN ('resolved','closed') THEN
    IF NULLIF(btrim(NEW.resolution_notes), '') IS NULL THEN
      RAISE EXCEPTION 'יש להזין תיעוד טיפול לפני סגירת אירוע בטיחות';
    END IF;
    IF OLD.status NOT IN ('resolved','closed') THEN
      NEW.resolved_at := now();
      NEW.resolved_by := auth.uid();
    ELSE
      NEW.resolved_at := OLD.resolved_at;
      NEW.resolved_by := OLD.resolved_by;
    END IF;
  ELSE
    NEW.resolved_at := NULL;
    NEW.resolved_by := NULL;
    NEW.resolution_notes := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.enforce_incident_resolution() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.enforce_incident_resolution() TO authenticated, service_role;

DROP TRIGGER IF EXISTS enforce_incident_resolution_before_write ON public.incidents;
CREATE TRIGGER enforce_incident_resolution_before_write
BEFORE INSERT OR UPDATE ON public.incidents
FOR EACH ROW EXECUTE FUNCTION private.enforce_incident_resolution();
