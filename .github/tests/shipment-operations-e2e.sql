-- Rollback-only shipment and unit-safe cargo operation tests. Test project only.
begin;
\ir ../../supabase/migrations/20261112150000_add_shipments_and_cargo_operations.sql
\ir ../../supabase/migrations/20261112160000_add_delivery_notes_and_proof_of_delivery.sql
create temporary table shipment_test_results(scenario text primary key,outcome text not null) on commit drop;
create temporary table shipment_test_fixture(fleet_id uuid,shipment_id uuid,stop_id uuid,owner_id uuid,driver_user_id uuid) on commit drop;
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
 select id into stop_id from public.shipment_stops s where s.shipment_id=shipment_test_block.shipment_id;
 if (select count(*) from public.shipment_lines sl where sl.shipment_id=shipment_test_block.shipment_id)<>3 then
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
 rejected:=false;
 begin
  perform public.record_shipment_stop_result(fleet_id,shipment_id,stop_id,'12000000-0000-4000-8000-000000000002'::uuid,
   (select jsonb_agg(jsonb_build_object('stop_line_id',id,'delivered_quantity',planned_quantity+1))
    from public.shipment_stop_lines sl where sl.shipment_id=shipment_test_block.shipment_id and sl.stop_id=shipment_test_block.stop_id),null);
 exception when others then get stacked diagnostics msg=message_text; rejected:=msg ilike '%quantities are invalid%'; end;
 if not rejected then raise exception 'Over-delivery was not rejected'; end if;
 insert into pg_temp.shipment_test_results values('over-delivery beyond the stop allocation is rejected','PASS');
 result:=public.record_shipment_stop_result(
  fleet_id,shipment_id,stop_id,'12000000-0000-4000-8000-000000000001'::uuid,
  (select jsonb_agg(jsonb_build_object('stop_line_id',id,'delivered_quantity',planned_quantity,
   'damaged_quantity',0,'rejected_quantity',0,'returned_quantity',0))
   from public.shipment_stop_lines sl where sl.shipment_id=shipment_test_block.shipment_id and sl.stop_id=shipment_test_block.stop_id),
  null);
 if result->>'stop_status'<>'completed'
  or (select status from public.shipments where id=shipment_test_block.shipment_id)<>'delivered' then
  raise exception 'Driver could not complete a full pallet/carton/weight stop';
 end if;
 insert into pg_temp.shipment_test_results values('assigned driver records quantities without a weight measurement','PASS');

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
 insert into pg_temp.shipment_test_fixture values(fleet_id,shipment_id,stop_id,owner_id,driver_user_id);
end
$test$;

do $delivery_document_test$
declare
 f record; result jsonb; note_id uuid; note_number text; snapshot jsonb; adjustment_id uuid; rejected boolean; msg text;
