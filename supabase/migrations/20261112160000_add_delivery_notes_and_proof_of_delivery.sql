-- Immutable delivery notes and proof-of-delivery records. Test/isolated branch only until reviewed.
create table public.delivery_note_settings (
 fleet_id uuid primary key references public.fleets(id) on delete cascade,
 issuer_name text not null check(length(btrim(issuer_name)) between 1 and 160),
 issuer_business_id text,
 issuer_address text,
 issuer_phone text,
 issuer_email text,
 number_prefix text not null default 'DL' check(number_prefix ~ '^[A-Z0-9]{2,10}$'),
 next_number bigint not null default 1 check(next_number>0),
 updated_at timestamptz not null default now()
);

create table public.delivery_proofs (
 id uuid primary key default gen_random_uuid(),
 fleet_id uuid not null,
 shipment_id uuid not null,
 stop_id uuid not null,
 event_key uuid not null,
 proof_status text not null check(proof_status in ('signed','authorized_exception')),
 recipient_name text,
 signature_object_path text,
 photo_object_paths text[] not null default '{}',
 gps_latitude numeric(9,6),
 gps_longitude numeric(9,6),
 recipient_note text,
 exception_reason text,
 pallets_delivered numeric(14,3) not null default 0 check(pallets_delivered>=0),
 pallets_received numeric(14,3) not null default 0 check(pallets_received>=0),
 pallets_damaged numeric(14,3) not null default 0 check(pallets_damaged>=0 and pallets_damaged<=pallets_received),
 performed_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 constraint delivery_proofs_fleet_id_id_key unique(fleet_id,id),
 constraint delivery_proofs_stop_key unique(fleet_id,stop_id),
 constraint delivery_proofs_event_key unique(shipment_id,event_key),
 constraint delivery_proofs_stop_same_shipment_fkey
  foreign key(fleet_id,shipment_id,stop_id)
  references public.shipment_stops(fleet_id,shipment_id,id) on delete cascade,
 constraint delivery_proofs_gps_pair_check check(
  (gps_latitude is null and gps_longitude is null) or
  (gps_latitude between -90 and 90 and gps_longitude between -180 and 180)
 ),
 constraint delivery_proofs_signature_state_check check(
  (proof_status='signed' and recipient_name is not null and signature_object_path is not null and exception_reason is null)
  or
  (proof_status='authorized_exception' and signature_object_path is null and exception_reason is not null)
 )
);

create table public.delivery_notes (
 id uuid primary key default gen_random_uuid(),
 fleet_id uuid not null,
 shipment_id uuid not null,
 stop_id uuid not null,
 proof_id uuid not null,
 note_number text not null,
 document_snapshot jsonb not null check(jsonb_typeof(document_snapshot)='object'),
 issued_at timestamptz not null default now(),
 issued_by uuid not null references auth.users(id),
 constraint delivery_notes_fleet_id_id_key unique(fleet_id,id),
 constraint delivery_notes_fleet_number_key unique(fleet_id,note_number),
 constraint delivery_notes_stop_key unique(fleet_id,stop_id),
 constraint delivery_notes_proof_same_fleet_fkey foreign key(fleet_id,proof_id)
  references public.delivery_proofs(fleet_id,id),
 constraint delivery_notes_stop_same_shipment_fkey foreign key(fleet_id,shipment_id,stop_id)
  references public.shipment_stops(fleet_id,shipment_id,id) on delete restrict
);
create index delivery_notes_fleet_issued_idx on public.delivery_notes(fleet_id,issued_at desc);

create table public.delivery_note_adjustments (
 id uuid primary key default gen_random_uuid(),
 fleet_id uuid not null,
 delivery_note_id uuid not null,
 event_key uuid not null,
 adjustment_type text not null check(adjustment_type in ('correction','cancellation')),
 reason text not null check(length(btrim(reason)) between 3 and 1000),
 payload jsonb not null default '{}'::jsonb check(jsonb_typeof(payload)='object'),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 constraint delivery_note_adjustments_event_key unique(delivery_note_id,event_key),
 constraint delivery_note_adjustments_note_same_fleet_fkey
  foreign key(fleet_id,delivery_note_id) references public.delivery_notes(fleet_id,id) on delete restrict
);
create index delivery_note_adjustments_note_idx on public.delivery_note_adjustments(fleet_id,delivery_note_id,created_at);

