-- Rollback-only integration tests against the dedicated TruckSafe Fleet Test project.
-- Every fixture is synthetic and the transaction is always rolled back.
begin;

-- Apply candidate migrations transactionally for this rollback-only test.
\ir ../../supabase/migrations/20261114130000_enforce_single_active_trip_assignments.sql
\ir ../../supabase/migrations/20261114141000_prevent_driver_deactivation_during_active_trip.sql
\ir ../../supabase/migrations/20261114143000_enforce_vehicle_active_trip_status.sql
\ir ../../supabase/migrations/20261114145000_lock_driver_before_trip_completion.sql
\ir ../../supabase/migrations/20261115100000_protect_referenced_private_evidence.sql
\ir ../../supabase/migrations/20261115113000_guard_vehicle_registration_insert_verification.sql
\ir ../../supabase/migrations/20261115120000_use_israel_local_date_for_trip_compliance.sql
\ir ../../supabase/migrations/20261117165300_harden_verified_bridge_country_and_verifier.sql

create temporary table trucksafe_e2e_results (
  scenario text not null,
  outcome text not null,
  detail text

) on commit drop;

do $road_restriction_evidence_schema_test$
declare
  required_columns text[] := array[
    'structure_id', 'road_segment_id', 'lane_id', 'passage_length_m',
    'posted_clearance_status', 'posted_clearance_m', 'surveyor',
    'measurement_coverage'
  ];
  required_guard_fragments text[] := array[
    'COUNTRY_CODE = ''IL''',
    'COUNTRY_CODE IS NOT NULL',
    'DIRECTION IS NOT NULL',
    'PASSAGE_LENGTH_M IS NOT NULL',
    'MAX_HEIGHT_M IS NOT NULL',
    'MEASURED_CLEARANCE_M IS NOT NULL',
    'MEASUREMENT_DATE IS NOT NULL',
    'MEASUREMENT_ACCURACY_CM IS NOT NULL',
    'MEASUREMENT_METHOD',
    'MEASUREMENT_LOCATION_NOTE',
    'MEASUREMENT_DOCUMENT_URL IS NOT NULL',
    'VERIFIED_AT IS NOT NULL',
    'VERIFIED_BY IS NOT NULL',
    'SOURCE_NAME',
    'SOURCE_URL IS NOT NULL',
    'SOURCE_LAST_CHECKED_AT IS NOT NULL',
    'VERIFICATION_NOTE',
    'POSTED_CLEARANCE_STATUS IS NOT NULL',
    'SURVEYOR',
    'MEASUREMENT_COVERAGE IS NOT NULL'
  ];
  missing_columns text[];
  missing_constraints text[];
  guard_definition text;
  required_fragment text;
begin
  select array_agg(required.column_name order by required.column_name)
  into missing_columns
  from unnest(required_columns) as required(column_name)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'road_restrictions'
      and c.column_name = required.column_name
  );

  if missing_columns is not null then
    raise exception 'Road restriction evidence schema is missing columns: %', missing_columns;
  end if;

  select array_agg(required.constraint_name order by required.constraint_name)
  into missing_constraints
  from unnest(array[
    'road_restrictions_passage_length_check',
    'road_restrictions_posted_clearance_status_check',
    'road_restrictions_posted_clearance_value_check',
    'road_restrictions_measurement_coverage_shape_check',
    'road_restrictions_verified_lane_level_height_evidence_check',
    'road_restrictions_verified_height_measurement_check'
  ]) as required(constraint_name)
  where not exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.road_restrictions'::regclass
      and c.conname = required.constraint_name
      and c.convalidated
  );

  if missing_constraints is not null then
    raise exception 'Road restriction evidence constraints are missing or unvalidated: %', missing_constraints;
  end if;

  -- The complete verification contract is intentionally split across
  -- independent CHECK constraints: lane-level provenance and the existing
  -- physical measurement/safety-margin guard. Inspect both together.
  select string_agg(upper(pg_get_constraintdef(c.oid)), ' AND ')
  into guard_definition
  from pg_constraint c
  where c.conrelid = 'public.road_restrictions'::regclass
    and c.conname in (
      'road_restrictions_verified_lane_level_height_evidence_check',
      'road_restrictions_verified_height_measurement_check'
    )
    and c.convalidated;

  if guard_definition is null then
    raise exception 'Verified height evidence constraints are missing or unvalidated';
  end if;

  foreach required_fragment in array required_guard_fragments loop
    if position(required_fragment in guard_definition) = 0 then
      raise exception 'Verified bridge evidence guard is missing required rule: %', required_fragment;
    end if;
  end loop;

  if exists (
    select 1 from public.road_restrictions
    where restriction_type = 'height'
      and verification_status = 'verified'
      and (
        nullif(btrim(structure_id), '') is null
        or nullif(btrim(road_segment_id), '') is null
        or nullif(btrim(lane_id), '') is null
        or direction is null
        or direction not in ('forward', 'backward')
        or passage_length_m is null
        or max_height_m is null
        or measured_clearance_m is null
        or measurement_date is null
        or measurement_accuracy_cm is null
        or nullif(btrim(measurement_method), '') is null
        or nullif(btrim(measurement_location_note), '') is null
        or nullif(btrim(measurement_document_url), '') is null
        or verified_at is null
        or verified_by is null
        or nullif(btrim(source_name), '') is null
        or nullif(btrim(source_url), '') is null
        or source_last_checked_at is null
        or nullif(btrim(verification_note), '') is null
        or posted_clearance_status is null
        or nullif(btrim(surveyor), '') is null
        or measurement_coverage is null
      )
  ) then
    raise exception 'A verified height restriction lacks required physical survey or provenance evidence';
  end if;

  insert into pg_temp.trucksafe_e2e_results values
    ('lane-level bridge clearance evidence schema', 'PASS',
     'Required fields and complete verified-evidence constraints exist; no verified height row lacks evidence');
