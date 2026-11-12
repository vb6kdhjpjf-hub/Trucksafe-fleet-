-- Rollback-only shipment and unit-safe cargo operation tests. Test project only.
begin;
\ir ../../supabase/migrations/20261112150000_add_shipments_and_cargo_operations.sql
create temporary table shipment_test_results(scenario text primary key,outcome text not null) on commit drop;
do $test$
<<shipment_test_block>>
declare
 owner_id uuid:='a2000000-0000-4000-8000-000000000001';
 driver_user_id uuid:='a2000000-0000-4000-8000-000000000002';
 other_owner_id uuid:='a2000000-0000-4000-8000-000000000003';
 fleet_id uuid:='b2000000-0000-4000-8000-000000000001';
 other_fleet_id uuid:='b2000000-0000-4000-8000-000000000002';
 driver_id uuid:='c2000000-0000-4000-8000-000000000001';
 shipment_id uuid; stop_id uuid; result jsonb; rejected boolean; msg text;
begin
 insert into auth.users(id,aud,role,email,created_at,updated_at) values
 (owner_id,'authenticated','authenticated','shipment-owner@example.invalid',now(),now()),
 (driver_user_id,'authenticated','authenticated','shipment-driver@example.invalid',now(),now()),
 (other_owner_id,'authenticated','authenticated','shipment-other@example.invalid',now(),now());
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 insert into public.fleets(id,name,owner_user_id) values
 (fleet_id,'Shipment Test Fleet',owner_id),(other_fleet_id,'Other Shipment Test Fleet',other_owner_id);
 insert into public.fleet_members(fleet_id,user_id,role) values
 (fleet_id,owner_id,'owner'),(fleet_id,driver_user_id,'driver') on conflict do nothing;
 insert into public.drivers(id,fleet_id,user_id,full_name,license_expires_at,status)
 values(driver_id,fleet_id,driver_user_id,'Shipment Test Driver',current_date+365,'active');
 shipment_id:=public.create_shipment(
  fleet_id,'לקוח לדוגמה','PO-100','DEL-100',now()+interval '1 day',driver_id,null,'',
  '[{"description":"משטחי שתייה","unit":"pallet","planned_quantity":12},{"description":"קרטונים","unit":"carton","planned_quantity":24},{"description":"מוצר במשקל","unit":"kg","planned_quantity":125.5}]'::jsonb,
  '[{"address":"מחסן צפון","stop_type":"delivery","items":[{"line_index":0,"planned_quantity":12},{"line_index":1,"planned_quantity":24},{"line_index":2,"planned_quantity":125.5}]}]'::jsonb
 );
 select id into stop_id from public.shipment_stops where shipment_id=shipment_test_block.shipment_id;
 if (select count(*) from public.shipment_lines where shipment_id=shipment_test_block.shipment_id)<>3 then
  raise exception 'Expected pallet, carton and kg lines in one shipment';
 end if;
 insert into pg_temp.shipment_test_results values('shipment supports pallet, carton and kg quantities independently','PASS');
 perform set_config('request.jwt.claim.sub',driver_user_id::text,true);
 rejected:=false;
 begin
  perform public.create_shipment(fleet_id,'Unauthorized','X','X',now(),driver_id,null,null,
   '[{"description":"משטח","unit":"pallet","planned_quantity":1}]'::jsonb,
   '[{"address":"כתובת","items":[{"line_index":0,"planned_quantity":1}]}]'::jsonb);
 exception when others then get stacked diagnostics msg=message_text; rejected:=msg ilike '%authorized dispatcher%'; end;
 if not rejected then raise exception 'Driver was allowed to create a shipment'; end if;
 insert into pg_temp.shipment_test_results values('driver cannot create or reassign shipments','PASS');
 result:=public.record_shipment_stop_result(
  fleet_id,shipment_id,stop_id,'12000000-0000-4000-8000-000000000001'::uuid,
  (select jsonb_agg(jsonb_build_object('stop_line_id',id,'delivered_quantity',planned_quantity,
   'damaged_quantity',0,'rejected_quantity',0,'returned_quantity',0))
   from public.shipment_stop_lines where shipment_id=shipment_test_block.shipment_id and shipment_stop_lines.stop_id=shipment_test_block.stop_id),
  null);
 if result->>'stop_status'<>'completed'
  or (select status from public.shipments where id=shipment_test_block.shipment_id)<>'delivered' then
  raise exception 'Driver could not complete a full pallet/carton/weight stop';
 end if;
 insert into pg_temp.shipment_test_results values('assigned driver records quantities without a weight measurement','PASS');
 rejected:=false;
 begin
  perform public.record_shipment_stop_result(fleet_id,shipment_id,stop_id,'12000000-0000-4000-8000-000000000002'::uuid,
   (select jsonb_agg(jsonb_build_object('stop_line_id',id,'delivered_quantity',planned_quantity+1))
    from public.shipment_stop_lines where shipment_id=shipment_test_block.shipment_id and shipment_stop_lines.stop_id=shipment_test_block.stop_id),null);
 exception when others then get stacked diagnostics msg=message_text; rejected:=msg ilike '%quantities are invalid%'; end;
 if not rejected then raise exception 'Over-delivery was not rejected'; end if;
 insert into pg_temp.shipment_test_results values('over-delivery beyond the stop allocation is rejected','PASS');
 if has_table_privilege('authenticated','public.shipments','INSERT')
  or has_table_privilege('authenticated','public.shipments','UPDATE')
  or has_table_privilege('authenticated','public.shipment_lines','INSERT')
  or has_table_privilege('authenticated','public.shipment_stops','INSERT')
  or has_table_privilege('authenticated','public.shipment_stop_lines','UPDATE')
  or has_table_privilege('authenticated','public.shipment_stop_events','INSERT')
  or not has_table_privilege('authenticated','public.shipments','SELECT')
  or not has_function_privilege('authenticated','public.create_shipment(uuid,text,text,text,timestamptz,uuid,uuid,text,jsonb,jsonb)','EXECUTE')
  or not has_function_privilege('authenticated','public.record_shipment_stop_result(uuid,uuid,uuid,uuid,jsonb,text)','EXECUTE')
  or has_function_privilege('anon','public.create_shipment(uuid,text,text,text,timestamptz,uuid,uuid,text,jsonb,jsonb)','EXECUTE') then
  raise exception 'Shipment write privileges are not safely scoped';
 end if;
 insert into pg_temp.shipment_test_results values('shipment tables are read-only to browser clients and writes use authenticated RPCs','PASS');
end
$test$;
select scenario,outcome from pg_temp.shipment_test_results order by scenario;
rollback;