create or replace function private.prevent_delivery_record_mutation()
returns trigger language plpgsql set search_path=''
as $function$
begin
 raise exception 'Issued delivery records are immutable; append a correction or cancellation record';
end;
$function$;

create trigger delivery_proofs_immutable
 before update or delete on public.delivery_proofs
 for each row execute function private.prevent_delivery_record_mutation();
create trigger delivery_notes_immutable
 before update or delete on public.delivery_notes
 for each row execute function private.prevent_delivery_record_mutation();
create trigger delivery_note_adjustments_immutable
 before update or delete on public.delivery_note_adjustments
 for each row execute function private.prevent_delivery_record_mutation();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('delivery-proof-private','delivery-proof-private',false,10485760,array['image/png','image/jpeg','image/webp'])
on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=array['image/png','image/jpeg','image/webp'];

create policy delivery_proof_objects_upload_scoped on storage.objects
 for insert to authenticated with check (
  bucket_id='delivery-proof-private'
  and cardinality(string_to_array(name,'/'))=4
  and exists (
   select 1 from public.shipments s
   where s.id::text=split_part(name,'/',2)
    and s.fleet_id::text=split_part(name,'/',1)
    and split_part(name,'/',3) in (select st.id::text from public.shipment_stops st where st.shipment_id=s.id and st.fleet_id=s.fleet_id)
    and (
     private.has_fleet_role(s.fleet_id,array['owner','fleet_manager','dispatcher']::text[])
     or exists(select 1 from public.drivers d where d.id=s.assigned_driver_id and d.fleet_id=s.fleet_id and d.user_id=(select auth.uid()))
    )
  )
 );

create policy delivery_proof_objects_read_scoped on storage.objects
 for select to authenticated using (
  bucket_id='delivery-proof-private'
  and cardinality(string_to_array(name,'/'))=4
  and exists (
   select 1 from public.shipments s
   where s.id::text=split_part(name,'/',2)
    and s.fleet_id::text=split_part(name,'/',1)
    and split_part(name,'/',3) in (select st.id::text from public.shipment_stops st where st.shipment_id=s.id and st.fleet_id=s.fleet_id)
    and (
     private.has_fleet_role(s.fleet_id,array['owner','fleet_manager','dispatcher','safety_manager']::text[])
     or exists(select 1 from public.drivers d where d.id=s.assigned_driver_id and d.fleet_id=s.fleet_id and d.user_id=(select auth.uid()))
    )
  )
 );

alter table public.delivery_note_settings enable row level security;
alter table public.delivery_proofs enable row level security;
alter table public.delivery_notes enable row level security;
alter table public.delivery_note_adjustments enable row level security;

create policy delivery_note_settings_select_member on public.delivery_note_settings
 for select to authenticated using (
  private.has_fleet_role(fleet_id,array['owner','fleet_manager','dispatcher','safety_manager']::text[])
 );
create policy delivery_proofs_select_member on public.delivery_proofs
 for select to authenticated using (
  private.has_fleet_role(fleet_id,array['owner','fleet_manager','dispatcher','safety_manager']::text[])
  or exists(select 1 from public.shipments s join public.drivers d on d.id=s.assigned_driver_id and d.fleet_id=s.fleet_id
   where s.id=delivery_proofs.shipment_id and s.fleet_id=delivery_proofs.fleet_id and d.user_id=(select auth.uid()))
 );
create policy delivery_notes_select_member on public.delivery_notes
 for select to authenticated using (
  private.has_fleet_role(fleet_id,array['owner','fleet_manager','dispatcher','safety_manager']::text[])
  or exists(select 1 from public.shipments s join public.drivers d on d.id=s.assigned_driver_id and d.fleet_id=s.fleet_id
   where s.id=delivery_notes.shipment_id and s.fleet_id=delivery_notes.fleet_id and d.user_id=(select auth.uid()))
 );
