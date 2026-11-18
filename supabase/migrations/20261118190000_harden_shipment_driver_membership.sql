-- Require an active, current fleet-member driver for shipment visibility and execution.
create or replace function private.is_active_assigned_fleet_driver(p_fleet_id uuid,p_driver_id uuid)
returns boolean language sql stable security definer set search_path=''
as $function$
 select exists(
  select 1 from public.drivers d
  join public.fleet_members fm on fm.fleet_id=d.fleet_id and fm.user_id=d.user_id and fm.role='driver'
  where d.id=p_driver_id and d.fleet_id=p_fleet_id
   and d.user_id=(select auth.uid()) and d.status='active'
 );
$function$;
revoke all on function private.is_active_assigned_fleet_driver(uuid,uuid) from public,anon;
grant execute on function private.is_active_assigned_fleet_driver(uuid,uuid) to authenticated;

create or replace function public.record_shipment_stop_result(
 p_fleet_id uuid,p_shipment_id uuid,p_stop_id uuid,p_event_key uuid,p_results jsonb,p_exception_reason text
)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
 v_actor uuid:=auth.uid();
 v_shipment public.shipments%rowtype; v_stop public.shipment_stops%rowtype; v_line public.shipment_stop_lines%rowtype;
 v_result jsonb; v_seen uuid[]:=array[]::uuid[]; v_line_id uuid;
 v_delivered numeric(14,3); v_damaged numeric(14,3); v_rejected numeric(14,3); v_returned numeric(14,3);
 v_has_shortage boolean:=false; v_next_status text; v_any_partial boolean; v_pending boolean; v_count integer:=0;
