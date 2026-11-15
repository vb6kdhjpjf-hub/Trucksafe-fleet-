create or replace function private.guard_special_equipment_evidence_fields()
returns trigger language plpgsql set search_path to ''
as $$
declare caller_role text:=coalesce(current_setting('request.jwt.claim.role',true),'authenticated');
begin
 if tg_op='INSERT' then
  if new.evidence_status<>'pending' or new.evidence_verified_at is not null or new.evidence_verified_by is not null or new.evidence_review_note is not null then
   raise exception 'Evidence status can only be assigned by the review RPC' using errcode='42501';
  end if;
 elsif row(new.evidence_status,new.evidence_verified_at,new.evidence_verified_by,new.evidence_review_note)
       is distinct from row(old.evidence_status,old.evidence_verified_at,old.evidence_verified_by,old.evidence_review_note)
       and caller_role<>'service_role' then
  raise exception 'Evidence status can only be assigned by the review RPC' using errcode='42501';
 end if;
 return new;
end; $$;
drop trigger if exists trg_guard_special_equipment_evidence_fields on public.vehicle_special_equipment;
create trigger trg_guard_special_equipment_evidence_fields
before insert or update on public.vehicle_special_equipment
for each row execute function private.guard_special_equipment_evidence_fields();
