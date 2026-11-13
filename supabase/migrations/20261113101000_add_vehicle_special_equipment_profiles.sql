alter table public.vehicles add column if not exists body_type text;
alter table public.vehicles add constraint vehicles_body_type_check check (
 body_type is null or body_type = any (array[
 'rigid_truck','tractor_unit','semi_trailer','full_trailer','articulated_crane','telescopic_crane',
 'loader_crane','heavy_lift_crane','mobile_crane','aerial_platform','recovery_crane','concrete_mixer',
 'concrete_pump','tipper','tanker','refrigerated','car_carrier','low_loader','other_special']::text[]));

create table public.vehicle_special_equipment (
 id uuid primary key default gen_random_uuid(), fleet_id uuid not null, vehicle_id uuid not null,
 equipment_kind text not null check(equipment_kind=any(array['crane','aerial_platform','concrete_pump','other_special']::text[])),
 manufacturer text, model text, serial_number text,
 travel_height_cm numeric check(travel_height_cm is null or travel_height_cm between 100 and 600),
 travel_width_cm numeric check(travel_width_cm is null or travel_width_cm between 100 and 350),
 travel_length_cm numeric check(travel_length_cm is null or travel_length_cm between 200 and 3000),
 working_height_cm numeric check(working_height_cm is null or working_height_cm between 100 and 10000),
 working_width_cm numeric check(working_width_cm is null or working_width_cm between 100 and 10000),
 working_length_cm numeric check(working_length_cm is null or working_length_cm between 100 and 10000),
 max_outreach_cm numeric check(max_outreach_cm is null or max_outreach_cm between 0 and 100000),
 max_lifting_capacity_kg numeric check(max_lifting_capacity_kg is null or max_lifting_capacity_kg between 0 and 1000000),
 axle_configuration text, lifting_chart_document_path text, operating_manual_document_path text,
 evidence_status text not null default 'pending' check(evidence_status=any(array['pending','verified','rejected']::text[])),
 evidence_verified_at timestamptz, evidence_verified_by uuid references auth.users(id) on delete set null,
 evidence_review_note text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint vehicle_special_equipment_vehicle_unique unique(fleet_id,vehicle_id),
 constraint vehicle_special_equipment_vehicle_fleet_fkey foreign key(fleet_id,vehicle_id) references public.vehicles(fleet_id,id) on delete cascade,
 constraint vehicle_special_equipment_travel_dimensions_complete check(
  (travel_height_cm is null and travel_width_cm is null and travel_length_cm is null) or
  (travel_height_cm is not null and travel_width_cm is not null and travel_length_cm is not null)),
 constraint vehicle_special_equipment_working_dimensions_complete check(
  (working_height_cm is null and working_width_cm is null and working_length_cm is null) or
  (working_height_cm is not null and working_width_cm is not null and working_length_cm is not null)),
 constraint vehicle_special_equipment_evidence_consistency check(
  (evidence_status='verified' and evidence_verified_at is not null and evidence_verified_by is not null) or
  (evidence_status<>'verified' and evidence_verified_at is null))
);
create index idx_vehicle_special_equipment_fleet_vehicle on public.vehicle_special_equipment(fleet_id,vehicle_id);
alter table public.vehicle_special_equipment enable row level security;
create policy vehicle_special_equipment_select_members on public.vehicle_special_equipment for select to authenticated
 using(private.has_fleet_role(fleet_id,array['owner','fleet_manager','dispatcher','safety_manager']::text[]));
create policy vehicle_special_equipment_insert_managers on public.vehicle_special_equipment for insert to authenticated
 with check(private.has_fleet_role(fleet_id,array['owner','fleet_manager']::text[]));
create policy vehicle_special_equipment_update_managers on public.vehicle_special_equipment for update to authenticated
 using(private.has_fleet_role(fleet_id,array['owner','fleet_manager']::text[]))
 with check(private.has_fleet_role(fleet_id,array['owner','fleet_manager']::text[]));
create policy vehicle_special_equipment_delete_managers on public.vehicle_special_equipment for delete to authenticated
 using(private.has_fleet_role(fleet_id,array['owner','fleet_manager']::text[]));
comment on table public.vehicle_special_equipment is 'Fleet-scoped special equipment. Travel and working configurations are stored separately. Internal evidence review is not legal or route certification.';

