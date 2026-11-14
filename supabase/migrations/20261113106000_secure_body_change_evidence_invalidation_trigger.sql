create or replace function private.invalidate_special_equipment_on_body_change()
returns trigger language plpgsql security definer set search_path to ''
as $$
declare previous_role text:=coalesce(current_setting('request.jwt.claim.role',true),'authenticated');
begin
 perform set_config('request.jwt.claim.role','service_role',true);
 update public.vehicle_special_equipment
 set evidence_status='pending',evidence_verified_at=null,evidence_verified_by=null,evidence_review_note=null,updated_at=pg_catalog.now()
 where fleet_id=new.fleet_id and vehicle_id=new.id;
 perform set_config('request.jwt.claim.role',previous_role,true);
 return new;
end; $$;