create policy delivery_note_adjustments_select_member on public.delivery_note_adjustments
 for select to authenticated using (
  private.has_fleet_role(fleet_id,array['owner','fleet_manager','dispatcher','safety_manager']::text[])
  or exists(select 1 from public.delivery_notes n join public.shipments s on s.id=n.shipment_id and s.fleet_id=n.fleet_id
   join public.drivers d on d.id=s.assigned_driver_id and d.fleet_id=s.fleet_id
   where n.id=delivery_note_adjustments.delivery_note_id and n.fleet_id=delivery_note_adjustments.fleet_id and d.user_id=(select auth.uid()))
 );

revoke all on public.delivery_note_settings,public.delivery_proofs,public.delivery_notes,public.delivery_note_adjustments from anon,authenticated;
grant select on public.delivery_note_settings,public.delivery_proofs,public.delivery_notes,public.delivery_note_adjustments to authenticated;

create or replace function public.update_delivery_note_settings(
 p_fleet_id uuid,p_issuer_name text,p_business_id text,p_address text,p_phone text,p_email text,p_number_prefix text
)
returns void language plpgsql security definer set search_path=''
as $function$
declare v_fleet_name text;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not private.has_fleet_role(p_fleet_id,array['owner','fleet_manager']::text[]) then
  raise exception 'Only a fleet owner or manager may update document identity';
 end if;
 if p_issuer_name is null or length(btrim(p_issuer_name)) not between 1 and 160
  or p_number_prefix is null or p_number_prefix !~ '^[A-Z0-9]{2,10}$'
  or coalesce(length(p_business_id),0)>40 or coalesce(length(p_address),0)>300
  or coalesce(length(p_phone),0)>40 or coalesce(length(p_email),0)>254
  or (nullif(btrim(coalesce(p_email,'')),'') is not null and p_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$') then
  raise exception 'Invalid delivery document issuer details';
 end if;
 select f.name into v_fleet_name from public.fleets f where f.id=p_fleet_id;
 if v_fleet_name is null then raise exception 'Fleet not found'; end if;
 insert into public.delivery_note_settings(fleet_id,issuer_name,number_prefix)
 values(p_fleet_id,v_fleet_name,'DL') on conflict(fleet_id) do nothing;
 update public.delivery_note_settings set issuer_name=btrim(p_issuer_name),
  issuer_business_id=nullif(btrim(coalesce(p_business_id,'')),''),
  issuer_address=nullif(btrim(coalesce(p_address,'')),''),
  issuer_phone=nullif(btrim(coalesce(p_phone,'')),''),
  issuer_email=nullif(btrim(coalesce(p_email,'')),''),
  number_prefix=p_number_prefix,updated_at=now()
 where fleet_id=p_fleet_id;
end;
$function$;
revoke all on function public.update_delivery_note_settings(uuid,text,text,text,text,text,text) from public,anon;
grant execute on function public.update_delivery_note_settings(uuid,text,text,text,text,text,text) to authenticated;

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
 v_photos text[]:=coalesce(p_photo_object_paths,'{}'::text[]);
begin
 if v_actor is null then raise exception 'Authentication required'; end if;
 if p_event_key is null or p_fleet_id is null or p_shipment_id is null or p_stop_id is null then
  raise exception 'Missing delivery document identifiers';
 end if;
 v_is_manager:=private.has_fleet_role(p_fleet_id,array['owner','fleet_manager','dispatcher']::text[]);
 v_can_override:=private.has_fleet_role(p_fleet_id,array['owner','fleet_manager']::text[]);
 select s.* into v_shipment from public.shipments s
 where s.id=p_shipment_id and s.fleet_id=p_fleet_id for update;
 if not found or v_shipment.status='cancelled' then raise exception 'Shipment is unavailable'; end if;
 if not v_is_manager and not exists(
  select 1 from public.drivers d where d.id=v_shipment.assigned_driver_id and d.fleet_id=p_fleet_id and d.user_id=v_actor
 ) then raise exception 'Only the assigned driver or an authorized dispatcher may record delivery proof'; end if;
 select jsonb_build_object('note_id',n.id,'note_number',n.note_number,'proof_status',p.proof_status)
 into v_existing from public.delivery_notes n join public.delivery_proofs p on p.id=n.proof_id and p.fleet_id=n.fleet_id
 where n.shipment_id=p_shipment_id and p.event_key=p_event_key;
 if v_existing is not null then return v_existing; end if;
 select st.* into v_stop from public.shipment_stops st
 where st.id=p_stop_id and st.shipment_id=p_shipment_id and st.fleet_id=p_fleet_id for update;
 if not found or v_stop.status not in ('completed','partially_completed') then
  raise exception 'The stop must be completed before issuing a delivery note';
 end if;
 if exists(select 1 from public.delivery_notes n where n.fleet_id=p_fleet_id and n.stop_id=p_stop_id)
  or exists(select 1 from public.delivery_proofs p where p.fleet_id=p_fleet_id and p.stop_id=p_stop_id) then
  raise exception 'A delivery document already exists for this stop';
 end if;
 if (p_gps_latitude is null) <> (p_gps_longitude is null)
  or (p_gps_latitude is not null and (p_gps_latitude not between -90 and 90 or p_gps_longitude not between -180 and 180)) then
  raise exception 'GPS coordinates must be supplied as a valid pair';
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
revoke all on function public.complete_delivery_document(uuid,uuid,uuid,uuid,text,text,text[],numeric,numeric,text,text,numeric,numeric,numeric) from public,anon;
grant execute on function public.complete_delivery_document(uuid,uuid,uuid,uuid,text,text,text[],numeric,numeric,text,text,numeric,numeric,numeric) to authenticated;

create or replace function public.add_delivery_note_adjustment(
 p_fleet_id uuid,p_delivery_note_id uuid,p_event_key uuid,p_adjustment_type text,p_reason text,p_payload jsonb
)
returns uuid language plpgsql security definer set search_path=''
as $function$
declare v_actor uuid:=auth.uid(); v_id uuid;
begin
 if v_actor is null then raise exception 'Authentication required'; end if;
 if not private.has_fleet_role(p_fleet_id,array['owner','fleet_manager']::text[]) then
  raise exception 'Only a fleet owner or manager may correct or cancel an issued delivery note';
 end if;
 if p_event_key is null or p_adjustment_type not in ('correction','cancellation')
  or p_reason is null or length(btrim(p_reason)) not between 3 and 1000
  or p_payload is null or jsonb_typeof(p_payload)<>'object' then
  raise exception 'Invalid delivery note adjustment';
 end if;
 insert into public.delivery_note_adjustments(fleet_id,delivery_note_id,event_key,adjustment_type,reason,payload,created_by)
 values(p_fleet_id,p_delivery_note_id,p_event_key,p_adjustment_type,btrim(p_reason),p_payload,v_actor)
 on conflict(delivery_note_id,event_key) do nothing returning id into v_id;
 if v_id is null then
  select a.id into v_id from public.delivery_note_adjustments a
  where a.delivery_note_id=p_delivery_note_id and a.event_key=p_event_key;
 end if;
 if v_id is null then raise exception 'Delivery note not found in this fleet'; end if;
 return v_id;
end;
$function$;
revoke all on function public.add_delivery_note_adjustment(uuid,uuid,uuid,text,text,jsonb) from public,anon;
grant execute on function public.add_delivery_note_adjustment(uuid,uuid,uuid,text,text,jsonb) to authenticated;

comment on table public.delivery_notes is 'Immutable, numbered delivery note snapshots; a delivery note is not a tax invoice.';
comment on table public.delivery_proofs is 'Immutable proof of delivery with private signature/photo object references and optional GPS.';
comment on table public.delivery_note_adjustments is 'Append-only correction and cancellation history for issued delivery notes.';
