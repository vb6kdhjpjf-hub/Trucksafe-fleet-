-- Rollback-only daily work plan and measured load ledger integration tests.
-- Runs only against the dedicated TruckSafe Fleet Test project.
begin;
\ir ../../supabase/migrations/20261112140000_add_daily_work_and_load_ledger.sql

create temporary table daily_load_test_results(scenario text primary key,outcome text not null) on commit drop;

do $test$
<<test_block>>
declare
  owner_id uuid := 'a1000000-0000-4000-8000-000000000001';
  driver_user_id uuid := 'a1000000-0000-4000-8000-000000000002';
  other_owner_id uuid := 'a1000000-0000-4000-8000-000000000003';
  fleet_id uuid := 'b1000000-0000-4000-8000-000000000001';
  other_fleet_id uuid := 'b1000000-0000-4000-8000-000000000002';
  driver_id uuid := 'c1000000-0000-4000-8000-000000000001';
  vehicle_id uuid := 'd1000000-0000-4000-8000-000000000001';
  plan_id uuid := 'e1000000-0000-4000-8000-000000000001';
  created_plan_id uuid;
  created_stop_count integer;
  created_stop_id uuid;
  stop_unload uuid := 'f1000000-0000-4000-8000-000000000001';
  stop_load uuid := 'f1000000-0000-4000-8000-000000000002';
  stop_overunload uuid := 'f1000000-0000-4000-8000-000000000003';
  event_unload uuid := '11000000-0000-4000-8000-000000000001';
  event_load uuid := '11000000-0000-4000-8000-000000000002';
  result jsonb;
  msg text;
  rejected boolean;
  event_count integer;
