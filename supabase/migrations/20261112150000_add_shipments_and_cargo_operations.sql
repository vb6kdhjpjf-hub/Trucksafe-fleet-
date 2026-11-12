-- Tenant-scoped shipment and cargo quantity operations. No weight is inferred from item counts.
create table public.shipments (
 id uuid primary key default gen_random_uuid(),
 fleet_id uuid not null references public.fleets(id) on delete cascade,
 customer_name text not null check(length(btrim(customer_name))>0),
 customer_reference text,
 delivery_reference text,
 status text not null default 'planned' check(status in ('planned','assigned','in_transit','partially_delivered','delivered','delivery_exception','cancelled')),
 scheduled_at timestamptz,
 assigned_driver_id uuid,
 assigned_vehicle_id uuid,
 notes text,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint shipments_fleet_id_id_key unique(fleet_id,id),
 constraint shipments_driver_same_fleet_fkey foreign key(fleet_id,assigned_driver_id) references public.drivers(fleet_id,id),
 constraint shipments_vehicle_same_fleet_fkey foreign key(fleet_id,assigned_vehicle_id) references public.vehicles(fleet_id,id)
);
create index shipments_fleet_status_scheduled_idx on public.shipments(fleet_id,status,scheduled_at desc);
create index shipments_fleet_driver_status_idx on public.shipments(fleet_id,assigned_driver_id,status);

create table public.shipment_lines (
 id uuid primary key default gen_random_uuid(),
 fleet_id uuid not null,
 shipment_id uuid not null,
 line_no integer not null check(line_no>0),
 item_code text,
 description text not null check(length(btrim(description))>0),
 unit text not null check(unit in ('pallet','carton','package','piece','roll','bundle','container','kg','tonne')),
 planned_quantity numeric(14,3) not null check(planned_quantity>0),
 created_at timestamptz not null default now(),
 constraint shipment_lines_fleet_id_id_key unique(fleet_id,id),
 constraint shipment_lines_fleet_shipment_id_id_key unique(fleet_id,shipment_id,id),
 constraint shipment_lines_shipment_line_no_key unique(shipment_id,line_no),
 constraint shipment_lines_shipment_same_fleet_fkey foreign key(fleet_id,shipment_id) references public.shipments(fleet_id,id) on delete cascade
);
create index shipment_lines_shipment_idx on public.shipment_lines(fleet_id,shipment_id,line_no);

create table public.shipment_stops (
 id uuid primary key default gen_random_uuid(),
 fleet_id uuid not null,
 shipment_id uuid not null,
 sequence_no integer not null check(sequence_no>0),
 stop_type text not null default 'delivery' check(stop_type in ('pickup','delivery','return','other')),
 address text not null check(length(btrim(address))>0),
 scheduled_at timestamptz,
 status text not null default 'pending' check(status in ('pending','in_progress','completed','partially_completed','delivery_exception','skipped')),
 completed_at timestamptz,
 exception_reason text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint shipment_stops_fleet_id_id_key unique(fleet_id,id),
 constraint shipment_stops_fleet_shipment_id_id_key unique(fleet_id,shipment_id,id),
 constraint shipment_stops_sequence_key unique(shipment_id,sequence_no),
 constraint shipment_stops_shipment_same_fleet_fkey foreign key(fleet_id,shipment_id) references public.shipments(fleet_id,id) on delete cascade
);
create index shipment_stops_shipment_status_idx on public.shipment_stops(fleet_id,shipment_id,status,sequence_no);