begin
 if v_actor is null then raise exception 'Authentication required'; end if;
 if p_event_key is null or p_fleet_id is null or p_shipment_id is null or p_stop_id is null then raise exception 'Missing shipment stop identifiers'; end if;
 if p_results is null or jsonb_typeof(p_results)<>'array' then raise exception 'Stop results must be an array'; end if;
 select s.* into v_shipment from public.shipments s where s.id=p_shipment_id and s.fleet_id=p_fleet_id for update;
 if not found or v_shipment.status in ('cancelled','delivered') then raise exception 'Shipment is not available for stop completion'; end if;
 if not private.has_fleet_role(p_fleet_id,array['owner','fleet_manager','dispatcher']::text[])
  and not private.is_active_assigned_fleet_driver(p_fleet_id,v_shipment.assigned_driver_id) then
  raise exception 'Only the assigned driver or an authorized dispatcher may complete this stop';
 end if;
 if exists(select 1 from public.shipment_stop_events e where e.shipment_id=p_shipment_id and e.event_key=p_event_key) then raise exception 'Duplicate shipment stop event'; end if;
 select s.* into v_stop from public.shipment_stops s where s.id=p_stop_id and s.shipment_id=p_shipment_id and s.fleet_id=p_fleet_id for update;
 if not found or v_stop.status not in ('pending','in_progress') then raise exception 'Shipment stop is not pending'; end if;
 select count(*) into v_count from public.shipment_stop_lines sl where sl.stop_id=p_stop_id and sl.shipment_id=p_shipment_id and sl.fleet_id=p_fleet_id;
 if v_count=0 or jsonb_array_length(p_results)<>v_count then raise exception 'A result is required for every planned cargo line at this stop'; end if;
 for v_result in select value from jsonb_array_elements(p_results) loop
  begin
   v_line_id:=(v_result->>'stop_line_id')::uuid;
   v_delivered:=coalesce((v_result->>'delivered_quantity')::numeric,0);
   v_damaged:=coalesce((v_result->>'damaged_quantity')::numeric,0);
   v_rejected:=coalesce((v_result->>'rejected_quantity')::numeric,0);
   v_returned:=coalesce((v_result->>'returned_quantity')::numeric,0);
  exception when others then raise exception 'Stop result contains an invalid line or quantity'; end;
  if v_line_id is null or v_line_id=any(v_seen) then raise exception 'Stop result contains a missing or duplicate line'; end if;
  v_seen:=array_append(v_seen,v_line_id);
  select sl.* into v_line from public.shipment_stop_lines sl
   where sl.id=v_line_id and sl.stop_id=p_stop_id and sl.shipment_id=p_shipment_id and sl.fleet_id=p_fleet_id for update;
  if not found then raise exception 'Stop result references a line outside this stop'; end if;
  if least(v_delivered,v_damaged,v_rejected,v_returned)<0
   or greatest(v_delivered,v_damaged,v_rejected,v_returned)<>round(greatest(v_delivered,v_damaged,v_rejected,v_returned),3)
   or v_delivered+v_damaged+v_rejected>v_line.planned_quantity or v_returned>v_delivered then
   raise exception 'Stop result quantities are invalid or exceed the planned amount';
  end if;
  if v_delivered+v_damaged+v_rejected<v_line.planned_quantity then v_has_shortage:=true; end if;
  update public.shipment_stop_lines set delivered_quantity=v_delivered,damaged_quantity=v_damaged,
   rejected_quantity=v_rejected,returned_quantity=v_returned,updated_at=now()
   where id=v_line_id and fleet_id=p_fleet_id;
 end loop;
 if v_has_shortage and length(btrim(coalesce(p_exception_reason,'')))=0 then
  raise exception 'A reason is required for a short, damaged or rejected delivery';
 end if;
 v_next_status:=case when v_has_shortage then 'partially_completed' else 'completed' end;
 update public.shipment_stops set status=v_next_status,completed_at=now(),
  exception_reason=nullif(btrim(coalesce(p_exception_reason,'')),''),updated_at=now()
  where id=p_stop_id and fleet_id=p_fleet_id;
 insert into public.shipment_stop_events(fleet_id,shipment_id,stop_id,event_key,event_type,payload,performed_by)
 values(p_fleet_id,p_shipment_id,p_stop_id,p_event_key,'stop_result_recorded',
  jsonb_build_object('results',p_results,'exception_reason',nullif(btrim(coalesce(p_exception_reason,'')),''),'status',v_next_status),v_actor);
 select exists(select 1 from public.shipment_stops s where s.shipment_id=p_shipment_id and s.fleet_id=p_fleet_id and s.status='partially_completed') into v_any_partial;
 select exists(select 1 from public.shipment_stops s where s.shipment_id=p_shipment_id and s.fleet_id=p_fleet_id and s.status in ('pending','in_progress')) into v_pending;
 update public.shipments set status=case
  when not v_pending and (v_any_partial or v_next_status='partially_completed') then 'partially_delivered'
  when not v_pending then 'delivered'
  when v_any_partial or v_next_status='partially_completed' then 'partially_delivered'
  else 'in_transit' end,updated_at=now()
 where id=p_shipment_id and fleet_id=p_fleet_id;
 return jsonb_build_object('shipment_id',p_shipment_id,'stop_id',p_stop_id,'stop_status',v_next_status);
end;
$function$;

create or replace function public.complete_delivery_document(
 p_fleet_id uuid,p_shipment_id uuid,p_stop_id uuid,p_event_key uuid,
 p_recipient_name text,p_signature_object_path text,p_photo_object_paths text[],
 p_gps_latitude numeric,p_gps_longitude numeric,p_recipient_note text,
 p_exception_reason text,p_pallets_delivered numeric,p_pallets_received numeric,p_pallets_damaged numeric
)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
 v_actor uuid:=auth.uid();
 v_is_manager boolean;
 v_can_override boolean;
 v_shipment public.shipments%rowtype;
 v_stop public.shipment_stops%rowtype;
 v_settings public.delivery_note_settings%rowtype;
 v_fleet_name text;
 v_prefix text;
 v_number bigint;
 v_note_number text;
 v_proof_id uuid;
 v_note_id uuid;
 v_now timestamptz:=now();
 v_object_prefix text;
 v_photo text;
 v_lines jsonb;
 v_snapshot jsonb;
 v_existing jsonb;
 v_existing_matches boolean;
 v_photos text[]:=coalesce(p_photo_object_paths,'{}'::text[]);