end
$road_restriction_evidence_schema_test$;

do $israel_date_guard_test$
declare
  definition text := lower(pg_get_functiondef(
    'public.start_trip_with_inspection(uuid,uuid,uuid,uuid,text,text,jsonb)'::regprocedure
  ));
  today_reference_count integer;
begin
  today_reference_count := (length(definition) - length(replace(definition, 'v_today', ''))) / length('v_today');
  if position('asia/jerusalem' in definition) = 0
     or position('v_today date' in definition) = 0
     or position('current_date' in definition) > 0
     or today_reference_count <> 5 then
    raise exception 'Trip compliance must use one Israel-local calendar date for driver licence and all vehicle documents';
  end if;
  insert into pg_temp.trucksafe_e2e_results values
    ('Israel-local trip document expiry', 'PASS',
     'Driver licence, vehicle test, insurance and registration compare against one Asia/Jerusalem date');
end
$israel_date_guard_test$;

do $evidence_guard_test$
declare
  helper_definition text;
begin
  helper_definition := lower(pg_get_functiondef(
    'private.storage_object_is_referenced(text,text)'::regprocedure
  ));

  if position('public.vehicles' in helper_definition) = 0
     or position('public.vehicle_special_equipment' in helper_definition) = 0
     or position('lifting_chart_document_path' in helper_definition) = 0
     or position('operating_manual_document_path' in helper_definition) = 0
     or position('public.incidents' in helper_definition) = 0 then
    raise exception 'Evidence reference guard must cover vehicle registrations, lifting charts, operating manuals, and incident photos';
  end if;

  if not (
    select prosecdef
    from pg_proc
    where oid = 'private.storage_object_is_referenced(text,text)'::regprocedure
  ) then
    raise exception 'Evidence reference guard must be SECURITY DEFINER so caller RLS cannot hide references';
  end if;

  if not has_function_privilege('authenticated',
       'private.storage_object_is_referenced(text,text)', 'EXECUTE')
     or has_function_privilege('anon',
       'private.storage_object_is_referenced(text,text)', 'EXECUTE') then
    raise exception 'Evidence reference guard must be executable by authenticated users only';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'vehicle_registrations_manager_delete'
      and cmd = 'DELETE'
      and coalesce(qual, '') ilike '%storage_object_is_referenced%'
  ) then
    raise exception 'Vehicle registration delete policy must block deletion of referenced evidence';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'incident_photos_member_delete_own'
      and cmd = 'DELETE'
      and coalesce(qual, '') ilike '%storage_object_is_referenced%'
  ) then
    raise exception 'Incident photo delete policy must block deletion of referenced evidence';
  end if;

  insert into pg_temp.trucksafe_e2e_results values
    ('referenced private evidence deletion guard', 'PASS',
     'Migration applies transactionally; helper is SECURITY DEFINER with restricted execution and both delete policies call it');
end
$evidence_guard_test$;

do $vehicle_insert_verification_test$
declare
  definition text;
begin
  definition := lower(pg_get_functiondef(
    'private.guard_vehicle_registration_verification()'::regprocedure
  ));

  if position('tg_op = ''insert''' in definition) = 0
     or position('registration_verification_status := ''unverified''' in definition) = 0
     or position('registration_document_path := null' in definition) = 0
     or position('registration_document_uploaded_at := null' in definition) = 0
     or position('registration_verified_at := null' in definition) = 0
     or position('registration_verified_by := null' in definition) = 0
     or position('registration_verification_note := null' in definition) = 0 then
    raise exception 'Vehicle registration guard must clear all client-supplied evidence and approval metadata on INSERT';
  end if;

  if (
    select count(distinct event_manipulation)
    from information_schema.triggers
    where trigger_schema = 'public'
      and event_object_table = 'vehicles'
      and trigger_name = 'guard_vehicle_registration_verification'
      and event_manipulation in ('INSERT','UPDATE')
  ) <> 2 then
    raise exception 'Vehicle registration verification guard must run on both INSERT and UPDATE';
  end if;

  insert into pg_temp.trucksafe_e2e_results values
    ('vehicle registration insert verification guard', 'PASS',
     'Trigger is attached to INSERT and UPDATE; client inserts cannot claim trusted verification');
end
$vehicle_insert_verification_test$;

do $guard_test$
declare
  finish_definition text := lower(pg_get_functiondef('public.finish_trip(uuid,uuid)'::regprocedure));
  task_query_position integer;
  driver_query_position integer;
  trip_lock_position integer;
  vehicle_query_position integer;