begin
  insert into auth.users(id,aud,role,email,created_at,updated_at)
  values
    (owner_id,'authenticated','authenticated','daily-owner@example.invalid',now(),now()),
    (driver_user_id,'authenticated','authenticated','daily-driver@example.invalid',now(),now()),
    (other_owner_id,'authenticated','authenticated','daily-other-owner@example.invalid',now(),now());

  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);

  insert into public.fleets(id,name,owner_user_id)
  values(fleet_id,'Daily Load Test Fleet',owner_id),
        (other_fleet_id,'Other Daily Load Test Fleet',other_owner_id);

  insert into public.fleet_members(fleet_id,user_id,role)
  values(fleet_id,driver_user_id,'driver');

  insert into public.drivers(id,fleet_id,user_id,full_name,license_expires_at,status)
  values(driver_id,fleet_id,driver_user_id,'Daily Test Driver',current_date+365,'active');

  insert into public.vehicles(id,fleet_id,registration_number,vehicle_type,status,empty_weight_kg,gross_weight_kg,weight_per_axle_kg)
  values(vehicle_id,fleet_id,'DAILY-TEST-001','truck','available',9000,26000,10000);

  rejected := false;
  begin
    perform public.create_daily_work_plan(
      fleet_id,current_date+1,driver_id,vehicle_id,9000,26000,10000,21000,8500,now(),
      'weighbridge_ticket','WB-UNVERIFIED',
      '[{"operation_kind":"unload","address":"מרכז חלוקה","planned_quantity_kg":1000}]'::jsonb
    );
  exception when others then
    get stacked diagnostics msg = message_text;
    rejected := msg ilike '%verified%';
  end;
  if not rejected then raise exception 'An unverified vehicle was allowed into daily planning'; end if;
  insert into pg_temp.daily_load_test_results values('daily planning rejects a vehicle before registration verification','PASS');

  -- Synthetic privileged fixture update inside this rollback-only test; this is
  -- not a live Auth/service-role integration test and creates no persistent record.
  perform set_config('request.jwt.claim.role','service_role',true);
  update public.vehicles set registration_document_path=test_block.fleet_id::text||'/'||vehicle_id::text||'/registration.pdf'
    where public.vehicles.id=vehicle_id and public.vehicles.fleet_id=test_block.fleet_id;
  update public.vehicles set
    registration_verification_status='verified',
    registration_verified_at=now(),
    registration_verified_by=owner_id,
    registration_verification_note='Synthetic test fixture approval'
    where public.vehicles.id=vehicle_id and public.vehicles.fleet_id=test_block.fleet_id;
  perform set_config('request.jwt.claim.role','authenticated',true);
  rejected := false;
  begin
    perform public.create_daily_work_plan(
      fleet_id,current_date+1,driver_id,vehicle_id,8000,26000,10000,21000,8500,now(),
      'weighbridge_ticket','WB-FORGED-LIMIT',
      '[{"operation_kind":"unload","address":"מרכז חלוקה","planned_quantity_kg":1000}]'::jsonb
    );
  exception when others then
    get stacked diagnostics msg = message_text;
    rejected := msg ilike '%do not match%';
  end;
  if not rejected then raise exception 'A caller-supplied vehicle limit overrode the verified registration profile'; end if;
  insert into pg_temp.daily_load_test_results values('daily plan rejects caller-supplied limits that differ from the verified registration profile','PASS');

  created_plan_id := public.create_daily_work_plan(
    fleet_id,current_date+1,driver_id,vehicle_id,
    9000,26000,10000,21000,8500,now(),
    'weighbridge_ticket','WB-INITIAL-PLAN',
    '[{"operation_kind":"unload","address":"מרכז חלוקה א׳","planned_quantity_kg":2500},{"operation_kind":"load","address":"מרכז חלוקה ב׳","planned_quantity_kg":1500}]'::jsonb
  );
  select count(*) into created_stop_count from public.daily_work_stops where public.daily_work_stops.plan_id=created_plan_id;
  if created_stop_count <> 2
     or (select status from public.daily_work_plans where id=created_plan_id) <> 'planned' then
    raise exception 'Atomic daily plan creation did not persist its ordered stops';
  end if;
  insert into pg_temp.daily_load_test_results values('manager creates a daily plan and all ordered stops atomically with verified initial weights','PASS');

  perform set_config('request.jwt.claim.sub',driver_user_id::text,true);
  rejected := false;
  begin
    perform public.create_daily_work_plan(
      fleet_id,current_date+1,driver_id,vehicle_id,9000,26000,10000,21000,8500,now(),
      'weighbridge_ticket','WB-DRIVER-CREATE',
      '[{"operation_kind":"unload","address":"מרכז חלוקה","planned_quantity_kg":1000}]'::jsonb
    );
  exception when others then
    get stacked diagnostics msg = message_text;
    rejected := msg ilike '%Only an authorized fleet manager%';
  end;
  if not rejected then raise exception 'Assigned driver was able to create a daily work plan'; end if;
  insert into pg_temp.daily_load_test_results values('assigned driver cannot create or reassign fleet work plans','PASS');
  perform set_config('request.jwt.claim.sub',owner_id::text,true);





  insert into public.daily_work_plans(
    id,fleet_id,work_date,driver_id,vehicle_id,status,
    tare_weight_kg,registered_gross_limit_kg,registered_axle_limit_kg,
    current_gross_weight_kg,current_heaviest_axle_kg,
    measurement_at,measurement_source,measurement_reference,created_by
  ) values (
    plan_id,fleet_id,current_date,driver_id,vehicle_id,'active',
    9000,26000,10000,21000,8500,
    now(),'weighbridge_ticket','WB-DAILY-001',owner_id
  );

  insert into public.daily_work_stops(id,fleet_id,plan_id,sequence_no,operation_kind,address,planned_quantity_kg)
  values
    (stop_unload,fleet_id,plan_id,1,'unload','לקוח א׳',3000),
    (stop_load,fleet_id,plan_id,2,'load','לקוח ב׳',2000),
    (stop_overunload,fleet_id,plan_id,3,'unload','בדיקת פריקה עודפת',10000);

  perform set_config('request.jwt.claim.sub',driver_user_id::text,true);

  result := public.record_daily_load_operation(
    fleet_id,plan_id,stop_unload,event_unload,'unload',3000,18000,7200,
    now(),'certified_onboard_scale','SCALE-001',0
  );
  if (result->>'current_gross_weight_kg')::bigint <> 18000
     or (result->>'load_revision')::integer <> 1 then
    raise exception 'First unload did not update the daily load snapshot';
  end if;
  insert into pg_temp.daily_load_test_results values('driver can complete assigned unloading stop with fresh measured gross and axle loads','PASS');

  rejected := false;
  begin
    perform public.record_daily_load_operation(
      fleet_id,plan_id,stop_unload,event_unload,'unload',3000,15000,7000,
      now(),'certified_onboard_scale','SCALE-DUP',1
    );
  exception when others then
    get stacked diagnostics msg = message_text;
    rejected := msg ilike '%Duplicate%';
  end;
  if not rejected then raise exception 'Duplicate event was not rejected'; end if;
  insert into pg_temp.daily_load_test_results values('duplicate event cannot apply a load change twice','PASS');

  rejected := false;
  begin
    perform public.record_daily_load_operation(
      fleet_id,plan_id,stop_load,'11000000-0000-4000-8000-000000000003'::uuid,
      'load',1000,19000,8000,now(),'certified_onboard_scale','SCALE-STALE',0
    );
  exception when others then
    get stacked diagnostics msg = message_text;
    rejected := msg ilike '%Stale%';
  end;
  if not rejected then raise exception 'Stale revision was not rejected'; end if;
  insert into pg_temp.daily_load_test_results values('stale concurrent update is rejected','PASS');

  rejected := false;
  begin
    perform public.record_daily_load_operation(
      fleet_id,plan_id,stop_load,'11000000-0000-4000-8000-000000000004'::uuid,
      'load',1000,19000,11000,now(),'certified_onboard_scale','SCALE-AXLE',1
    );
  exception when others then
    get stacked diagnostics msg = message_text;
    rejected := msg ilike '%axle%';
  end;
  if not rejected then raise exception 'Overloaded axle reading was not rejected'; end if;
  insert into pg_temp.daily_load_test_results values('measured axle overload is rejected','PASS');

  rejected := false;
  begin
    perform public.record_daily_load_operation(
      fleet_id,plan_id,stop_overunload,'11000000-0000-4000-8000-000000000005'::uuid,
      'unload',10000,8000,4000,now(),'certified_onboard_scale','SCALE-EMPTY',1
    );
  exception when others then
    get stacked diagnostics msg = message_text;
    rejected := msg ilike '%remaining cargo%';
  end;
  if not rejected then raise exception 'Unloading below tare was not rejected'; end if;
  insert into pg_temp.daily_load_test_results values('unloading beyond remaining cargo is rejected','PASS');

  result := public.record_daily_load_operation(
    fleet_id,plan_id,stop_load,event_load,'load',2000,20000,9000,
    now(),'weighbridge_ticket','WB-DAILY-002',1
  );
  if (result->>'current_gross_weight_kg')::bigint <> 20000
     or (result->>'load_revision')::integer <> 2 then
    raise exception 'Second stop did not build on the first stop load state';
  end if;
  if (select count(*) from public.daily_load_events e where e.plan_id=test_block.plan_id) <> 2 then
    raise exception 'Expected exactly two append-only load events';
  end if;
  if (select current_gross_weight_kg from public.daily_work_plans where id=test_block.plan_id) <> 20000 then
    raise exception 'Daily load snapshot is not equal to final event state';
  end if;
  insert into pg_temp.daily_load_test_results values('multiple stops update one daily load snapshot in order','PASS');

  rejected := false;
  begin
    perform public.record_daily_load_operation(
      other_fleet_id,plan_id,stop_load,'11000000-0000-4000-8000-000000000006'::uuid,
      'load',1000,21000,9000,now(),'certified_onboard_scale','SCALE-CROSS',2
    );
  exception when others then
    get stacked diagnostics msg = message_text;
    rejected := msg ilike '%not found%';
  end;
  if not rejected then raise exception 'Cross-fleet plan access was not rejected'; end if;
  insert into pg_temp.daily_load_test_results values('daily plan cannot be accessed across fleets','PASS');

  update public.daily_work_plans set status='completed' where id=plan_id;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  result := jsonb_build_object('plan_id',public.activate_daily_work_plan(fleet_id,created_plan_id));
  if result->>'plan_id' <> created_plan_id::text then
    raise exception 'Authorized manager could not activate a verified daily plan';
  end if;
  insert into pg_temp.daily_load_test_results values('manager activation rechecks the assigned driver and verified vehicle profile','PASS');

  select id into created_stop_id from public.daily_work_stops
  where public.daily_work_stops.plan_id=created_plan_id and public.daily_work_stops.fleet_id=test_block.fleet_id order by public.daily_work_stops.sequence_no limit 1;
  perform set_config('request.jwt.claim.role','service_role',true);
  update public.vehicles set registration_verification_status='pending'
    where public.vehicles.id=vehicle_id and public.vehicles.fleet_id=test_block.fleet_id;
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub',driver_user_id::text,true);
  rejected := false;
  begin
    perform public.record_daily_load_operation(
      fleet_id,created_plan_id,created_stop_id,'11000000-0000-4000-8000-000000000099'::uuid,
      'unload',2500,18500,7200,now(),'weighbridge_ticket','WB-CHANGED-REG',0
    );
  exception when others then
    get stacked diagnostics msg = message_text;
    rejected := msg ilike '%re-verification%';
  end;
  if not rejected then raise exception 'Load update continued after vehicle registration approval was withdrawn'; end if;
  insert into pg_temp.daily_load_test_results values('active load operations fail closed when vehicle registration approval is withdrawn','PASS');

  perform set_config('request.jwt.claim.role','service_role',true);
  update public.vehicles set registration_verification_status='verified'
    where public.vehicles.id=vehicle_id and public.vehicles.fleet_id=test_block.fleet_id;
  perform set_config('request.jwt.claim.role','authenticated',true);
  result := public.record_daily_load_operation(
    fleet_id,created_plan_id,created_stop_id,'11000000-0000-4000-8000-000000000100'::uuid,
    'unload',2500,18500,7200,now(),'weighbridge_ticket','WB-PLAN-STOP-001',0
  );
  if (result->>'current_gross_weight_kg')::bigint <> 18500 then
    raise exception 'New daily plan did not accept the measured first stop';
  end if;
  insert into pg_temp.daily_load_test_results values('driver completes first stop on a newly activated daily plan','PASS');


  if has_table_privilege('authenticated','public.daily_load_events','INSERT')
     or has_table_privilege('authenticated','public.daily_load_events','UPDATE')
     or has_table_privilege('authenticated','public.daily_load_events','DELETE')
     or not has_table_privilege('authenticated','public.daily_load_events','SELECT')
     or not has_function_privilege('authenticated','public.record_daily_load_operation(uuid,uuid,uuid,uuid,text,bigint,bigint,bigint,timestamptz,text,text,integer)','EXECUTE')
     or has_function_privilege('anon','public.record_daily_load_operation(uuid,uuid,uuid,uuid,text,bigint,bigint,bigint,timestamptz,text,text,integer)','EXECUTE')
     or not has_function_privilege('authenticated','public.create_daily_work_plan(uuid,date,uuid,uuid,bigint,bigint,bigint,bigint,bigint,timestamptz,text,text,jsonb)','EXECUTE')
     or has_function_privilege('anon','public.create_daily_work_plan(uuid,date,uuid,uuid,bigint,bigint,bigint,bigint,bigint,timestamptz,text,text,jsonb)','EXECUTE')
     or not has_function_privilege('authenticated','public.activate_daily_work_plan(uuid,uuid)','EXECUTE')
     or has_function_privilege('anon','public.activate_daily_work_plan(uuid,uuid)','EXECUTE') then
    raise exception 'Daily load ledger privileges are not safely scoped';
  end if;
  insert into pg_temp.daily_load_test_results values('load event ledger is read-only to clients and writable only through RPC','PASS');
end
$test$;

select scenario,outcome from pg_temp.daily_load_test_results order by scenario;
rollback;
