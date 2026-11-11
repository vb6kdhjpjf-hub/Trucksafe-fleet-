-- Schema parity and rollback-only authorization tests for TruckSafe Fleet Test.
-- This file must run only against the dedicated test database; it creates no lasting data.
begin;

\ir ../../supabase/migrations/20261110170000_guard_vehicle_registration_insert.sql

do $schema_check$
declare
  missing_columns integer;
  bad_tables integer;
begin
  select count(*) into missing_columns
  from (values
    ('road_restrictions','country_code'),
    ('road_restrictions','start_latitude'),
    ('road_restrictions','start_longitude'),
    ('road_restrictions','end_latitude'),
    ('road_restrictions','end_longitude'),
    ('road_restrictions','location_accuracy_m'),
    ('road_restrictions','source_type'),
    ('road_restrictions','source_name'),
    ('road_restrictions','source_reference'),
    ('road_restrictions','source_updated_at'),
    ('road_restrictions','verification_notes'),
    ('road_restrictions','expires_at'),
    ('road_restrictions','radius_m'),
    ('road_restrictions','measured_clearance_m'),
    ('road_restrictions','measurement_date'),
    ('road_restrictions','measurement_accuracy_cm'),
    ('road_restrictions','measurement_method'),
    ('road_restrictions','measurement_location_note'),
    ('road_restrictions','measurement_document_url'),
    ('vehicles','empty_weight_kg'),
    ('vehicles','registration_verification_status'),
    ('vehicles','registration_document_path'),
    ('vehicles','registration_document_uploaded_at'),
    ('vehicles','registration_verified_at'),
    ('vehicles','registration_verified_by'),
    ('vehicles','registration_verification_note')
  ) expected(table_name,column_name)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema='public'
      and c.table_name=expected.table_name
      and c.column_name=expected.column_name
  );

  if missing_columns <> 0 then
    raise exception 'Schema parity failed: % required columns are missing', missing_columns;
  end if;

  if (select data_type from information_schema.columns
      where table_schema='public' and table_name='road_restrictions' and column_name='radius_m') <> 'numeric' then
    raise exception 'Schema parity failed: road_restrictions.radius_m must be numeric';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='guard_road_restriction_verification' and not p.prosecdef
  ) then
    raise exception 'Schema parity failed: road restriction guard must be SECURITY INVOKER';
  end if;

  if not exists (
    select 1 from pg_trigger t
    where t.tgrelid='public.road_restrictions'::regclass
      and t.tgname='road_restrictions_guard_verification'
      and t.tgfoid='public.guard_road_restriction_verification()'::regprocedure
      and not t.tgisinternal
  ) then
    raise exception 'Schema parity failed: road restriction guard trigger is not attached';
  end if;

  if not exists (
    select 1 from pg_trigger t
    where t.tgrelid='public.vehicles'::regclass
      and t.tgname='guard_vehicle_registration_verification'
      and not t.tgisinternal
      and (t.tgtype & 4) <> 0
      and (t.tgtype & 16) <> 0
  ) then
    raise exception 'Schema parity failed: vehicle registration guard must run on INSERT and UPDATE';
  end if;

  if to_regprocedure('public.review_vehicle_registration(uuid,text,text)') is null
     or to_regprocedure('private.review_vehicle_registration(uuid,text,text)') is null then
    raise exception 'Schema parity failed: vehicle registration review RPC is missing';
  end if;

  if (select count(*) from storage.buckets
      where id in ('incident-photos','vehicle-registrations') and public=false) <> 2 then
    raise exception 'Schema parity failed: expected two private storage buckets';
  end if;

  if (select count(*) from pg_policies
      where schemaname='storage'
        and policyname in (
          'incident_photos_member_upload','incident_photos_member_read','incident_photos_member_delete_own',
          'vehicle_registrations_manager_upload','vehicle_registrations_manager_read','vehicle_registrations_manager_delete'
        )) <> 6 then
    raise exception 'Schema parity failed: storage access policies are incomplete';
  end if;

  if to_regprocedure('public.consume_truck_route_quota()') is null
     or exists (
       select 1 from pg_proc p
       where p.oid='public.consume_truck_route_quota()'::regprocedure
         and p.prosecdef
     ) then
    raise exception 'Route quota RPC is missing or is not SECURITY INVOKER';
  end if;

  if has_function_privilege('anon','public.consume_truck_route_quota()','EXECUTE')
     or not has_function_privilege('authenticated','public.consume_truck_route_quota()','EXECUTE')
     or has_function_privilege('anon','public.start_trip_with_inspection(uuid,uuid,uuid,uuid,text,text,jsonb)','EXECUTE')
     or not has_function_privilege('authenticated','public.start_trip_with_inspection(uuid,uuid,uuid,uuid,text,text,jsonb)','EXECUTE')
     or has_function_privilege('anon','public.finish_trip(uuid,uuid)','EXECUTE')
     or not has_function_privilege('authenticated','public.finish_trip(uuid,uuid)','EXECUTE')
     or not has_table_privilege('authenticated','private.truck_route_requests','SELECT')
     or not has_column_privilege('authenticated','private.truck_route_requests','user_id','INSERT') then
    raise exception 'Route quota privileges are not correctly scoped to authenticated users';
  end if;

  select count(*) into bad_tables
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p') and not c.relrowsecurity;
  if bad_tables <> 0 then
    raise exception 'Security check failed: % public tables have RLS disabled', bad_tables;
  end if;

  -- SECURITY DEFINER routines must pin an empty search_path and must not be
  -- executable by anonymous callers. Trigger routines are included as well.
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private')
      and p.prosecdef
      and coalesce(array_position(p.proconfig, 'search_path=""'), 0) = 0
  ) then
    raise exception 'Security check failed: SECURITY DEFINER routine has no pinned empty search_path';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private')
      and p.prosecdef
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  ) then
    raise exception 'Security check failed: anonymous role can execute a SECURITY DEFINER routine';
  end if;

  -- Any future exposed view must either execute with invoker privileges or
  -- remain inaccessible to anon/authenticated roles.
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relkind in ('v','m')
      and (
        (not coalesce(c.reloptions, '{}') @> array['security_invoker=true'])
        and (has_table_privilege('anon', c.oid, 'SELECT')
          or has_table_privilege('authenticated', c.oid, 'SELECT'))
      )
  ) then
    raise exception 'Security check failed: exposed view may bypass row-level security';
  end if;
