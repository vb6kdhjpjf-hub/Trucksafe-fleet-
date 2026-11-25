create or replace function private.invalidate_special_equipment_on_body_change()
returns trigger language plpgsql set search_path to ''
as $$
begin
 update public.vehicle_special_equipment
 set evidence_status='pending',evidence_verified_at=null,evidence_verified_by=null,evidence_review_note=null,updated_at=pg_catalog.now()
 where fleet_id=new.fleet_id and vehicle_id=new.id;
 return new;
end; $$;

drop trigger if exists trg_invalidate_special_equipment_on_body_change on public.vehicles;
create trigger trg_invalidate_special_equipment_on_body_change
after update of body_type on public.vehicles
for each row when (old.body_type is distinct from new.body_type)
execute function private.invalidate_special_equipment_on_body_change();

create or replace function public.review_vehicle_special_equipment(p_equipment_id uuid,p_decision text,p_note text)
returns jsonb language sql security definer set search_path to ''
as $$ select private.review_vehicle_special_equipment(p_equipment_id,p_decision,p_note); $$;
revoke all on function public.review_vehicle_special_equipment(uuid,text,text) from public,anon;
grant execute on function public.review_vehicle_special_equipment(uuid,text,text) to authenticated;