create table public.shipment_stop_lines (
 id uuid primary key default gen_random_uuid(),
 fleet_id uuid not null,
 shipment_id uuid not null,
 stop_id uuid not null,
 shipment_line_id uuid not null,
 planned_quantity numeric(14,3) not null check(planned_quantity>0),
 delivered_quantity numeric(14,3) not null default 0 check(delivered_quantity>=0),
 damaged_quantity numeric(14,3) not null default 0 check(damaged_quantity>=0),
 rejected_quantity numeric(14,3) not null default 0 check(rejected_quantity>=0),
 returned_quantity numeric(14,3) not null default 0 check(returned_quantity>=0),
 updated_at timestamptz not null default now(),
 constraint shipment_stop_lines_stop_line_key unique(stop_id,shipment_line_id),
 constraint shipment_stop_lines_fleet_id_id_key unique(fleet_id,id),
 constraint shipment_stop_lines_stop_same_shipment_fkey foreign key(fleet_id,shipment_id,stop_id) references public.shipment_stops(fleet_id,shipment_id,id) on delete cascade,
 constraint shipment_stop_lines_line_same_shipment_fkey foreign key(fleet_id,shipment_id,shipment_line_id) references public.shipment_lines(fleet_id,shipment_id,id),
 constraint shipment_stop_lines_outcome_check check(delivered_quantity+damaged_quantity+rejected_quantity<=planned_quantity and returned_quantity<=delivered_quantity)
);
create index shipment_stop_lines_stop_idx on public.shipment_stop_lines(fleet_id,stop_id);

create table public.shipment_stop_events (
 id uuid primary key default gen_random_uuid(),
 fleet_id uuid not null,
 shipment_id uuid not null,
 stop_id uuid not null,
 event_key uuid not null,
 event_type text not null check(event_type='stop_result_recorded'),
 payload jsonb not null,
 performed_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 constraint shipment_stop_events_event_key unique(shipment_id,event_key),
 constraint shipment_stop_events_fleet_id_id_key unique(fleet_id,id),
 constraint shipment_stop_events_stop_same_shipment_fkey foreign key(fleet_id,shipment_id,stop_id) references public.shipment_stops(fleet_id,shipment_id,id) on delete cascade,
 constraint shipment_stop_events_shipment_same_fleet_fkey foreign key(fleet_id,shipment_id) references public.shipments(fleet_id,id) on delete cascade
);
create index shipment_stop_events_shipment_created_idx on public.shipment_stop_events(fleet_id,shipment_id,created_at desc);

create or replace function public.create_shipment(
 p_fleet_id uuid,p_customer_name text,p_customer_reference text,p_delivery_reference text,
 p_scheduled_at timestamptz,p_assigned_driver_id uuid,p_assigned_vehicle_id uuid,
 p_notes text,p_lines jsonb,p_stops jsonb
)
returns uuid language plpgsql security definer set search_path=''
as $function$
declare
 v_actor uuid:=auth.uid();
 v_shipment_id uuid;
 v_driver public.drivers%rowtype;
 v_vehicle public.vehicles%rowtype;
 v_line jsonb; v_stop jsonb; v_item jsonb;
 v_line_ids uuid[]:=array[]::uuid[];
 v_line_quantities numeric[]:=array[]::numeric[];
 v_allocated numeric[]:=array[]::numeric[];
 v_line_index integer; v_line_no integer:=0; v_stop_no integer:=0;
 v_quantity numeric(14,3); v_child_id uuid; v_unit text; v_description text;