begin
 if v_actor is null then raise exception 'Authentication required'; end if;
 if p_event_key is null or p_fleet_id is null or p_shipment_id is null or p_stop_id is null then
  raise exception 'Missing delivery document identifiers';
 end if;
  if (p_gps_latitude is null) <> (p_gps_longitude is null)
  or (p_gps_latitude is not null and (p_gps_latitude not between -90 and 90 or p_gps_longitude not between -180 and 180)) then
  raise exception 'GPS coordinates must be supplied as a valid pair';
 end if;
 if p_gps_latitude is not null then
  -- Match NUMERIC(9,6) storage precision before snapshotting and comparing
  -- idempotent retries, even when a caller supplies higher precision.
  p_gps_latitude:=round(p_gps_latitude,6);
  p_gps_longitude:=round(p_gps_longitude,6);
 end if;
 v_is_manager:=private.has_fleet_role(p_fleet_id,array['owner','fleet_manager','dispatcher']::text[]);
 v_can_override:=private.has_fleet_role(p_fleet_id,array['owner','fleet_manager']::text[]);
 select s.* into v_shipment from public.shipments s
 where s.id=p_shipment_id and s.fleet_id=p_fleet_id for update;
 if not found or v_shipment.status='cancelled' then raise exception 'Shipment is unavailable'; end if;
 if not v_is_manager and not private.is_active_assigned_fleet_driver(p_fleet_id,v_shipment.assigned_driver_id) then
  raise exception 'Only the active assigned fleet driver or an authorized dispatcher may record delivery proof';
 end if;
 select jsonb_build_object('note_id',n.id,'note_number',n.note_number,'proof_status',p.proof_status),
  p.performed_by=v_actor
  and p.recipient_name is not distinct from nullif(btrim(coalesce(p_recipient_name,'')),'')
  and p.signature_object_path is not distinct from p_signature_object_path
  and p.photo_object_paths is not distinct from v_photos
  and p.gps_latitude is not distinct from p_gps_latitude
  and p.gps_longitude is not distinct from p_gps_longitude
  and p.recipient_note is not distinct from nullif(btrim(coalesce(p_recipient_note,'')),'')
  and p.exception_reason is not distinct from nullif(btrim(coalesce(p_exception_reason,'')),'')
  and p.pallets_delivered=coalesce(p_pallets_delivered,0)
  and p.pallets_received=coalesce(p_pallets_received,0)
  and p.pallets_damaged=coalesce(p_pallets_damaged,0)
 into v_existing,v_existing_matches
 from public.delivery_notes n join public.delivery_proofs p on p.id=n.proof_id and p.fleet_id=n.fleet_id
 where n.shipment_id=p_shipment_id and p.event_key=p_event_key;
 if v_existing is not null then
  if not coalesce(v_existing_matches,false) then
   raise exception 'Idempotency key was already used with different delivery data';
  end if;
  return v_existing;
 end if;
 select st.* into v_stop from public.shipment_stops st
 where st.id=p_stop_id and st.shipment_id=p_shipment_id and st.fleet_id=p_fleet_id for update;
 if not found or v_stop.status not in ('completed','partially_completed') then
  raise exception 'The stop must be completed before issuing a delivery note';
 end if;
 if exists(select 1 from public.delivery_notes n where n.fleet_id=p_fleet_id and n.stop_id=p_stop_id)
  or exists(select 1 from public.delivery_proofs p where p.fleet_id=p_fleet_id and p.stop_id=p_stop_id) then
  raise exception 'A delivery document already exists for this stop';
 end if;

 if least(coalesce(p_pallets_delivered,0),coalesce(p_pallets_received,0),coalesce(p_pallets_damaged,0))<0
  or coalesce(p_pallets_damaged,0)>coalesce(p_pallets_received,0) then
  raise exception 'Invalid pallet exchange quantities';
 end if;
 v_object_prefix:=p_fleet_id::text||'/'||p_shipment_id::text||'/'||p_stop_id::text||'/';
 if p_signature_object_path is not null then
  if p_recipient_name is null or length(btrim(p_recipient_name)) not between 1 and 160
   or left(p_signature_object_path,length(v_object_prefix))<>v_object_prefix
   or p_signature_object_path like '%..%' or not exists(
    select 1 from storage.objects o where o.bucket_id='delivery-proof-private' and o.name=p_signature_object_path
   ) then raise exception 'A valid uploaded signature and recipient name are required'; end if;
  if nullif(btrim(coalesce(p_exception_reason,'')),'') is not null then
   raise exception 'Do not combine a signature with a missing-signature exception';
  end if;
 else
  if not v_can_override or length(btrim(coalesce(p_exception_reason,'')))<5 then
   raise exception 'A recipient signature is required unless an authorized manager records a documented exception';
  end if;
 end if;
 if cardinality(v_photos)>8 then raise exception 'No more than eight delivery photos may be attached'; end if;
 foreach v_photo in array v_photos loop
  if v_photo is null or left(v_photo,length(v_object_prefix))<>v_object_prefix or v_photo like '%..%'
   or not exists(select 1 from storage.objects o where o.bucket_id='delivery-proof-private' and o.name=v_photo) then
   raise exception 'A delivery photo is missing or outside this shipment stop';
  end if;
 end loop;

 insert into public.delivery_note_settings(fleet_id,issuer_name,number_prefix)
 select p_fleet_id,f.name,'DL' from public.fleets f where f.id=p_fleet_id
 on conflict(fleet_id) do nothing;
 select ds.* into v_settings from public.delivery_note_settings ds where ds.fleet_id=p_fleet_id for update;
 if not found then raise exception 'Delivery note issuer settings are unavailable'; end if;
 update public.delivery_note_settings set next_number=next_number+1,updated_at=v_now
 where fleet_id=p_fleet_id returning next_number-1 into v_number;
 v_note_number:=v_settings.number_prefix||'-'||lpad(v_number::text,7,'0');

 insert into public.delivery_proofs(
  fleet_id,shipment_id,stop_id,event_key,proof_status,recipient_name,signature_object_path,
  photo_object_paths,gps_latitude,gps_longitude,recipient_note,exception_reason,
  pallets_delivered,pallets_received,pallets_damaged,performed_by
 ) values(
  p_fleet_id,p_shipment_id,p_stop_id,p_event_key,
  case when p_signature_object_path is null then 'authorized_exception' else 'signed' end,
  nullif(btrim(coalesce(p_recipient_name,'')),''),p_signature_object_path,v_photos,
  p_gps_latitude,p_gps_longitude,nullif(btrim(coalesce(p_recipient_note,'')),''),
  nullif(btrim(coalesce(p_exception_reason,'')),''),coalesce(p_pallets_delivered,0),
  coalesce(p_pallets_received,0),coalesce(p_pallets_damaged,0),v_actor
 ) returning id into v_proof_id;

 select coalesce(jsonb_agg(jsonb_build_object(
  'line_number',l.line_no,'item_code',l.item_code,'description',l.description,'unit',l.unit,
  'planned_quantity',sl.planned_quantity,'delivered_quantity',sl.delivered_quantity,
  'damaged_quantity',sl.damaged_quantity,'rejected_quantity',sl.rejected_quantity,
  'returned_quantity',sl.returned_quantity
 ) order by l.line_no),'[]'::jsonb) into v_lines
 from public.shipment_stop_lines sl join public.shipment_lines l
  on l.id=sl.shipment_line_id and l.fleet_id=sl.fleet_id and l.shipment_id=sl.shipment_id
 where sl.fleet_id=p_fleet_id and sl.shipment_id=p_shipment_id and sl.stop_id=p_stop_id;
 select f.name into v_fleet_name from public.fleets f where f.id=p_fleet_id;
 v_snapshot:=jsonb_build_object(
  'document_type','delivery_note','note_number',v_note_number,'issued_at',v_now,
  'issuer',jsonb_build_object('name',v_settings.issuer_name,'business_id',v_settings.issuer_business_id,
   'address',v_settings.issuer_address,'phone',v_settings.issuer_phone,'email',v_settings.issuer_email),
  'fleet_name',v_fleet_name,
  'customer',jsonb_build_object('name',v_shipment.customer_name,'reference',v_shipment.customer_reference,
   'delivery_reference',v_shipment.delivery_reference),
  'shipment',jsonb_build_object('id',p_shipment_id,'scheduled_at',v_shipment.scheduled_at),
  'stop',jsonb_build_object('id',p_stop_id,'sequence_no',v_stop.sequence_no,'type',v_stop.stop_type,'address',v_stop.address,
   'completed_at',v_stop.completed_at,'status',v_stop.status,'exception_reason',v_stop.exception_reason),
  'cargo_lines',v_lines,
  'pallet_exchange',jsonb_build_object('delivered',coalesce(p_pallets_delivered,0),
   'received',coalesce(p_pallets_received,0),'damaged',coalesce(p_pallets_damaged,0),
   'outstanding',coalesce(p_pallets_delivered,0)-coalesce(p_pallets_received,0),'unit','pallet'),
  'proof',jsonb_build_object('status',case when p_signature_object_path is null then 'authorized_exception' else 'signed' end,
   'recipient_name',nullif(btrim(coalesce(p_recipient_name,'')),''),'signature_object_path',p_signature_object_path,
   'photo_object_paths',to_jsonb(v_photos),'gps_latitude',p_gps_latitude,'gps_longitude',p_gps_longitude,
   'recipient_note',nullif(btrim(coalesce(p_recipient_note,'')),''),
   'exception_reason',nullif(btrim(coalesce(p_exception_reason,'')),'')),
  'legal_notice','Delivery note; not a tax invoice.'
 );
 insert into public.delivery_notes(fleet_id,shipment_id,stop_id,proof_id,note_number,document_snapshot,issued_at,issued_by)
 values(p_fleet_id,p_shipment_id,p_stop_id,v_proof_id,v_note_number,v_snapshot,v_now,v_actor)
 returning id into v_note_id;
 return jsonb_build_object('note_id',v_note_id,'note_number',v_note_number,
  'proof_status',case when p_signature_object_path is null then 'authorized_exception' else 'signed' end);
