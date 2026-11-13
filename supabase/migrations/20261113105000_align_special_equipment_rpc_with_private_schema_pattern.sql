grant execute on function private.review_vehicle_special_equipment(uuid,text,text) to authenticated;
revoke all on function private.review_vehicle_special_equipment(uuid,text,text) from public,anon;
create or replace function public.review_vehicle_special_equipment(p_equipment_id uuid,p_decision text,p_note text)
returns jsonb language sql security invoker set search_path to ''
as $$ select private.review_vehicle_special_equipment(p_equipment_id,p_decision,p_note); $$;
revoke all on function public.review_vehicle_special_equipment(uuid,text,text) from public,anon;
grant execute on function public.review_vehicle_special_equipment(uuid,text,text) to authenticated;