end
$schema_check$;

create temporary table road_vehicle_security_results (
  scenario text not null,
  outcome text not null,
  detail text
) on commit drop;

do $behavior_tests$
declare
  owner_id uuid := 'f8d0f66b-52e6-4e7e-a641-5c0f2f8eaf51';
  dispatcher_id uuid := 'f8d0f66b-52e6-4e7e-a641-5c0f2f8eaf52';
  driver_user_id uuid := 'f8d0f66b-52e6-4e7e-a641-5c0f2f8eaf54';
  other_owner_id uuid := 'f8d0f66b-52e6-4e7e-a641-5c0f2f8eaf55';
  fleet_id uuid := 'b4fbe3c8-1a2f-4c7a-8c6e-6f9a1b0c2d51';
  other_fleet_id uuid := 'b4fbe3c8-1a2f-4c7a-8c6e-6f9a1b0c2d52';
  driver_id uuid := 'd1d0f66b-52e6-4e7e-a641-5c0f2f8eaf54';
  task_id uuid := 'a3d0f66b-52e6-4e7e-a641-5c0f2f8eaf54';
  other_vehicle_id uuid := 'e2d0f66b-52e6-4e7e-a641-5c0f2f8eaf55';
  vehicle_id uuid := 'e2d0f66b-52e6-4e7e-a641-5c0f2f8eaf51';
  untrusted_vehicle_id uuid := 'e2d0f66b-52e6-4e7e-a641-5c0f2f8eaf53';
  restriction_id uuid;
  message_text_value text;
  status_value text;