begin
 if v_actor is null then raise exception 'Authentication required'; end if;
 if not private.has_fleet_role(p_fleet_id,array['owner','fleet_manager','dispatcher']::text[]) then
  raise exception 'Only an authorized dispatcher may create shipments';
 end if;
 if p_customer_name is null or length(btrim(p_customer_name))=0 then raise exception 'Customer name is required'; end if;
 if p_assigned_driver_id is not null then
  select d.* into v_driver from public.drivers d where d.id=p_assigned_driver_id and d.fleet_id=p_fleet_id;
  if not found or v_driver.status<>'active' then raise exception 'Assigned driver is not active in this fleet'; end if;
 end if;
 if p_assigned_vehicle_id is not null then
  select v.* into v_vehicle from public.vehicles v where v.id=p_assigned_vehicle_id and v.fleet_id=p_fleet_id;
  if not found or v_vehicle.status not in ('available','assigned') then raise exception 'Assigned vehicle is not available in this fleet'; end if;
 end if;
 if p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)<1 or jsonb_array_length(p_lines)>100 then
  raise exception 'A shipment must contain between 1 and 100 cargo lines';
 end if;
 if p_stops is null or jsonb_typeof(p_stops)<>'array' or jsonb_array_length(p_stops)<1 or jsonb_array_length(p_stops)>30 then
  raise exception 'A shipment must contain between 1 and 30 stops';
 end if;
 insert into public.shipments(fleet_id,customer_name,customer_reference,delivery_reference,status,scheduled_at,assigned_driver_id,assigned_vehicle_id,notes,created_by)
 values(p_fleet_id,btrim(p_customer_name),nullif(btrim(coalesce(p_customer_reference,'')),''),
  nullif(btrim(coalesce(p_delivery_reference,'')),''),
  case when p_assigned_driver_id is null then 'planned' else 'assigned' end,
  p_scheduled_at,p_assigned_driver_id,p_assigned_vehicle_id,nullif(btrim(coalesce(p_notes,'')),''),v_actor)
 returning id into v_shipment_id;
 for v_line in select value from jsonb_array_elements(p_lines) loop
  v_line_no:=v_line_no+1; v_unit:=v_line->>'unit'; v_description:=btrim(coalesce(v_line->>'description',''));
  begin v_quantity:=(v_line->>'planned_quantity')::numeric; exception when others then raise exception 'Cargo line % has an invalid planned quantity',v_line_no; end;
  if v_unit is null or v_unit not in ('pallet','carton','package','piece','roll','bundle','container','kg','tonne')
    or v_description='' or v_quantity is null or v_quantity<=0 or v_quantity<>round(v_quantity,3) then
   raise exception 'Cargo line % has invalid description, unit or quantity',v_line_no;
  end if;
  insert into public.shipment_lines(fleet_id,shipment_id,line_no,item_code,description,unit,planned_quantity)
  values(p_fleet_id,v_shipment_id,v_line_no,nullif(btrim(coalesce(v_line->>'item_code','')),''),v_description,v_unit,v_quantity)
  returning id into v_child_id;
  v_line_ids:=array_append(v_line_ids,v_child_id);
  v_line_quantities:=array_append(v_line_quantities,v_quantity);
  v_allocated:=array_append(v_allocated,0::numeric);
 end loop;
 for v_stop in select value from jsonb_array_elements(p_stops) loop
  v_stop_no:=v_stop_no+1;
  if btrim(coalesce(v_stop->>'address',''))='' then raise exception 'Stop % requires a delivery address',v_stop_no; end if;
  insert into public.shipment_stops(fleet_id,shipment_id,sequence_no,stop_type,address,scheduled_at)
  values(p_fleet_id,v_shipment_id,v_stop_no,coalesce(nullif(v_stop->>'stop_type',''),'delivery'),
   btrim(v_stop->>'address'),nullif(v_stop->>'scheduled_at','')::timestamptz)
  returning id into v_child_id;
  if jsonb_typeof(v_stop->'items') is distinct from 'array' or jsonb_array_length(v_stop->'items')<1 then
   raise exception 'Stop % must contain at least one cargo line',v_stop_no;
  end if;
  for v_item in select value from jsonb_array_elements(v_stop->'items') loop
   begin v_line_index:=(v_item->>'line_index')::integer; v_quantity:=(v_item->>'planned_quantity')::numeric;
   exception when others then raise exception 'Stop % contains an invalid cargo allocation',v_stop_no; end;
   if v_line_index is null or v_line_index<0 or v_line_index>=array_length(v_line_ids,1)
     or v_quantity is null or v_quantity<=0 or v_quantity<>round(v_quantity,3) then
    raise exception 'Stop % contains an invalid cargo allocation',v_stop_no;
   end if;
   v_allocated[v_line_index+1]:=v_allocated[v_line_index+1]+v_quantity;
   if v_allocated[v_line_index+1]>v_line_quantities[v_line_index+1] then raise exception 'Stop allocations exceed planned cargo line %',v_line_index+1; end if;
   insert into public.shipment_stop_lines(fleet_id,shipment_id,stop_id,shipment_line_id,planned_quantity)
   values(p_fleet_id,v_shipment_id,v_child_id,v_line_ids[v_line_index+1],v_quantity);
  end loop;
 end loop;
 for v_line_no in 1..array_length(v_line_ids,1) loop
  if v_allocated[v_line_no]<>v_line_quantities[v_line_no] then
   raise exception 'Stop allocations must equal the planned quantity for cargo line %',v_line_no;
  end if;
 end loop;
 return v_shipment_id;
