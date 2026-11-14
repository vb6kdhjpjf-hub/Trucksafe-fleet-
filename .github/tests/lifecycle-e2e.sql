-- Rollback-only integration tests against the dedicated TruckSafe Fleet Test project.
-- Every fixture is synthetic and the transaction is always rolled back.
begin;

-- Apply the candidate driver-state guard transactionally for this rollback-only test.
create or replace function private.prevent_driver_deactivation_during_active_trip()
returns trigger
language plpgsql
security definer
set search_path = ''
as $guard$
begin
  if new.status is distinct from old.status
     and new.status <> 'active'
     and exists (
       select 1 from public.trips t
       where t.fleet_id = old.fleet_id
         and t.driver_id = old.id
         and t.status = 'active'
     ) then
    raise exception 'Cannot change driver status while an active trip is in progress'
      using errcode = '23514';
  end if;
  return new;
end;
$guard$;
revoke all on function private.prevent_driver_deactivation_during_active_trip()
  from public, anon, authenticated;
drop trigger if exists prevent_driver_deactivation_during_active_trip on public.drivers;
create trigger prevent_driver_deactivation_during_active_trip
before update of status on public.drivers
for each row execute function private.prevent_driver_deactivation_during_active_trip();

create temporary table trucksafe_e2e_results (
  scenario text not null,
  outcome text not null,
  detail text
) on commit drop;

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
  v_trip_id uuid;
  affected_rows integer;

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
    raise exception 'Active-trip driver deactivation unexpectedly succeeded';
  exception when check_violation then
    insert into pg_temp.trucksafe_e2e_results values
      ('driver cannot go off duty during active trip', 'PASS',
       'Database trigger rejected the direct status update');
  end;
  execute 'reset role';
  if (select status from public.drivers where id = d1) <> 'active' then
    raise exception 'Driver status changed while a trip was active';
  end if;

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
end
$test$;

select scenario, outcome, detail from pg_temp.trucksafe_e2e_results order by scenario;

-- CI fixtures must never persist, even when all assertions pass.
rollback;