begin
  insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
  values
    (owner_id,'authenticated','authenticated','ci-road-owner@example.invalid','test-only-no-login',now(),
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb),
    (dispatcher_id,'authenticated','authenticated','ci-road-dispatcher@example.invalid','test-only-no-login',now(),
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb),
    (driver_user_id,'authenticated','authenticated','ci-road-driver@example.invalid','test-only-no-login',now(),
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb),
    (other_owner_id,'authenticated','authenticated','ci-other-owner@example.invalid','test-only-no-login',now(),
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb);

  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);

  insert into public.fleets(id,name,owner_user_id)
  values(fleet_id,'CI road and vehicle security fleet',owner_id);
  insert into public.fleet_members(fleet_id,user_id,role)
  values(fleet_id,owner_id,'owner')
  on conflict do nothing;
  insert into public.fleet_members(fleet_id,user_id,role)
  values
    (fleet_id,dispatcher_id,'dispatcher'),
    (fleet_id,driver_user_id,'driver');

  insert into public.fleets(id,name,owner_user_id)
  values(other_fleet_id,'CI isolated second fleet',other_owner_id);
  insert into public.fleet_members(fleet_id,user_id,role)
  values(other_fleet_id,other_owner_id,'owner')
  on conflict do nothing;

  insert into public.drivers(id,fleet_id,user_id,full_name,license_expires_at,status)
  values(driver_id,fleet_id,driver_user_id,'CI Assigned Driver',current_date+365,'active');

  insert into public.vehicles(
    id,fleet_id,registration_number,make,model,vehicle_type,status,
    test_due_at,insurance_due_at,registration_due_at,is_demo
  ) values(
    other_vehicle_id,other_fleet_id,'CI-OTHER-FLEET-001','Test','Truck','truck','available',
    current_date+365,current_date+365,current_date+365,false
  );

  -- A direct INSERT must never be able to create a pre-verified vehicle.
  insert into public.vehicles(
    id,fleet_id,registration_number,make,model,vehicle_type,status,
    test_due_at,insurance_due_at,registration_due_at,is_demo,
    registration_verification_status,registration_document_path,
    registration_document_uploaded_at,registration_verified_at,
    registration_verified_by,registration_verification_note
  ) values (
    untrusted_vehicle_id,fleet_id,'CI-UNTRUSTED-001','Test','Truck','truck','available',
    current_date+365,current_date+365,current_date+365,false,
    'verified',fleet_id::text || '/' || untrusted_vehicle_id::text || '/forged.pdf',
    now(),now(),owner_id,'Forged approval submitted during vehicle creation'
  );

  if (select registration_verification_status from public.vehicles where id=untrusted_vehicle_id) <> 'unverified'
     or (select registration_document_path from public.vehicles where id=untrusted_vehicle_id) is not null
     or (select registration_document_uploaded_at from public.vehicles where id=untrusted_vehicle_id) is not null
     or (select registration_verified_at from public.vehicles where id=untrusted_vehicle_id) is not null
     or (select registration_verified_by from public.vehicles where id=untrusted_vehicle_id) is not null
     or (select registration_verification_note from public.vehicles where id=untrusted_vehicle_id) is not null then
    raise exception 'Vehicle INSERT accepted forged registration verification metadata';
  end if;
  insert into pg_temp.road_vehicle_security_results
  values('direct vehicle insert cannot forge registration approval','PASS','Insert trigger forces unverified state and clears all supplied document/approval metadata');

  -- An authorized fleet owner can verify a restriction with official evidence.
  insert into public.road_restrictions(
    fleet_id,road_name,restriction_type,latitude,longitude,country_code,
    source_type,source_name,source_url,source_reference,source_updated_at,verification_status
  ) values (
    fleet_id,'CI Road','closed',32.8,35.5,'IL',
    'official_authority','CI Official Authority','https://example.invalid/authority','CI-REF-1',now(),'unverified'
  ) returning id into restriction_id;

  update public.road_restrictions
  set verification_status='verified',
      verification_note='Reviewed official source and location evidence for this test restriction',
      source_last_checked_at=now()
  where id=restriction_id;

  select verification_status into status_value
  from public.road_restrictions where id=restriction_id;
  if status_value <> 'verified' then
    raise exception 'Owner verification was not saved';
  end if;
  insert into pg_temp.road_vehicle_security_results
  values('owner verifies official road restriction','PASS','Owner review accepted; verifier and timestamps were assigned by the database');

  -- A dispatcher cannot change facts on an already verified restriction.
  perform set_config('request.jwt.claim.sub',dispatcher_id::text,true);
  begin
    update public.road_restrictions
    set road_name='Unauthorized dispatcher edit'
    where id=restriction_id;
    raise exception 'Dispatcher unexpectedly changed a verified restriction';
  exception when others then
    get stacked diagnostics message_text_value = message_text;
    if message_text_value ilike '%Only fleet owners and fleet managers%' then
      insert into pg_temp.road_vehicle_security_results
      values('dispatcher edits verified restriction','PASS',message_text_value);
    else
      raise;
    end if;
  end;

  -- A material edit by the owner invalidates the old verification.
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  update public.road_restrictions
  set road_name='Owner corrected road name'
  where id=restriction_id;
  select verification_status into status_value
  from public.road_restrictions where id=restriction_id;
  if status_value <> 'unverified' then
    raise exception 'Owner material edit did not invalidate verification';
  end if;
  insert into pg_temp.road_vehicle_security_results
  values('owner edits verified restriction','PASS','Material change automatically reset verification to unverified');

  -- Vehicle profile changes require a fresh registration review.
  insert into public.vehicles(
    id,fleet_id,registration_number,make,model,vehicle_type,status,
    test_due_at,insurance_due_at,registration_due_at,is_demo,assigned_driver_id
  ) values(
    vehicle_id,fleet_id,'CI-PARITY-001','Test','Truck','truck','available',
    current_date+365,current_date+365,current_date+365,false,driver_id
  );

  insert into public.tasks(
    id,fleet_id,title,assigned_driver_id,assigned_vehicle_id,status,created_by
  ) values(
    task_id,fleet_id,'CI authenticated driver RPC task',driver_id,vehicle_id,'assigned',owner_id
  );

  -- Seed one private registration object so the authenticated storage policies
  -- can be exercised without leaving a real file or any persistent test data.
  insert into storage.objects(id,bucket_id,name,owner,metadata)
  values(
    'e2d0f66b-52e6-4e7e-a641-5c0f2f8eaf56',
    'vehicle-registrations',
    fleet_id::text || '/' || vehicle_id::text || '/registration.pdf',
    owner_id,
    '{}'::jsonb
  );

  update public.vehicles set height_cm=320 where id=vehicle_id;
  select registration_verification_status into status_value
  from public.vehicles where id=vehicle_id;
  if status_value <> 'pending' then
    raise exception 'Vehicle profile change did not require a fresh registration review';
  end if;
  insert into pg_temp.road_vehicle_security_results
  values('vehicle profile edit invalidates registration review','PASS','Height change set registration status to pending');

  begin
    update public.vehicles
    set registration_verification_status='verified'
    where id=vehicle_id;
    raise exception 'Direct registration approval unexpectedly succeeded';
  exception when others then
    get stacked diagnostics message_text_value = message_text;
    if message_text_value ilike '%trusted verification service%' then
      insert into pg_temp.road_vehicle_security_results
      values('direct vehicle approval','PASS',message_text_value);
    else
      raise;
    end if;
  end;

  begin
    perform public.review_vehicle_registration(vehicle_id,'verified','Reviewed registration document');
    raise exception 'Registration review unexpectedly succeeded without a document';
  exception when others then
    get stacked diagnostics message_text_value = message_text;
    if message_text_value ilike '%לא נמצא מסמך רישוי תקין%' then
      insert into pg_temp.road_vehicle_security_results
      values('registration review without uploaded document','PASS',message_text_value);
    else
      raise;
    end if;
  end;

  -- Simulate a completed trusted review, then change the vehicle's registration identity.
  -- The identity change must invalidate the prior approval and its reviewer metadata.
  update public.vehicles
  set registration_document_path='b4fbe3c8-1a2f-4c7a-8c6e-6f9a1b0c2d51/e2d0f66b-52e6-4e7e-a641-5c0f2f8eaf51/reviewed-registration.pdf',
      registration_document_uploaded_at=now(),
      registration_verification_status='pending'
  where id=vehicle_id;
  perform set_config('request.jwt.claim.role','service_role',true);
  update public.vehicles
  set registration_verification_status='verified',
      registration_verified_at=now(),
      registration_verified_by=owner_id,
      registration_verification_note='Registration identity reviewed by trusted service'
  where id=vehicle_id;
  perform set_config('request.jwt.claim.role','authenticated',true);
  update public.vehicles
  set registration_number='CI-PARITY-002'
  where id=vehicle_id;
  if (select registration_verification_status from public.vehicles where id=vehicle_id) <> 'pending'
     or (select registration_verified_at from public.vehicles where id=vehicle_id) is not null
     or (select registration_verified_by from public.vehicles where id=vehicle_id) is not null
     or (select registration_verification_note from public.vehicles where id=vehicle_id) is not null then
    raise exception 'Registration identity edit did not invalidate prior approval metadata';
  end if;
  insert into pg_temp.road_vehicle_security_results
  values('vehicle registration identity edit invalidates approval','PASS','Registration-number change reset status and cleared reviewer metadata');