end;
$function$;
revoke all on function public.create_shipment(uuid,text,text,text,timestamptz,uuid,uuid,text,jsonb,jsonb) from public,anon;
grant execute on function public.create_shipment(uuid,text,text,text,timestamptz,uuid,uuid,text,jsonb,jsonb) to authenticated;

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
  and not exists(select 1 from public.drivers d where d.id=v_shipment.assigned_driver_id and d.fleet_id=p_fleet_id and d.user_id=v_actor) then
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
revoke all on function public.record_shipment_stop_result(uuid,uuid,uuid,uuid,jsonb,text) from public,anon;
grant execute on function public.record_shipment_stop_result(uuid,uuid,uuid,uuid,jsonb,text) to authenticated;

alter table public.shipments enable row level security;
alter table public.shipment_lines enable row level security;
alter table public.shipment_stops enable row level security;
alter table public.shipment_stop_lines enable row level security;
alter table public.shipment_stop_events enable row level security;

create policy shipments_select_member on public.shipments for select to authenticated using (
 private.has_fleet_role(shipments.fleet_id,array['owner','fleet_manager','dispatcher','safety_manager']::text[])
 or exists(select 1 from public.drivers d where d.id=shipments.assigned_driver_id and d.fleet_id=shipments.fleet_id and d.user_id=(select auth.uid()))
);
create policy shipment_lines_select_member on public.shipment_lines for select to authenticated using (exists(
 select 1 from public.shipments s where s.id=shipment_lines.shipment_id and s.fleet_id=shipment_lines.fleet_id
 and (private.has_fleet_role(s.fleet_id,array['owner','fleet_manager','dispatcher','safety_manager']::text[])
 or exists(select 1 from public.drivers d where d.id=s.assigned_driver_id and d.fleet_id=s.fleet_id and d.user_id=(select auth.uid())))
));
create policy shipment_stops_select_member on public.shipment_stops for select to authenticated using (exists(
 select 1 from public.shipments s where s.id=shipment_stops.shipment_id and s.fleet_id=shipment_stops.fleet_id
 and (private.has_fleet_role(s.fleet_id,array['owner','fleet_manager','dispatcher','safety_manager']::text[])
 or exists(select 1 from public.drivers d where d.id=s.assigned_driver_id and d.fleet_id=s.fleet_id and d.user_id=(select auth.uid())))
));
create policy shipment_stop_lines_select_member on public.shipment_stop_lines for select to authenticated using (exists(
 select 1 from public.shipments s where s.id=shipment_stop_lines.shipment_id and s.fleet_id=shipment_stop_lines.fleet_id
 and (private.has_fleet_role(s.fleet_id,array['owner','fleet_manager','dispatcher','safety_manager']::text[])
 or exists(select 1 from public.drivers d where d.id=s.assigned_driver_id and d.fleet_id=s.fleet_id and d.user_id=(select auth.uid())))
));
create policy shipment_stop_events_select_member on public.shipment_stop_events for select to authenticated using (exists(
 select 1 from public.shipments s where s.id=shipment_stop_events.shipment_id and s.fleet_id=shipment_stop_events.fleet_id
 and (private.has_fleet_role(s.fleet_id,array['owner','fleet_manager','dispatcher','safety_manager']::text[])
 or exists(select 1 from public.drivers d where d.id=s.assigned_driver_id and d.fleet_id=s.fleet_id and d.user_id=(select auth.uid())))
));
revoke all on public.shipments,public.shipment_lines,public.shipment_stops,public.shipment_stop_lines,public.shipment_stop_events from anon,authenticated;
grant select on public.shipments,public.shipment_lines,public.shipment_stops,public.shipment_stop_lines,public.shipment_stop_events to authenticated;
comment on table public.shipments is 'Tenant-scoped shipment orders; operational cargo quantities are separate from verified vehicle weight.';
comment on table public.shipment_lines is 'Cargo lines with explicit units; pallet/carton counts never imply a weight measurement.';
comment on table public.shipment_stop_lines is 'Per-stop planned and actual quantities, including delivered, damaged, rejected and returned amounts.';
comment on table public.shipment_stop_events is 'Append-only, idempotent record of stop result submissions.';