end;
$function$;

drop policy if exists shipments_select_member on public.shipments;
create policy shipments_select_member on public.shipments for select to authenticated using (
 private.has_fleet_role(shipments.fleet_id,array['owner','fleet_manager','dispatcher','safety_manager']::text[])
 or private.is_active_assigned_fleet_driver(shipments.fleet_id,shipments.assigned_driver_id)
);
drop policy if exists shipment_lines_select_member on public.shipment_lines;
create policy shipment_lines_select_member on public.shipment_lines for select to authenticated using (exists(
 select 1 from public.shipments s where s.id=shipment_lines.shipment_id and s.fleet_id=shipment_lines.fleet_id
 and (private.has_fleet_role(s.fleet_id,array['owner','fleet_manager','dispatcher','safety_manager']::text[])
 or private.is_active_assigned_fleet_driver(s.fleet_id,s.assigned_driver_id))
));
drop policy if exists shipment_stops_select_member on public.shipment_stops;
create policy shipment_stops_select_member on public.shipment_stops for select to authenticated using (exists(
 select 1 from public.shipments s where s.id=shipment_stops.shipment_id and s.fleet_id=shipment_stops.fleet_id
 and (private.has_fleet_role(s.fleet_id,array['owner','fleet_manager','dispatcher','safety_manager']::text[])
 or private.is_active_assigned_fleet_driver(s.fleet_id,s.assigned_driver_id))
));
drop policy if exists shipment_stop_lines_select_member on public.shipment_stop_lines;
create policy shipment_stop_lines_select_member on public.shipment_stop_lines for select to authenticated using (exists(
 select 1 from public.shipments s where s.id=shipment_stop_lines.shipment_id and s.fleet_id=shipment_stop_lines.fleet_id
 and (private.has_fleet_role(s.fleet_id,array['owner','fleet_manager','dispatcher','safety_manager']::text[])
 or private.is_active_assigned_fleet_driver(s.fleet_id,s.assigned_driver_id))
));
drop policy if exists shipment_stop_events_select_member on public.shipment_stop_events;
create policy shipment_stop_events_select_member on public.shipment_stop_events for select to authenticated using (exists(
 select 1 from public.shipments s where s.id=shipment_stop_events.shipment_id and s.fleet_id=shipment_stop_events.fleet_id
 and (private.has_fleet_role(s.fleet_id,array['owner','fleet_manager','dispatcher','safety_manager']::text[])
 or private.is_active_assigned_fleet_driver(s.fleet_id,s.assigned_driver_id))
));
drop policy if exists delivery_proofs_select_member on public.delivery_proofs;
create policy delivery_proofs_select_member on public.delivery_proofs for select to authenticated using (
 private.has_fleet_role(fleet_id,array['owner','fleet_manager','dispatcher','safety_manager']::text[])
 or exists(select 1 from public.shipments s where s.id=delivery_proofs.shipment_id
  and s.fleet_id=delivery_proofs.fleet_id
  and private.is_active_assigned_fleet_driver(s.fleet_id,s.assigned_driver_id))
);
drop policy if exists delivery_notes_select_member on public.delivery_notes;
create policy delivery_notes_select_member on public.delivery_notes for select to authenticated using (
 private.has_fleet_role(fleet_id,array['owner','fleet_manager','dispatcher','safety_manager']::text[])
 or exists(select 1 from public.shipments s where s.id=delivery_notes.shipment_id
  and s.fleet_id=delivery_notes.fleet_id
  and private.is_active_assigned_fleet_driver(s.fleet_id,s.assigned_driver_id))
);
drop policy if exists delivery_note_adjustments_select_member on public.delivery_note_adjustments;
create policy delivery_note_adjustments_select_member on public.delivery_note_adjustments for select to authenticated using (
 private.has_fleet_role(fleet_id,array['owner','fleet_manager','dispatcher','safety_manager']::text[])
 or exists(select 1 from public.delivery_notes n join public.shipments s
  on s.id=n.shipment_id and s.fleet_id=n.fleet_id
  where n.id=delivery_note_adjustments.delivery_note_id and n.fleet_id=delivery_note_adjustments.fleet_id
  and private.is_active_assigned_fleet_driver(s.fleet_id,s.assigned_driver_id))
);
drop policy if exists delivery_proof_objects_upload_scoped on storage.objects;
create policy delivery_proof_objects_upload_scoped on storage.objects for insert to authenticated with check (
 bucket_id='delivery-proof-private' and cardinality(string_to_array(name,'/'))=4
 and exists(select 1 from public.shipments s where s.id::text=split_part(name,'/',2)
  and s.fleet_id::text=split_part(name,'/',1)
  and split_part(name,'/',3) in (select st.id::text from public.shipment_stops st where st.shipment_id=s.id and st.fleet_id=s.fleet_id)
  and (private.has_fleet_role(s.fleet_id,array['owner','fleet_manager','dispatcher']::text[])
   or private.is_active_assigned_fleet_driver(s.fleet_id,s.assigned_driver_id))
 )
);
drop policy if exists delivery_proof_objects_read_scoped on storage.objects;
create policy delivery_proof_objects_read_scoped on storage.objects for select to authenticated using (
 bucket_id='delivery-proof-private' and cardinality(string_to_array(name,'/'))=4
 and exists(select 1 from public.shipments s where s.id::text=split_part(name,'/',2)
  and s.fleet_id::text=split_part(name,'/',1)
  and split_part(name,'/',3) in (select st.id::text from public.shipment_stops st where st.shipment_id=s.id and st.fleet_id=s.fleet_id)
  and (private.has_fleet_role(s.fleet_id,array['owner','fleet_manager','dispatcher','safety_manager']::text[])
   or private.is_active_assigned_fleet_driver(s.fleet_id,s.assigned_driver_id))
 )
);