end
$behavior_tests$;

-- Exercise fleet isolation and role-scoped access with the real authenticated
-- database role. These checks use synthetic users and rows inside this rollback.
select set_config('request.jwt.claim.sub','f8d0f66b-52e6-4e7e-a641-5c0f2f8eaf51',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

do $rls_owner_checks$
begin
  if (select count(*) from public.vehicles where id='e2d0f66b-52e6-4e7e-a641-5c0f2f8eaf51') <> 1 then
    raise exception 'Fleet owner cannot read own vehicle';
  end if;
  if exists(select 1 from public.vehicles where id='e2d0f66b-52e6-4e7e-a641-5c0f2f8eaf55') then
    raise exception 'Fleet owner can read a vehicle from another fleet';
  end if;
  if (select count(*) from storage.objects
      where bucket_id='vehicle-registrations'
        and name='b4fbe3c8-1a2f-4c7a-8c6e-6f9a1b0c2d51/e2d0f66b-52e6-4e7e-a641-5c0f2f8eaf51/registration.pdf') <> 1 then
    raise exception 'Fleet owner cannot read own private registration document';
  end if;
  insert into storage.objects(bucket_id,name)
  values('vehicle-registrations','b4fbe3c8-1a2f-4c7a-8c6e-6f9a1b0c2d51/e2d0f66b-52e6-4e7e-a641-5c0f2f8eaf51/manager-upload.pdf');
end
$rls_owner_checks$;
reset role;
insert into pg_temp.road_vehicle_security_results
values('fleet owner row and document isolation','PASS','Owner reads own vehicle and private registration document and can upload to own vehicle folder');

select set_config('request.jwt.claim.sub','f8d0f66b-52e6-4e7e-a641-5c0f2f8eaf52',true);
set local role authenticated;
do $rls_dispatcher_checks$
declare changed_rows integer;
begin
  if (select count(*) from public.vehicles where fleet_id='b4fbe3c8-1a2f-4c7a-8c6e-6f9a1b0c2d51') <> 2 then
    raise exception 'Dispatcher should read fleet vehicles';
  end if;
  if exists(select 1 from storage.objects
      where bucket_id='vehicle-registrations'
        and name='b4fbe3c8-1a2f-4c7a-8c6e-6f9a1b0c2d51/e2d0f66b-52e6-4e7e-a641-5c0f2f8eaf51/registration.pdf') then
    raise exception 'Dispatcher can read a private registration document';
  end if;
  begin
    insert into storage.objects(bucket_id,name)
    values('vehicle-registrations','b4fbe3c8-1a2f-4c7a-8c6e-6f9a1b0c2d51/e2d0f66b-52e6-4e7e-a641-5c0f2f8eaf51/dispatcher-upload.pdf');
    raise exception 'Dispatcher unexpectedly uploaded a private registration document';
  exception when insufficient_privilege then
    null;
  end;
  update public.vehicles set notes='unauthorized dispatcher edit'
  where id='e2d0f66b-52e6-4e7e-a641-5c0f2f8eaf51';
  get diagnostics changed_rows = row_count;
  if changed_rows <> 0 then
    raise exception 'Dispatcher unexpectedly updated a vehicle';
  end if;
  begin
    insert into public.vehicles(fleet_id,registration_number,vehicle_type,status)
    values('b4fbe3c8-1a2f-4c7a-8c6e-6f9a1b0c2d51','CI-DISPATCHER-FORGED','truck','available');
    raise exception 'Dispatcher unexpectedly inserted a vehicle';
  exception when insufficient_privilege then
    null;
  end;
end
$rls_dispatcher_checks$;
reset role;
insert into pg_temp.road_vehicle_security_results
values('dispatcher cannot mutate vehicles','PASS','Dispatcher can read fleet vehicles but cannot update or insert vehicles');

select set_config('request.jwt.claim.sub','f8d0f66b-52e6-4e7e-a641-5c0f2f8eaf54',true);
set local role authenticated;
do $rls_driver_checks$
declare changed_rows integer;
begin
  if (select count(*) from public.vehicles where fleet_id='b4fbe3c8-1a2f-4c7a-8c6e-6f9a1b0c2d51') <> 1
     or not exists(select 1 from public.vehicles where id='e2d0f66b-52e6-4e7e-a641-5c0f2f8eaf51') then
    raise exception 'Driver should see only the vehicle assigned to them';
  end if;
  if exists(select 1 from public.vehicles where id='e2d0f66b-52e6-4e7e-a641-5c0f2f8eaf53') then
    raise exception 'Driver can read an unassigned vehicle';
  end if;
  if exists(select 1 from storage.objects
      where bucket_id='vehicle-registrations'
        and name='b4fbe3c8-1a2f-4c7a-8c6e-6f9a1b0c2d51/e2d0f66b-52e6-4e7e-a641-5c0f2f8eaf51/registration.pdf') then
    raise exception 'Driver can read a private registration document';
  end if;
  begin
    insert into storage.objects(bucket_id,name)
    values('vehicle-registrations','b4fbe3c8-1a2f-4c7a-8c6e-6f9a1b0c2d51/e2d0f66b-52e6-4e7e-a641-5c0f2f8eaf51/driver-upload.pdf');
    raise exception 'Driver unexpectedly uploaded a private registration document';
  exception when insufficient_privilege then
    null;
  end;
  update public.vehicles set notes='unauthorized driver edit'
  where id='e2d0f66b-52e6-4e7e-a641-5c0f2f8eaf51';
  get diagnostics changed_rows = row_count;
  if changed_rows <> 0 then
    raise exception 'Driver unexpectedly updated an assigned vehicle';
  end if;
end
$rls_driver_checks$;
reset role;
insert into pg_temp.road_vehicle_security_results
values('driver access is assignment-scoped','PASS','Driver sees only assigned vehicle and cannot modify vehicle records');

select set_config('request.jwt.claim.sub','f8d0f66b-52e6-4e7e-a641-5c0f2f8eaf55',true);
set local role authenticated;
do $rls_other_fleet_checks$
begin
  if (select count(*) from public.vehicles where fleet_id='b4fbe3c8-1a2f-4c7a-8c6e-6f9a1b0c2d52') <> 1
     or exists(select 1 from public.vehicles where id='e2d0f66b-52e6-4e7e-a641-5c0f2f8eaf51') then
    raise exception 'Second fleet owner isolation failed';
  end if;
end
$rls_other_fleet_checks$;
reset role;
insert into pg_temp.road_vehicle_security_results
values('second fleet isolation','PASS','Second fleet owner cannot read first fleet vehicles');

-- Exercise the SECURITY DEFINER trip RPCs as an authenticated assigned driver.
-- The RPCs are intentionally callable by authenticated users, so their internal
-- fleet/driver checks must reject cross-fleet attempts and permit only the assigned driver.
select set_config('request.jwt.claim.sub','f8d0f66b-52e6-4e7e-a641-5c0f2f8eaf54',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

do $rpc_cross_fleet_check$
begin
  begin
    perform public.start_trip_with_inspection(
      'b4fbe3c8-1a2f-4c7a-8c6e-6f9a1b0c2d52',
      'a3d0f66b-52e6-4e7e-a641-5c0f2f8eaf54',
      'd1d0f66b-52e6-4e7e-a641-5c0f2f8eaf54',
      'e2d0f66b-52e6-4e7e-a641-5c0f2f8eaf51',
      'A','B','{}'::jsonb
    );
    raise exception 'Driver unexpectedly started a trip in another fleet';
  exception when others then
    if sqlerrm not ilike '%רק חבר צי פעיל%' then
      raise;
    end if;
  end;
end
$rpc_cross_fleet_check$;

select set_config(
  'trucksafe.test_driver_trip_id',
  public.start_trip_with_inspection(
    'b4fbe3c8-1a2f-4c7a-8c6e-6f9a1b0c2d51',
    'a3d0f66b-52e6-4e7e-a641-5c0f2f8eaf54',
    'd1d0f66b-52e6-4e7e-a641-5c0f2f8eaf54',
    'e2d0f66b-52e6-4e7e-a641-5c0f2f8eaf51',
    'CI origin','CI destination',
    jsonb_build_object(
      'צמיגים ולחץ אוויר תקינים',true,
      'בלמים ובלם חניה תקינים',true,
      'אורות, איתותים וצופר תקינים',true,
      'מראות, שמשות ומגבים תקינים',true,
      'אין נזילות או נזק גלוי',true,
      'המטען מאובטח והמשקל מתאים',true,
      'מסמכי רכב ורישיון נהיגה בתוקף',true
    )
  )::text,
  true
);
select public.finish_trip(
  'b4fbe3c8-1a2f-4c7a-8c6e-6f9a1b0c2d51',
  current_setting('trucksafe.test_driver_trip_id')::uuid
);
reset role;
insert into pg_temp.road_vehicle_security_results
values('authenticated driver trip RPC','PASS','Assigned driver starts and finishes own trip; cross-fleet start is rejected');

-- Exercise the RPC with the real authenticated database role, not the postgres
-- owner used to create rollback-only fixtures. This verifies grants and RLS.
select set_config('request.jwt.claim.sub','f8d0f66b-52e6-4e7e-a641-5c0f2f8eaf51',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select set_config(
  'trucksafe.test_quota_count',
  (
    select count(*) filter (where allowed)::text
    from (
      select public.consume_truck_route_quota() as allowed
      from generate_series(1,11)
    ) quota_calls
  ),
  true
);
reset role;

do $quota_assert$
begin
  if current_setting('trucksafe.test_quota_count')::integer <> 10 then
    raise exception 'Route quota expected 10 accepted requests, got %',
      current_setting('trucksafe.test_quota_count');
  end if;
end
$quota_assert$;

insert into pg_temp.road_vehicle_security_results
values('route quota under authenticated role','PASS','10 requests accepted; request 11 blocked');

select scenario,outcome,detail
from pg_temp.road_vehicle_security_results
order by scenario;

rollback;
