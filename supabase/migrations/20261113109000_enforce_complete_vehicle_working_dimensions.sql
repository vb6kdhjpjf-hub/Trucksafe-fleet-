create or replace function private.review_vehicle_special_equipment(p_equipment_id uuid,p_decision text,p_note text)
returns jsonb language plpgsql security definer set search_path to ''
as $$
declare
 e record;
 reviewer uuid:=auth.uid();
 previous_role text:=coalesce(current_setting('request.jwt.claim.role',true),'authenticated');
 note_text text:=btrim(coalesce(p_note,''));
 status_text text;
 verified_at_value timestamptz;
 expected_kind text;
begin
 if reviewer is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if p_decision not in ('verified','rejected') then raise exception 'Invalid decision' using errcode='22023'; end if;
 if char_length(note_text)<5 or char_length(note_text)>1000 then raise exception 'Review note must be 5-1000 characters' using errcode='22023'; end if;
 select x.*,v.is_demo,v.body_type,v.registration_verification_status,v.registration_document_path
 into e from public.vehicle_special_equipment x join public.vehicles v on v.id=x.vehicle_id and v.fleet_id=x.fleet_id
 where x.id=p_equipment_id for update of x;
 if not found then raise exception 'Equipment profile not found' using errcode='P0002'; end if;
 if not private.has_fleet_role(e.fleet_id,array['owner','fleet_manager']::text[]) then raise exception 'Fleet manager required' using errcode='42501'; end if;
 if coalesce(e.is_demo,false) then raise exception 'Demo vehicles cannot be verified' using errcode='22023'; end if;
 if e.registration_verification_status<>'verified' or e.registration_document_path is null then raise exception 'Vehicle registration must be verified first' using errcode='22023'; end if;
 expected_kind:=case
  when e.body_type='aerial_platform' then 'aerial_platform'
  when e.body_type='concrete_pump' then 'concrete_pump'
  when e.body_type in ('articulated_crane','telescopic_crane','loader_crane','heavy_lift_crane','mobile_crane','recovery_crane') then 'crane'
  when e.body_type in ('other_special','low_loader') then 'other_special'
  else null end;
 if expected_kind is null or e.equipment_kind<>expected_kind then raise exception 'Equipment kind does not match vehicle body classification' using errcode='22023'; end if;
 if e.travel_height_cm is null or e.travel_height_cm not between 100 and 600
 or e.travel_width_cm is null or e.travel_width_cm not between 100 and 350
 or e.travel_length_cm is null or e.travel_length_cm not between 200 and 3000
 or nullif(btrim(e.axle_configuration),'') is null then
  raise exception 'Travel dimensions and axle configuration required and must be within supported bounds' using errcode='22023';
 end if;
 if e.equipment_kind in ('crane','aerial_platform','concrete_pump') then
  if e.lifting_chart_document_path is null
  or e.working_height_cm is null or e.working_height_cm not between 100 and 10000
  or e.working_width_cm is null or e.working_width_cm not between 100 and 10000
  or e.working_length_cm is null or e.working_length_cm not between 100 and 10000
  or e.max_outreach_cm is null or e.max_outreach_cm not between 0 and 100000
  or e.max_lifting_capacity_kg is null or e.max_lifting_capacity_kg not between 1 and 1000000 then
   raise exception 'Manufacturer chart and complete, bounded working data required' using errcode='22023';
  end if;
  if e.lifting_chart_document_path not like e.fleet_id::text||'/'||e.vehicle_id::text||'/%' then raise exception 'Lifting chart must belong to this vehicle folder' using errcode='22023'; end if;
  if not exists(select 1 from storage.objects o where o.bucket_id='vehicle-registrations' and o.name=e.lifting_chart_document_path and o.archived_at is null and coalesce(o.is_delete_marker,false)=false) then raise exception 'Lifting chart file missing from private storage' using errcode='22023'; end if;
 end if;
 perform set_config('request.jwt.claim.role','service_role',true);
 update public.vehicle_special_equipment set evidence_status=p_decision,evidence_verified_at=case when p_decision='verified' then pg_catalog.now() else null end,evidence_verified_by=reviewer,evidence_review_note=note_text where id=p_equipment_id returning evidence_status,evidence_verified_at into status_text,verified_at_value;
 perform set_config('request.jwt.claim.role',previous_role,true);
 return pg_catalog.jsonb_build_object('equipment_id',p_equipment_id,'status',status_text,'verified_at',verified_at_value,'verified_by',reviewer,'note',note_text);
end; $$;
