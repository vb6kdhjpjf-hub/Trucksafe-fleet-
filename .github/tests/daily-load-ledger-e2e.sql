-- Rollback-only daily work plan and measured load ledger integration tests.
-- Runs only against the dedicated TruckSafe Fleet Test project.
begin;
\ir ../../supabase/migrations/20261112140000_add_daily_work_and_load_ledger.sql

create temporary table daily_load_test_results(scenario text primary key,outcome text not null) on commit drop;

do $test$
declare
  owner_id uuid := 'a1000000-0000-4000-8000-000000000001';
  driver_user_id uuid := 'a1000000-0000-4000-8000-000000000002';
  other_owner_id uuid := 'a1000000-0000-4000-8000-000000000003';
  fleet_id uuid := 'b1000000-0000-4000-8000-000000000001';
  other_fleet_id uuid := 'b1000000-0000-4000-8000-000000000002';
  driver_id uuid := 'c1000000-0000-4000-8000-000000000001';
  vehicle_id uuid := 'd1000000-0000-4000-8000-000000000001';
  plan_id uuid := 'e1000000-0000-4000-8000-000000000001';
  stop_unload uuid := 'f1000000-0000-4000-8000-000000000001';
  stop_load uuid := 'f1000000-0000-4000-8000-000000000002';
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

  insert into public.vehicles(id,fleet_id,registration_number,vehicle_type,status)
  values(vehicle_id,fleet_id,'DAILY-TEST-001','truck','available');

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
    (stop_load,fleet_id,plan_id,2,'load','לקוח ב׳',2000);

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
      fleet_id,plan_id,stop_load,'11000000-0000-4000-8000-000000000005'::uuid,
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
  if (select count(*) from public.daily_load_events where plan_id=plan_id) <> 2 then
    raise exception 'Expected exactly two append-only load events';
  end if;
  if (select current_gross_weight_kg from public.daily_work_plans where id=plan_id) <> 20000 then
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

  if has_table_privilege('authenticated','public.daily_load_events','INSERT')
     or has_table_privilege('authenticated','public.daily_load_events','UPDATE')
     or has_table_privilege('authenticated','public.daily_load_events','DELETE')
     or not has_table_privilege('authenticated','public.daily_load_events','SELECT')
     or not has_function_privilege('authenticated','public.record_daily_load_operation(uuid,uuid,uuid,uuid,text,bigint,bigint,bigint,timestamptz,text,text,integer)','EXECUTE')
     or has_function_privilege('anon','public.record_daily_load_operation(uuid,uuid,uuid,uuid,text,bigint,bigint,bigint,timestamptz,text,text,integer)','EXECUTE') then
    raise exception 'Daily load ledger privileges are not safely scoped';
  end if;
  insert into pg_temp.daily_load_test_results values('load event ledger is read-only to clients and writable only through RPC','PASS');
end
$test$;

select scenario,outcome from pg_temp.daily_load_test_results order by scenario;
rollback;
