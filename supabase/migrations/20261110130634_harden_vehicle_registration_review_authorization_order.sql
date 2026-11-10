create or replace function private.review_vehicle_registration(
  p_vehicle_id uuid,
  p_decision text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_vehicle record;
  v_reviewer uuid := auth.uid();
  v_previous_role text := coalesce(current_setting('request.jwt.claim.role', true), 'authenticated');
  v_note text := btrim(coalesce(p_note, ''));
  v_status text;
  v_verified_at timestamptz;
begin
  if v_reviewer is null then
    raise exception 'נדרשת התחברות כדי לבדוק רישיון' using errcode = '28000';
  end if;

  if p_decision is null or p_decision not in ('verified', 'rejected') then
    raise exception 'החלטת בדיקה לא תקינה' using errcode = '22023';
  end if;

  if char_length(v_note) < 5 or char_length(v_note) > 1000 then
    raise exception 'יש להזין הערת בדיקה באורך 5 עד 1000 תווים' using errcode = '22023';
  end if;

  select v.id, v.fleet_id, v.is_demo, v.registration_document_path
    into v_vehicle
  from public.vehicles v
  where v.id = p_vehicle_id
  for update;

  if not found then
    raise exception 'הרכב לא נמצא' using errcode = 'P0002';
  end if;

  if not private.has_fleet_role(
    v_vehicle.fleet_id,
    array['owner','fleet_manager']::text[]
  ) then
    raise exception 'אין הרשאה לבצע בדיקת רישיון בצי זה' using errcode = '42501';
  end if;

  if coalesce(v_vehicle.is_demo, false) then
    raise exception 'לא ניתן לאשר רכב הדגמה' using errcode = '22023';
  end if;

  if v_vehicle.registration_document_path is null
     or v_vehicle.registration_document_path not like
       v_vehicle.fleet_id::text || '/' || p_vehicle_id::text || '/%' then
    raise exception 'לא נמצא מסמך רישוי תקין המשויך לרכב' using errcode = '22023';
  end if;

  perform set_config('request.jwt.claim.role', 'service_role', true);

  update public.vehicles
  set registration_verification_status = p_decision,
      registration_verified_at = case when p_decision = 'verified' then pg_catalog.now() else null end,
      registration_verified_by = v_reviewer,
      registration_verification_note = v_note
  where id = p_vehicle_id
  returning registration_verification_status, registration_verified_at
    into v_status, v_verified_at;

  perform set_config('request.jwt.claim.role', v_previous_role, true);

  return pg_catalog.jsonb_build_object(
    'vehicle_id', p_vehicle_id,
    'status', v_status,
    'verified_at', v_verified_at,
    'verified_by', v_reviewer,
    'note', v_note
  );
end;
$function$;