create function private.invalidate_special_equipment_evidence() returns trigger
language plpgsql set search_path to '' as $$
begin
 if row(new.equipment_kind,new.manufacturer,new.model,new.serial_number,new.travel_height_cm,new.travel_width_cm,new.travel_length_cm,
 new.working_height_cm,new.working_width_cm,new.working_length_cm,new.max_outreach_cm,new.max_lifting_capacity_kg,
 new.axle_configuration,new.lifting_chart_document_path,new.operating_manual_document_path)
 is distinct from row(old.equipment_kind,old.manufacturer,old.model,old.serial_number,old.travel_height_cm,old.travel_width_cm,old.travel_length_cm,
 old.working_height_cm,old.working_width_cm,old.working_length_cm,old.max_outreach_cm,old.max_lifting_capacity_kg,
 old.axle_configuration,old.lifting_chart_document_path,old.operating_manual_document_path) then
  new.evidence_status:='pending';new.evidence_verified_at:=null;new.evidence_verified_by:=null;new.evidence_review_note:=null;
 end if;
 new.updated_at:=pg_catalog.now();return new;
end; $$;
create trigger trg_invalidate_special_equipment_evidence before update on public.vehicle_special_equipment
for each row execute function private.invalidate_special_equipment_evidence();

create function private.review_vehicle_special_equipment(p_equipment_id uuid,p_decision text,p_note text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare e record; reviewer uuid:=auth.uid(); previous_role text:=coalesce(current_setting('request.jwt.claim.role',true),'authenticated');
 note_text text:=btrim(coalesce(p_note,'')); status_text text; verified_at_value timestamptz;
begin
 if reviewer is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if p_decision not in ('verified','rejected') then raise exception 'Invalid decision' using errcode='22023'; end if;
 if char_length(note_text)<5 or char_length(note_text)>1000 then raise exception 'Review note must be 5-1000 characters' using errcode='22023'; end if;
 select x.*,v.is_demo,v.registration_verification_status,v.registration_document_path into e
 from public.vehicle_special_equipment x join public.vehicles v on v.id=x.vehicle_id and v.fleet_id=x.fleet_id
 where x.id=p_equipment_id for update of x;
 if not found then raise exception 'Equipment profile not found' using errcode='P0002'; end if;
 if not private.has_fleet_role(e.fleet_id,array['owner','fleet_manager']::text[]) then raise exception 'Fleet manager required' using errcode='42501'; end if;
 if coalesce(e.is_demo,false) then raise exception 'Demo vehicles cannot be verified' using errcode='22023'; end if;
 if e.registration_verification_status<>'verified' or e.registration_document_path is null then raise exception 'Vehicle registration must be verified first' using errcode='22023'; end if;
 if e.travel_height_cm is null or e.travel_width_cm is null or e.travel_length_cm is null or nullif(btrim(e.axle_configuration),'') is null then raise exception 'Travel dimensions and axle configuration required' using errcode='22023'; end if;
 if e.equipment_kind in ('crane','aerial_platform','concrete_pump') then
  if e.lifting_chart_document_path is null or e.working_height_cm is null or e.max_outreach_cm is null or e.max_lifting_capacity_kg is null then raise exception 'Manufacturer chart and working data required' using errcode='22023'; end if;
  if not exists(select 1 from storage.objects o where o.bucket_id='vehicle-registrations' and o.name=e.lifting_chart_document_path and o.archived_at is null and coalesce(o.is_delete_marker,false)=false) then raise exception 'Lifting chart file missing from private storage' using errcode='22023'; end if;
 end if;
 perform set_config('request.jwt.claim.role','service_role',true);
 update public.vehicle_special_equipment set evidence_status=p_decision,evidence_verified_at=case when p_decision='verified' then pg_catalog.now() else null end,evidence_verified_by=reviewer,evidence_review_note=note_text where id=p_equipment_id returning evidence_status,evidence_verified_at into status_text,verified_at_value;
 perform set_config('request.jwt.claim.role',previous_role,true);
 return pg_catalog.jsonb_build_object('equipment_id',p_equipment_id,'status',status_text,'verified_at',verified_at_value,'verified_by',reviewer,'note',note_text);
end; $$;
create function public.review_vehicle_special_equipment(p_equipment_id uuid,p_decision text,p_note text)
returns jsonb language sql set search_path to '' as $$ select private.review_vehicle_special_equipment(p_equipment_id,p_decision,p_note); $$;
revoke all on function private.review_vehicle_special_equipment(uuid,text,text) from public,anon,authenticated;
revoke all on function public.review_vehicle_special_equipment(uuid,text,text) from public,anon;
grant execute on function public.review_vehicle_special_equipment(uuid,text,text) to authenticated;
