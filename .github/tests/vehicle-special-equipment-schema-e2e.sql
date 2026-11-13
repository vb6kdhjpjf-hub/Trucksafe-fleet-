begin;
do $$
declare
  v_rls boolean;
  v_policies integer;
  v_fk boolean;
  v_unique boolean;
  v_trigger boolean;
  v_body_trigger boolean;
  v_guard_trigger boolean;
  v_public_definer boolean;
  v_public_rpc boolean;
  v_private_rpc boolean;
  v_anon_exec boolean;
  v_auth_exec boolean;
  v_search_path text[];
begin
  select c.relrowsecurity into v_rls
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname='vehicle_special_equipment';
  if coalesce(v_rls,false)=false then raise exception 'RLS is not enabled on vehicle_special_equipment'; end if;

  select count(*) into v_policies from pg_policies
  where schemaname='public' and tablename='vehicle_special_equipment'
    and policyname in ('vehicle_special_equipment_select_members','vehicle_special_equipment_insert_managers',
                       'vehicle_special_equipment_update_managers','vehicle_special_equipment_delete_managers');
  if v_policies<>4 then raise exception 'Expected four special-equipment RLS policies; found %',v_policies; end if;

  select exists(select 1 from pg_constraint where conrelid='public.vehicle_special_equipment'::regclass
    and conname='vehicle_special_equipment_vehicle_fleet_fkey' and contype='f') into v_fk;
  if not v_fk then raise exception 'Fleet-scoped composite vehicle foreign key is missing'; end if;

  select exists(select 1 from pg_constraint where conrelid='public.vehicle_special_equipment'::regclass
    and conname='vehicle_special_equipment_vehicle_unique' and contype='u') into v_unique;
  if not v_unique then raise exception 'One-profile-per-vehicle uniqueness is missing'; end if;

  select exists(select 1 from pg_trigger where tgrelid='public.vehicle_special_equipment'::regclass
    and tgname='trg_invalidate_special_equipment_evidence' and not tgisinternal) into v_trigger;
  if not v_trigger then raise exception 'Evidence invalidation trigger is missing'; end if;
  select exists(select 1 from pg_trigger where tgrelid='public.vehicle_special_equipment'::regclass and tgname='trg_guard_special_equipment_evidence_fields' and not tgisinternal) into v_guard_trigger;
  if not v_guard_trigger then raise exception 'Evidence privilege guard trigger is missing'; end if;

  select exists(select 1 from pg_trigger where tgrelid='public.vehicles'::regclass and tgname='trg_invalidate_special_equipment_on_body_change' and not tgisinternal) into v_body_trigger;
  if not v_body_trigger then raise exception 'Vehicle body-change invalidation trigger is missing'; end if;

  select p.prosecdef,p.proconfig into v_public_rpc,v_search_path
  from pg_proc p where p.oid='private.review_vehicle_special_equipment(uuid,text,text)'::regprocedure;
  if not v_public_rpc then raise exception 'Private review function must be SECURITY DEFINER'; end if;
  if not ('search_path=""' = any(coalesce(v_search_path,array[]::text[]))) then
    raise exception 'Private review function must use an empty search_path';
  end if;

  select p.prosecdef into v_public_definer from pg_proc p where p.oid='public.review_vehicle_special_equipment(uuid,text,text)'::regprocedure;
  if not v_public_definer then raise exception 'Public review wrapper must be SECURITY DEFINER'; end if;

  select has_function_privilege('anon','public.review_vehicle_special_equipment(uuid,text,text)','EXECUTE') into v_anon_exec;
  select has_function_privilege('authenticated','public.review_vehicle_special_equipment(uuid,text,text)','EXECUTE') into v_auth_exec;
  if v_anon_exec or not v_auth_exec then raise exception 'Review RPC execute grants are not least-privilege'; end if;

  raise notice 'PASS: special equipment schema, RLS, composite ownership, evidence invalidation, and review RPC security';
end $$;
rollback;