begin
 select * into f from pg_temp.shipment_test_fixture;
 perform set_config('request.jwt.claim.sub',f.driver_user_id::text,true);
 rejected:=false;
 begin
  perform public.complete_delivery_document(f.fleet_id,f.shipment_id,f.stop_id,
   '13000000-0000-4000-8000-000000000001'::uuid,null,null,'{}'::text[],null,null,null,
   'signature missing',10,8,1);
 exception when others then get stacked diagnostics msg=message_text; rejected:=msg ilike '%authorized manager%'; end;
 if not rejected then raise exception 'Assigned driver was allowed to bypass recipient signature'; end if;
 insert into pg_temp.shipment_test_results values('driver cannot issue a delivery note without signature or manager exception','PASS');

 perform set_config('request.jwt.claim.sub',f.owner_id::text,true);
 perform public.update_delivery_note_settings(f.fleet_id,'חברת בדיקה בע״מ','515000000','אזור תעשייה צפון','04-0000000','ops@example.invalid','TN');
 result:=public.complete_delivery_document(f.fleet_id,f.shipment_id,f.stop_id,
  '13000000-0000-4000-8000-000000000002'::uuid,null,null,'{}'::text[],null,null,null,
  'חתימת מקבל לא זמינה; אושר על ידי מנהל',10,8,1);
 note_id:=(result->>'note_id')::uuid; note_number:=result->>'note_number';
 if note_number<>'TN-0000001' or result->>'proof_status'<>'authorized_exception' then
  raise exception 'Delivery note numbering or authorized exception state is incorrect';
 end if;
 select document_snapshot into snapshot from public.delivery_notes where id=note_id;
 if snapshot->'issuer'->>'name'<>'חברת בדיקה בע״מ'
  or snapshot->'pallet_exchange'->>'outstanding'<>'2'
  or jsonb_array_length(snapshot->'cargo_lines')<>3
  or snapshot->>'legal_notice'<>'Delivery note; not a tax invoice.' then
  raise exception 'Delivery note snapshot is missing issuer, cargo, pallet exchange or legal disclaimer';
 end if;
 insert into pg_temp.shipment_test_results values('immutable numbered delivery note snapshots include cargo and pallet exchange','PASS');

 result:=public.complete_delivery_document(f.fleet_id,f.shipment_id,f.stop_id,
  '13000000-0000-4000-8000-000000000002'::uuid,null,null,'{}'::text[],null,null,null,
  'חתימת מקבל לא זמינה; אושר על ידי מנהל',10,8,1);
 if result->>'note_id'<>note_id::text or result->>'note_number'<>note_number then
  raise exception 'Idempotent delivery note retry created a different document';
 end if;
 insert into pg_temp.shipment_test_results values('delivery document issuance is idempotent for repeated event keys','PASS');

 rejected:=false;
 begin
  perform public.complete_delivery_document(f.fleet_id,f.shipment_id,f.stop_id,
   '13000000-0000-4000-8000-000000000002'::uuid,null,null,'{}'::text[],null,null,null,
   'חתימת מקבל לא זמינה; אושר על ידי מנהל',11,8,1);
 exception when others then get stacked diagnostics msg=message_text;
  rejected:=msg ilike '%Idempotency key was already used with different delivery data%';
 end;
 if not rejected then raise exception 'Reusing a delivery event key with a changed pallet quantity was not rejected'; end if;
 insert into pg_temp.shipment_test_results values('same delivery event key rejects changed payload instead of returning another result','PASS');

 rejected:=false;
 begin update public.delivery_notes set document_snapshot='{}'::jsonb where id=note_id;
 exception when others then get stacked diagnostics msg=message_text; rejected:=msg ilike '%immutable%'; end;
 if not rejected then raise exception 'Issued delivery note snapshot was mutable'; end if;
 insert into pg_temp.shipment_test_results values('issued delivery note cannot be edited or deleted','PASS');

 adjustment_id:=public.add_delivery_note_adjustment(f.fleet_id,note_id,
  '13000000-0000-4000-8000-000000000003'::uuid,'correction','תיקון פרטי מקבל',
  '{"recipient_name":"מקבל מתוקן"}'::jsonb);
 if not exists(select 1 from public.delivery_note_adjustments where id=adjustment_id and adjustment_type='correction') then
  raise exception 'Append-only correction was not recorded';
 end if;
 insert into pg_temp.shipment_test_results values('corrections are appended separately without changing the issued snapshot','PASS');

 if public.add_delivery_note_adjustment(f.fleet_id,note_id,
  '13000000-0000-4000-8000-000000000003'::uuid,'correction','תיקון פרטי מקבל',
  '{"recipient_name":"מקבל מתוקן"}'::jsonb)<>adjustment_id then
  raise exception 'Idempotent correction retry returned a different record';
 end if;
 rejected:=false;
 begin
  perform public.add_delivery_note_adjustment(f.fleet_id,note_id,
   '13000000-0000-4000-8000-000000000003'::uuid,'correction','תיקון אחר',
   '{"recipient_name":"מישהו אחר"}'::jsonb);
 exception when others then get stacked diagnostics msg=message_text;
  rejected:=msg ilike '%Adjustment idempotency key was already used with different data%';
 end;
 if not rejected then raise exception 'Reusing an adjustment event key with changed data was not rejected'; end if;
 insert into pg_temp.shipment_test_results values('adjustment retries are idempotent and reject changed payloads','PASS');

 adjustment_id:=public.add_delivery_note_adjustment(f.fleet_id,note_id,
  '13000000-0000-4000-8000-000000000004'::uuid,'cancellation','ביטול עקב טעות בהזמנה','{}'::jsonb);
 rejected:=false;
 begin
  perform public.add_delivery_note_adjustment(f.fleet_id,note_id,
   '13000000-0000-4000-8000-000000000005'::uuid,'cancellation','ניסיון ביטול כפול','{}'::jsonb);
 exception when others then get stacked diagnostics msg=message_text; rejected:=msg ilike '%already cancelled%'; end;
 if not rejected then raise exception 'A delivery note was cancelled more than once'; end if;
 insert into pg_temp.shipment_test_results values('cancellation is recorded once and the original document remains immutable','PASS');

 if has_table_privilege('authenticated','public.delivery_notes','INSERT')
  or has_table_privilege('authenticated','public.delivery_notes','UPDATE')
  or has_table_privilege('authenticated','public.delivery_proofs','INSERT')
  or has_table_privilege('authenticated','public.delivery_note_adjustments','INSERT')
  or not has_table_privilege('authenticated','public.delivery_notes','SELECT')
  or not has_function_privilege('authenticated','public.complete_delivery_document(uuid,uuid,uuid,uuid,text,text,text[],numeric,numeric,text,text,numeric,numeric,numeric)','EXECUTE')
  or has_function_privilege('anon','public.complete_delivery_document(uuid,uuid,uuid,uuid,text,text,text[],numeric,numeric,text,text,numeric,numeric,numeric)','EXECUTE') then
  raise exception 'Delivery document privileges are not safely scoped';
 end if;
 insert into pg_temp.shipment_test_results values('delivery records are read-only to browser clients and written only by scoped RPCs','PASS');
