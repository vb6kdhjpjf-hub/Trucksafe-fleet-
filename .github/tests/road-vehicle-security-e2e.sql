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
  ) then
    raise exception 'Schema parity failed: vehicle registration guard trigger is missing';
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
     or not has_table_privilege('authenticated','private.truck_route_requests','SELECT')
     or not has_column_privilege('authenticated','private.truck_route_requests','user_id','INSERT') then
    raise exception 'Route quota privileges are not correctly scoped to authenticated users';
  end if;

  select count(*) into bad_tables
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;
  if bad_tables <> 0 then
    raise exception 'Security check failed: % public tables have RLS disabled', bad_tables;
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
  fleet_id uuid := 'b4fbe3c8-1a2f-4c7a-8c6e-6f9a1b0c2d51';
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
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb);

  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);

  insert into public.fleets(id,name,owner_user_id)
  values(fleet_id,'CI road and vehicle security fleet',owner_id);
  insert into public.fleet_members(fleet_id,user_id,role)
  values(fleet_id,owner_id,'owner')
  on conflict do nothing;
  insert into public.fleet_members(fleet_id,user_id,role)
  values(fleet_id,dispatcher_id,'dispatcher');

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
    test_due_at,insurance_due_at,registration_due_at,is_demo
  ) values(
    vehicle_id,fleet_id,'CI-PARITY-001','Test','Truck','truck','available',
    current_date+365,current_date+365,current_date+365,false
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

end
$behavior_tests$;

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