begin
  task_query_position := position('from public.tasks' in finish_definition);
  driver_query_position := position('from public.drivers' in finish_definition);
  -- The first trips query is an intentionally unlocked candidate lookup.
  -- The second trips query, after task and driver locks, must lock the trip row.
  if driver_query_position > 0 then
    trip_lock_position := driver_query_position
      + position('from public.trips' in substring(finish_definition from driver_query_position));
  end if;
  vehicle_query_position := position('from public.vehicles' in finish_definition);

  if task_query_position = 0 or driver_query_position = 0
     or trip_lock_position <= driver_query_position
     or vehicle_query_position = 0
     or not (task_query_position < driver_query_position
       and driver_query_position < trip_lock_position
       and trip_lock_position < vehicle_query_position)
     or position('for update' in substring(finish_definition from task_query_position for driver_query_position - task_query_position)) = 0
     or position('for update' in substring(finish_definition from driver_query_position for trip_lock_position - driver_query_position)) = 0
     or position('for update' in substring(finish_definition from trip_lock_position for vehicle_query_position - trip_lock_position)) = 0
     or position('for update' in substring(finish_definition from vehicle_query_position)) = 0 then
    raise exception 'finish_trip must lock task -> driver -> trip -> vehicle, matching trip-start lock order';
  end if;

  if position('v_trip.driver_id is distinct from v_candidate_driver_id' in finish_definition) = 0
     or position('v_trip.task_id is distinct from v_candidate_task_id' in finish_definition) = 0 then
    raise exception 'finish_trip must revalidate trip assignments after acquiring parent locks';
  end if;

  if position('for update' in lower(pg_get_functiondef(
    'private.assert_vehicle_trip_status(uuid,uuid)'::regprocedure
  ))) = 0 then
    raise exception 'Vehicle trip-state assertion must lock the vehicle row to serialize concurrent writes';
  end if;
  if position('for update' in lower(pg_get_functiondef(
    'private.assert_driver_trip_status(uuid,uuid)'::regprocedure
  ))) = 0 then
    raise exception 'Driver trip-state assertion must lock the driver row to serialize concurrent writes';
  end if;

  if has_function_privilege('anon', 'private.assert_vehicle_trip_status(uuid,uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'private.assert_vehicle_trip_status(uuid,uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'private.assert_driver_trip_status(uuid,uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'private.assert_driver_trip_status(uuid,uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'private.check_driver_state_after_driver_change()', 'EXECUTE')
     or has_function_privilege('authenticated', 'private.check_driver_state_after_driver_change()', 'EXECUTE')
     or has_function_privilege('anon', 'private.check_driver_state_after_trip_change()', 'EXECUTE')
     or has_function_privilege('authenticated', 'private.check_driver_state_after_trip_change()', 'EXECUTE') then
    raise exception 'Private trigger functions must not be executable through client roles';
  end if;

  insert into pg_temp.trucksafe_e2e_results values
    ('serialized driver and vehicle state guards', 'PASS',
     'Both state checks lock their parent row and private trigger functions are not client-executable');

  insert into pg_temp.trucksafe_e2e_results values
    ('finish-trip task-driver-trip-vehicle lock order', 'PASS',
     'Completion follows task -> driver -> trip -> vehicle and revalidates assignments');
end
$guard_test$;

do $test$
declare
  -- Successful lifecycle fixture
  u1 uuid := 'f8d0f66b-52e6-4e7e-a641-5c0f2f8eaf11';
  f1 uuid := 'b4fbe3c8-1a2f-4c7a-8c6e-6f9a1b0c2d33';
  d1 uuid := 'd1d0f66b-52e6-4e7e-a641-5c0f2f8eaf11';
  d1b uuid := 'd1d0f66b-52e6-4e7e-a641-5c0f2f8eaf15';
  v1 uuid := 'e2d0f66b-52e6-4e7e-a641-5c0f2f8eaf11';
  v1b uuid := 'e2d0f66b-52e6-4e7e-a641-5c0f2f8eaf15';
  t1 uuid := 'a3d0f66b-52e6-4e7e-a641-5c0f2f8eaf11';
  t1b uuid := 'a3d0f66b-52e6-4e7e-a641-5c0f2f8eaf16';
  t1c uuid := 'a3d0f66b-52e6-4e7e-a641-5c0f2f8eaf17';
  v_trip_id uuid;
  affected_rows integer;
  driver_deactivation_blocked boolean := false;
  vehicle_available_blocked boolean := false;
  vehicle_on_trip_without_trip_blocked boolean := false;
  off_duty_start_blocked boolean := false;

  -- Safety-block fixtures
  u2 uuid := 'f8d0f66b-52e6-4e7e-a641-5c0f2f8eaf12';
  f2 uuid := 'b4fbe3c8-1a2f-4c7a-8c6e-6f9a1b0c2d34';
  d2a uuid := 'd1d0f66b-52e6-4e7e-a641-5c0f2f8eaf12';
  v2a uuid := 'e2d0f66b-52e6-4e7e-a641-5c0f2f8eaf12';
  t2a uuid := 'a3d0f66b-52e6-4e7e-a641-5c0f2f8eaf12';
  d2b uuid := 'd1d0f66b-52e6-4e7e-a641-5c0f2f8eaf13';
  v2b uuid := 'e2d0f66b-52e6-4e7e-a641-5c0f2f8eaf13';
  t2b uuid := 'a3d0f66b-52e6-4e7e-a641-5c0f2f8eaf13';
  d2c uuid := 'd1d0f66b-52e6-4e7e-a641-5c0f2f8eaf14';
  v2c uuid := 'e2d0f66b-52e6-4e7e-a641-5c0f2f8eaf14';
  t2c uuid := 'a3d0f66b-52e6-4e7e-a641-5c0f2f8eaf14';

  good_checklist jsonb := jsonb_build_object(
    'צמיגים ולחץ אוויר תקינים', true,
    'בלמים ובלם חניה תקינים', true,
    'אורות, איתותים וצופר תקינים', true,
    'מראות, שמשות ומגבים תקינים', true,
    'אין נזילות או נזק גלוי', true,
    'המטען מאובטח והמשקל מתאים', true,
    'מסמכי רכב ורישיון נהיגה בתוקף', true
  );
  failed_checklist jsonb := jsonb_build_object(
    'צמיגים ולחץ אוויר תקינים', true,
    'בלמים ובלם חניה תקינים', false,
    'אורות, איתותים וצופר תקינים', true,
    'מראות, שמשות ומגבים תקינים', true,
    'אין נזילות או נזק גלוי', true,
    'המטען מאובטח והמשקל מתאים', true,
    'מסמכי רכב ורישיון נהיגה בתוקף', true,
    '_defect_details', 'בדיקת CI: תקלה מדומה בבלמים'
  );
  msg text;
begin
  insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
  values
    (u1, 'authenticated', 'authenticated', 'trucksafe-ci-lifecycle@example.invalid', 'test-only-no-login', now(),
     '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb),
    (u2, 'authenticated', 'authenticated', 'trucksafe-ci-safety@example.invalid', 'test-only-no-login', now(),
     '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);

  -- Test as authenticated fleet owners. Creating a fleet automatically creates its owner membership.
  perform set_config('request.jwt.claim.sub', u1::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  insert into public.fleets (id, name, owner_user_id) values (f1, 'CI lifecycle test fleet', u1);
  insert into public.drivers (id, fleet_id, full_name, license_expires_at, status)
    values (d1, f1, 'CI Test Driver', current_date + 365, 'active');
  insert into public.vehicles (id, fleet_id, registration_number, make, model, vehicle_type, status,
    test_due_at, insurance_due_at, registration_due_at, is_demo)
    values
      (v1, f1, 'CI-TEST-001', 'Test', 'Truck', 'truck', 'available',
        current_date + 365, current_date + 365, current_date + 365, false),
      (v1b, f1, 'CI-TEST-002', 'Test', 'Truck', 'truck', 'available',
        current_date + 365, current_date + 365, current_date + 365, false);
  insert into public.drivers (id, fleet_id, full_name, license_expires_at, status)
    values (d1b, f1, 'CI Second Driver', current_date + 365, 'active');
  insert into public.tasks (id, fleet_id, title, pickup_address, delivery_address,
    assigned_driver_id, assigned_vehicle_id, status, created_by)
    values (t1, f1, 'CI end-to-end test task', 'Test origin', 'Test destination',
      d1, v1, 'assigned', u1);

  v_trip_id := public.start_trip_with_inspection(
    f1, t1, d1, v1, 'Test origin', 'Test destination', good_checklist
  );
  if v_trip_id is null then raise exception 'Lifecycle test: trip was not created'; end if;

  -- A manager's direct table update must not deactivate a driver during an active trip.
  execute 'set local role authenticated';
  begin
    update public.drivers set status = 'off_duty' where id = d1 and fleet_id = f1;
    set constraints all immediate;
    raise exception 'Active-trip driver deactivation unexpectedly succeeded';
  exception when check_violation then
    driver_deactivation_blocked := true;
  end;
  execute 'reset role';
  execute 'set constraints all deferred';
  if not driver_deactivation_blocked then
    raise exception 'Database trigger did not reject driver deactivation during an active trip';
  end if;
  insert into pg_temp.trucksafe_e2e_results values
    ('driver cannot go off duty during active trip', 'PASS',
     'Database trigger rejected the direct status update');
  if (select status from public.drivers where id = d1) <> 'active' then
    raise exception 'Driver status changed while a trip was active';
  end if;

  -- Deferred constraint must reject a manager making an active-trip vehicle available.
  execute 'set local role authenticated';
  begin
    update public.vehicles set status = 'available' where id = v1 and fleet_id = f1;
    set constraints all immediate;
    raise exception 'Active-trip vehicle was incorrectly marked available';
  exception when check_violation then
    vehicle_available_blocked := true;
  end;
  execute 'reset role';
  execute 'set constraints all deferred';
  if not vehicle_available_blocked then
    raise exception 'Vehicle status guard did not block availability during an active trip';
  end if;
  insert into pg_temp.trucksafe_e2e_results values
    ('active-trip vehicle cannot become available', 'PASS',
     'Deferred database constraint rejected the inconsistent status');

  -- Each partial unique index must independently reject a second active assignment.
  begin
    insert into public.trips (fleet_id, driver_id, vehicle_id, status)
    values (f1, d1, v1b, 'active');
    raise exception 'Active-driver uniqueness test unexpectedly accepted a duplicate';
  exception when unique_violation then
    insert into pg_temp.trucksafe_e2e_results values
      ('one active trip per driver', 'PASS', 'Second active trip for the same driver was rejected');
  end;

  begin
    insert into public.trips (fleet_id, driver_id, vehicle_id, status)
    values (f1, d1b, v1, 'active');
    raise exception 'Active-vehicle uniqueness test unexpectedly accepted a duplicate';
  exception when unique_violation then
    insert into pg_temp.trucksafe_e2e_results values
      ('one active trip per vehicle', 'PASS', 'Second active trip for the same vehicle was rejected');
  end;

  begin
    insert into public.trips (fleet_id, task_id, driver_id, vehicle_id, status)
    values (f1, t1, d1b, v1b, 'active');
    raise exception 'Active-task uniqueness test unexpectedly accepted a duplicate';
  exception when unique_violation then
    insert into pg_temp.trucksafe_e2e_results values
      ('one active trip per task', 'PASS', 'Second active trip for the same task was rejected');
  end;

  -- Verify the authenticated fleet owner cannot cancel or reassign an in-progress task.
  execute 'set local role authenticated';
  update public.tasks set status = 'cancelled' where id = t1;
  get diagnostics affected_rows = row_count;
  if affected_rows <> 0 then
    raise exception 'Active-trip task cancellation unexpectedly changed a row';
  end if;
  update public.tasks set assigned_driver_id = d1b, assigned_vehicle_id = v1b where id = t1;
  get diagnostics affected_rows = row_count;
  if affected_rows <> 0 then
    raise exception 'Active-trip task reassignment unexpectedly changed a row';
  end if;
  execute 'reset role';

  if (select status from public.tasks where id = t1) <> 'in_progress'
     or (select assigned_driver_id from public.tasks where id = t1) <> d1
     or (select assigned_vehicle_id from public.tasks where id = t1) <> v1 then
    raise exception 'Active-trip task mutation protection did not preserve the assignment';
  end if;
  insert into pg_temp.trucksafe_e2e_results values
    ('active task cannot be cancelled or reassigned', 'PASS',
     'RLS blocks cancellation and reassignment while a trip is active');

  perform public.finish_trip(f1, v_trip_id);

  if (select status from public.trips where id = v_trip_id) <> 'completed'
     or (select status from public.tasks where id = t1) <> 'completed'
     or (select status from public.vehicles where id = v1) <> 'available'
     or not exists (select 1 from public.inspections where v_trip_id = v_trip_id and passed = true) then
    raise exception 'Lifecycle test: trip/task/vehicle/inspection final state is incorrect';
  end if;
  insert into pg_temp.trucksafe_e2e_results values
    ('task → assigned driver/vehicle → inspection → trip completion', 'PASS',
     'Trip and task completed; vehicle returned to available; pre-trip inspection passed');

  -- A driver may start another trip after the previous trip has completed.
  insert into public.tasks (id, fleet_id, title, pickup_address, delivery_address,
    assigned_driver_id, assigned_vehicle_id, status, created_by)
    values (t1b, f1, 'CI second trip after completion', 'Test origin', 'Test destination',
      d1, v1, 'assigned', u1);
  v_trip_id := public.start_trip_with_inspection(
    f1, t1b, d1, v1, 'Test origin', 'Test destination', good_checklist
  );
  if v_trip_id is null
     or (select status from public.vehicles where id = v1) <> 'on_trip' then
    raise exception 'Driver could not start a new trip after the previous trip completed';
  end if;
  perform public.finish_trip(f1, v_trip_id);
  if (select status from public.trips where id = v_trip_id) <> 'completed'
     or (select status from public.vehicles where id = v1) <> 'available' then
    raise exception 'Second trip did not complete cleanly';
  end if;
  insert into pg_temp.trucksafe_e2e_results values
    ('driver may start a new trip after completion', 'PASS',
     'Completed trip released the driver and vehicle for a subsequent trip');

  -- Once the trip is complete, an off-duty driver must be rejected by the RPC.
  insert into public.tasks (id, fleet_id, title, pickup_address, delivery_address,
    assigned_driver_id, assigned_vehicle_id, status, created_by)
    values (t1c, f1, 'CI off-duty driver rejection task', 'Test origin', 'Test destination',
      d1, v1, 'assigned', u1);
  update public.drivers set status = 'off_duty' where id = d1 and fleet_id = f1;
  begin
    v_trip_id := public.start_trip_with_inspection(
      f1, t1c, d1, v1, 'Test origin', 'Test destination', good_checklist
    );
  exception when others then
    if sqlerrm not like 'הנהג אינו פעיל או שאינו שייך לצי%' then
      raise;
    end if;
    off_duty_start_blocked := true;
  end;
  if not off_duty_start_blocked then
    raise exception 'Off-duty driver was unexpectedly allowed to start a trip';
  end if;
  insert into pg_temp.trucksafe_e2e_results values
    ('off-duty driver cannot start a trip', 'PASS',
     'start_trip_with_inspection rejected the off-duty driver');

  -- A vehicle cannot be marked on_trip after its last active trip has completed.
  execute 'set local role authenticated';
  begin
    update public.vehicles set status = 'on_trip' where id = v1 and fleet_id = f1;
    set constraints all immediate;
    raise exception 'Vehicle was incorrectly marked on_trip without an active trip';
  exception when check_violation then
    vehicle_on_trip_without_trip_blocked := true;
  end;
  execute 'reset role';
  execute 'set constraints all deferred';
  if not vehicle_on_trip_without_trip_blocked then
    raise exception 'Vehicle status guard allowed on_trip without an active trip';
  end if;
  insert into pg_temp.trucksafe_e2e_results values
    ('vehicle cannot be on_trip without active trip', 'PASS',
     'Deferred database constraint rejected the inconsistent status');

  -- Failed checklist must create an incident and must not open a trip.
  perform set_config('request.jwt.claim.sub', u2::text, true);
  insert into public.fleets (id, name, owner_user_id) values (f2, 'CI safety test fleet', u2);
  insert into public.drivers (id, fleet_id, full_name, license_expires_at, status) values
    (d2a, f2, 'CI Defect Driver', current_date + 365, 'active'),
    (d2b, f2, 'CI Expired License Driver', current_date - 1, 'active'),
    (d2c, f2, 'CI Valid Driver', current_date + 365, 'active');
  insert into public.vehicles (id, fleet_id, registration_number, vehicle_type, status,
    test_due_at, insurance_due_at, registration_due_at, is_demo) values
    (v2a, f2, 'CI-SAFE-001', 'truck', 'available', current_date + 365, current_date + 365, current_date + 365, false),
    (v2b, f2, 'CI-SAFE-002', 'truck', 'available', current_date + 365, current_date + 365, current_date + 365, false),
    (v2c, f2, 'CI-SAFE-003', 'truck', 'available', current_date - 1, current_date + 365, current_date + 365, false);
  insert into public.tasks (id, fleet_id, title, assigned_driver_id, assigned_vehicle_id, status, created_by) values
    (t2a, f2, 'CI failed inspection', d2a, v2a, 'assigned', u2),
    (t2b, f2, 'CI expired license', d2b, v2b, 'assigned', u2),
    (t2c, f2, 'CI expired vehicle docs', d2c, v2c, 'assigned', u2);

  v_trip_id := public.start_trip_with_inspection(f2, t2a, d2a, v2a, 'A', 'B', failed_checklist);
  if v_trip_id is not null
     or exists (select 1 from public.trips where task_id = t2a)
     or not exists (select 1 from public.inspections where vehicle_id = v2a and passed = false)
     or not exists (select 1 from public.incidents where vehicle_id = v2a and status in ('open','investigating')) then
    raise exception 'Failed checklist test: safety block did not behave as expected';
  end if;
  insert into pg_temp.trucksafe_e2e_results values
    ('failed pre-trip checklist', 'PASS', 'Defect and incident recorded; no trip opened');

  begin
    perform public.start_trip_with_inspection(f2, t2b, d2b, v2b, 'A', 'B', good_checklist);
    raise exception 'Expired driver test unexpectedly opened a trip';
  exception when others then
    get stacked diagnostics msg = message_text;
    if msg ilike '%פג תוקף%' then
      insert into pg_temp.trucksafe_e2e_results values ('expired driver license', 'PASS', msg);
    else
      raise;
    end if;
  end;

  begin
    perform public.start_trip_with_inspection(f2, t2c, d2c, v2c, 'A', 'B', good_checklist);
    raise exception 'Expired vehicle document test unexpectedly opened a trip';
  exception when others then
    get stacked diagnostics msg = message_text;
    if msg ilike '%פג תוקף%' then
      insert into pg_temp.trucksafe_e2e_results values ('expired vehicle documents', 'PASS', msg);
    else
      raise;
    end if;
  end;
  -- Test the table CHECK constraints independently of the separate verification
  -- authority trigger. Disable only that trigger inside this rollback-only test
  -- transaction; it is re-enabled before the transaction ends.
  alter table public.road_restrictions disable trigger road_restrictions_guard_verification;

  begin
    insert into public.road_restrictions (
      fleet_id, road_name, restriction_type, direction, max_height_m,
      is_active, country_code, verification_status, structure_id, road_segment_id,
      lane_id, passage_length_m, measured_clearance_m, measurement_date,
      measurement_accuracy_cm, measurement_method, measurement_location_note,
      measurement_document_url, verified_at, verified_by, source_name, source_url,
      source_last_checked_at, verification_note, posted_clearance_status,
      posted_clearance_m, surveyor, measurement_coverage
    ) values (
      f1, 'CI bridge missing verifier', 'height', 'forward', 4.00,
      true, 'IL', 'verified', 'CI-STRUCTURE-001', 'CI-SEGMENT-001',
      'lane-1', 15.00, 4.25, current_date,
      0.5, 'laser survey', 'CI synthetic bridge measurement location',
      'https://example.invalid/measurement.pdf', now(), null, 'CI test authority',
      'https://example.invalid/bridge', now(), 'CI synthetic evidence fixture',
      'not_posted', null, 'CI surveyor',
      '{"both_sides_measured":true,"lane_center_measured":true,"left_edge_measured":true,"right_edge_measured":true,"hanging_installations_checked":true,"passage_center_measured":false}'::jsonb
    );
    raise exception 'Verified bridge without verifier unexpectedly inserted';
  exception when check_violation then
    insert into pg_temp.trucksafe_e2e_results values
      ('verified bridge requires verifier identity', 'PASS',
       'Database CHECK rejected a verified height row with verified_by NULL');
  end;

  begin
    insert into public.road_restrictions (
      fleet_id, road_name, restriction_type, direction, max_height_m,
      is_active, country_code, verification_status, structure_id, road_segment_id,
      lane_id, passage_length_m, measured_clearance_m, measurement_date,
      measurement_accuracy_cm, measurement_method, measurement_location_note,
      measurement_document_url, verified_at, verified_by, source_name, source_url,
      source_last_checked_at, verification_note, posted_clearance_status,
      posted_clearance_m, surveyor, measurement_coverage
    ) values (
      f1, 'CI bridge future measurement', 'height', 'forward', 4.00,
      true, 'IL', 'verified', 'CI-STRUCTURE-002', 'CI-SEGMENT-002',
      'lane-1', 15.00, 4.25, current_date + 1,
      0.5, 'laser survey', 'CI synthetic bridge measurement location',
      'https://example.invalid/measurement.pdf', now(), u1, 'CI test authority',
      'https://example.invalid/bridge', now(), 'CI synthetic evidence fixture',
      'not_posted', null, 'CI surveyor',
      '{"both_sides_measured":true,"lane_center_measured":true,"left_edge_measured":true,"right_edge_measured":true,"hanging_installations_checked":true,"passage_center_measured":false}'::jsonb
    );
    raise exception 'Verified bridge with future measurement date unexpectedly inserted';
  exception when check_violation then
    insert into pg_temp.trucksafe_e2e_results values
      ('verified bridge rejects future measurement date', 'PASS',
       'Database CHECK rejected a verified height row measured after the Israel-local current date');
  end;

  begin
    insert into public.road_restrictions (
      fleet_id, road_name, restriction_type, direction, max_height_m,
      is_active, country_code, verification_status, structure_id, road_segment_id,
      lane_id, passage_length_m, measured_clearance_m, measurement_date,
      measurement_accuracy_cm, measurement_method, measurement_location_note,
      measurement_document_url, verified_at, verified_by, source_name, source_url,
      source_last_checked_at, verification_note, posted_clearance_status,
      posted_clearance_m, surveyor, measurement_coverage
    ) values (
      f1, 'CI bridge missing coverage', 'height', 'forward', 4.00,
      true, 'IL', 'verified', 'CI-STRUCTURE-003', 'CI-SEGMENT-003',
      'lane-1', 15.00, 4.25, current_date,
      0.5, 'laser survey', 'CI synthetic bridge measurement location',
      'https://example.invalid/measurement.pdf', now(), u1, 'CI test authority',
      'https://example.invalid/bridge', now(), 'CI synthetic evidence fixture',
      'not_posted', null, 'CI surveyor', null
    );
    raise exception 'Verified bridge without measurement coverage unexpectedly inserted';
  exception when check_violation then
    insert into pg_temp.trucksafe_e2e_results values
      ('verified bridge requires complete measurement coverage', 'PASS',
       'Database CHECK rejected a verified height row without measurement_coverage');
  end;

  alter table public.road_restrictions enable trigger road_restrictions_guard_verification;

end
$test$;


do $israel_midnight_boundary_test$
begin
  -- Winter UTC+2: Israeli midnight is 22:00 UTC.
  if (timestamptz '2026-11-14 21:59:59.999+00' at time zone 'Asia/Jerusalem')::date <> date '2026-11-14'
     or (timestamptz '2026-11-14 22:00:00+00' at time zone 'Asia/Jerusalem')::date <> date '2026-11-15' then
    raise exception 'Israel winter midnight boundary calculation is incorrect';
  end if;

  -- Summer UTC+3: Israeli midnight is 21:00 UTC.
  if (timestamptz '2026-07-01 20:59:59.999+00' at time zone 'Asia/Jerusalem')::date <> date '2026-07-01'
     or (timestamptz '2026-07-01 21:00:00+00' at time zone 'Asia/Jerusalem')::date <> date '2026-07-02' then
    raise exception 'Israel summer midnight boundary calculation is incorrect';
  end if;

  insert into pg_temp.trucksafe_e2e_results values
    ('Israel winter and summer midnight boundaries', 'PASS',
     'Expiry calendar date changes at midnight in Asia/Jerusalem for UTC+2 and UTC+3');
end
$israel_midnight_boundary_test$;

do $referenced_evidence_delete_behavior$
declare
  evidence_user uuid := 'f8d0f66b-52e6-4e7e-a641-5c0f2f8eaf31';
  evidence_fleet uuid := 'b4fbe3c8-1a2f-4c7a-8c6e-6f9a1b0c2d61';
  evidence_vehicle uuid := 'e2d0f66b-52e6-4e7e-a641-5c0f2f8eaf31';
  evidence_incident uuid := '11000000-0000-4000-8000-000000000061';
  evidence_equipment uuid := '22000000-0000-4000-8000-000000000061';
  registration_object uuid := '33000000-0000-4000-8000-000000000061';
  lifting_chart_object uuid := '33000000-0000-4000-8000-000000000062';
  operating_manual_object uuid := '33000000-0000-4000-8000-000000000063';
  incident_photo_object uuid := '33000000-0000-4000-8000-000000000064';
  unused_registration_object uuid := '33000000-0000-4000-8000-000000000065';
  unused_incident_photo_object uuid := '33000000-0000-4000-8000-000000000066';
  registration_path text;
  lifting_chart_path text;
  operating_manual_path text;
  incident_photo_path text;
begin
  insert into auth.users (
    id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data
  ) values (
    evidence_user,'authenticated','authenticated',
    'trucksafe-ci-evidence-guard@example.invalid','test-only-no-login',now(),
    '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb
  );

  perform set_config('request.jwt.claim.sub',evidence_user::text,true);
  perform set_config('request.jwt.claim.role','service_role',true);

  insert into public.fleets(id,name,owner_user_id)
  values(evidence_fleet,'CI evidence deletion guard fleet',evidence_user);

  insert into public.vehicles(
    id,fleet_id,registration_number,make,model,vehicle_type,status,
    test_due_at,insurance_due_at,registration_due_at,is_demo
  ) values(
    evidence_vehicle,evidence_fleet,'CI-EVIDENCE-001','Test','Truck','truck','available',
    current_date+365,current_date+365,current_date+365,false
  );

  registration_path := evidence_fleet::text || '/' || evidence_vehicle::text || '/registration.pdf';
  lifting_chart_path := evidence_fleet::text || '/' || evidence_vehicle::text || '/lifting-chart.pdf';
  operating_manual_path := evidence_fleet::text || '/' || evidence_vehicle::text || '/operating-manual.pdf';
  incident_photo_path := evidence_fleet::text || '/incidents/' || evidence_incident::text || '/photo.jpg';

  update public.vehicles
  set registration_document_path=registration_path
  where id=evidence_vehicle and fleet_id=evidence_fleet;

  insert into public.vehicle_special_equipment(
    id,fleet_id,vehicle_id,equipment_kind,
    lifting_chart_document_path,operating_manual_document_path
  ) values(
    evidence_equipment,evidence_fleet,evidence_vehicle,'crane',
    lifting_chart_path,operating_manual_path
  );

  insert into public.incidents(
    id,fleet_id,vehicle_id,incident_type,description,status,created_by,photo_path
  ) values(
    evidence_incident,evidence_fleet,evidence_vehicle,'other',
    'CI evidence reference fixture','open',evidence_user,incident_photo_path
  );

  insert into storage.objects(id,bucket_id,name,owner,metadata) values
    (registration_object,'vehicle-registrations',registration_path,evidence_user,'{}'::jsonb),
    (lifting_chart_object,'vehicle-registrations',lifting_chart_path,evidence_user,'{}'::jsonb),
    (operating_manual_object,'vehicle-registrations',operating_manual_path,evidence_user,'{}'::jsonb),
    (incident_photo_object,'incident-photos',incident_photo_path,evidence_user,'{}'::jsonb),
    (unused_registration_object,'vehicle-registrations',
      evidence_fleet::text || '/' || evidence_vehicle::text || '/unused.pdf',evidence_user,'{}'::jsonb),
    (unused_incident_photo_object,'incident-photos',
      evidence_fleet::text || '/incidents/unused.jpg',evidence_user,'{}'::jsonb);

  if not private.storage_object_is_referenced('vehicle-registrations',registration_path)
     or not private.storage_object_is_referenced('vehicle-registrations',lifting_chart_path)
     or not private.storage_object_is_referenced('vehicle-registrations',operating_manual_path)
     or not private.storage_object_is_referenced('incident-photos',incident_photo_path) then
    raise exception 'Referenced-evidence helper missed one or more document/photo reference types';
  end if;

  -- Supabase Storage forbids direct DELETE statements on storage.objects.
  -- Exercise the exact reference predicate used by Storage RLS policies instead.
  if private.storage_object_is_referenced('vehicle-registrations',registration_path) is not true
     or private.storage_object_is_referenced('vehicle-registrations',lifting_chart_path) is not true
     or private.storage_object_is_referenced('vehicle-registrations',operating_manual_path) is not true
     or private.storage_object_is_referenced('incident-photos',incident_photo_path) is not true then
    raise exception 'Referenced-evidence helper failed to protect a linked document or incident photo';
  end if;

  if private.storage_object_is_referenced(
       'vehicle-registrations',
       evidence_fleet::text || '/' || evidence_vehicle::text || '/unused.pdf'
     ) is not false
     or private.storage_object_is_referenced(
       'incident-photos',
       evidence_fleet::text || '/incidents/unused.jpg'
     ) is not false then
    raise exception 'Referenced-evidence helper incorrectly blocks an unreferenced file';
  end if;

  if not exists (
       select 1 from pg_policies
       where schemaname='storage' and tablename='objects'
         and policyname='vehicle_registrations_manager_delete'
         and cmd='DELETE'
         and lower(coalesce(qual,'')) like '%not private.storage_object_is_referenced%'
     )
     or not exists (
       select 1 from pg_policies
       where schemaname='storage' and tablename='objects'
         and policyname='incident_photos_member_delete_own'
         and cmd='DELETE'
         and lower(coalesce(qual,'')) like '%not private.storage_object_is_referenced%'
     ) then
    raise exception 'Storage DELETE policies do not deny deletion when evidence is referenced';
  end if;

  insert into pg_temp.trucksafe_e2e_results values
    ('referenced private evidence delete predicate','PASS',
     'The exact Storage RLS helper recognizes vehicle registration, lifting chart, operating manual and incident photo references');
  insert into pg_temp.trucksafe_e2e_results values
    ('unreferenced private evidence remains deletable','PASS',
     'The helper returns false for unreferenced files and both Storage DELETE policies use its negated predicate');
end
$referenced_evidence_delete_behavior$;

select scenario, outcome, detail from pg_temp.trucksafe_e2e_results order by scenario;

-- CI fixtures must never persist, even when all assertions pass.
rollback;