end
$delivery_document_test$;


do $storage_policy_test$
begin
 if not exists(
  select 1 from storage.buckets
  where id='delivery-proof-private'
   and public=false
   and file_size_limit=10485760
   and allowed_mime_types = array['image/png','image/jpeg','image/webp']::text[]
 ) then
  raise exception 'Delivery proof bucket must remain private and restricted to approved image types and size';
 end if;
 if not exists(
  select 1 from pg_policies
  where schemaname='storage' and tablename='objects'
   and policyname='delivery_proof_objects_upload_scoped'
   and cmd='INSERT' and roles = array['authenticated']::name[]
   and with_check like '%delivery-proof-private%'
   and with_check like '%shipments%'
   and with_check like '%shipment_stops%'
   and with_check like '%drivers%'
   and with_check like '%has_fleet_role%'
 ) then
  raise exception 'Scoped authenticated delivery proof upload policy is missing';
 end if;
 if not exists(
  select 1 from pg_policies
  where schemaname='storage' and tablename='objects'
   and policyname='delivery_proof_objects_read_scoped'
   and cmd='SELECT' and roles = array['authenticated']::name[]
   and qual like '%delivery-proof-private%'
   and qual like '%shipments%'
   and qual like '%shipment_stops%'
   and qual like '%drivers%'
   and qual like '%has_fleet_role%'
 ) then
  raise exception 'Scoped authenticated delivery proof read policy is missing';
 end if;
 insert into pg_temp.shipment_test_results
 values('delivery proof storage is private, type-limited and protected by scoped fleet policies','PASS');
end
$storage_policy_test$;

select scenario,outcome from pg_temp.shipment_test_results order by scenario;
rollback;
