begin;
do $$
declare
  v_rls boolean;
  v_policies integer;
  v_fk boolean;
  v_unique boolean;
  v_trigger boolean;
  v_body_trigger boolean;
  v_body_trigger_definer boolean;
  v_body_trigger_config text[];
  v_body_trigger_anon_exec boolean;
  v_body_trigger_auth_exec boolean;
  v_guard_trigger boolean;
  v_public_definer boolean;
  v_private_exec boolean;
  v_wrapper_anon_exec boolean;
  v_wrapper_config text[];
  v_public_rpc boolean;
  v_private_rpc boolean;
  v_anon_exec boolean;
  v_auth_exec boolean;
  v_search_path text[];
  v_review_def text;
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
  select p.prosecdef,p.proconfig into v_body_trigger_definer,v_body_trigger_config from pg_proc p where p.oid='private.invalidate_special_equipment_on_body_change()'::regprocedure;
  if not v_body_trigger_definer or not ('search_path=""' = any(coalesce(v_body_trigger_config,array[]::text[]))) then raise exception 'Vehicle body-change invalidation must be a locked-down SECURITY DEFINER trigger'; end if;
  select has_function_privilege('anon','private.invalidate_special_equipment_on_body_change()','EXECUTE') into v_body_trigger_anon_exec;
  select has_function_privilege('authenticated','private.invalidate_special_equipment_on_body_change()','EXECUTE') into v_body_trigger_auth_exec;
  if v_body_trigger_anon_exec or v_body_trigger_auth_exec then raise exception 'Trigger-only SECURITY DEFINER function must not be directly executable'; end if;

  select p.prosecdef,p.proconfig into v_public_rpc,v_search_path
  from pg_proc p where p.oid='private.review_vehicle_special_equipment(uuid,text,text)'::regprocedure;
  if not v_public_rpc then raise exception 'Private review function must be SECURITY DEFINER'; end if;
  if not ('search_path=""' = any(coalesce(v_search_path,array[]::text[]))) then
    raise exception 'Private review function must use an empty search_path';
  end if;

  select has_function_privilege('authenticated','private.review_vehicle_special_equipment(uuid,text,text)','EXECUTE') into v_private_exec;
  if not v_private_exec then raise exception 'Authenticated role must execute the private RPC only through the unexposed private schema'; end if;

  select pg_get_functiondef('private.review_vehicle_special_equipment(uuid,text,text)'::regprocedure) into v_review_def;
  if position('low_loader' in v_review_def)=0 then raise exception 'Low-loader review gate is missing from the database RPC'; end if;
  if position('working_width_cm' in v_review_def)=0 or position('working_length_cm' in v_review_def)=0 then
    raise exception 'Review RPC must require all three working dimensions';
  end if;
  if position('not between 100 and 10000' in v_review_def)=0 then
    raise exception 'Review RPC must enforce working dimension bounds';
  end if;

  select p.prosecdef,p.proconfig into v_public_definer,v_wrapper_config
  from pg_proc p where p.oid='public.review_vehicle_special_equipment(uuid,text,text)'::regprocedure;
  if v_public_definer then raise exception 'Public wrapper must remain SECURITY INVOKER'; end if;
  if not ('search_path=""' = any(coalesce(v_wrapper_config,array[]::text[]))) then raise exception 'Public wrapper must use an empty search_path'; end if;

  select has_function_privilege('anon','public.review_vehicle_special_equipment(uuid,text,text)','EXECUTE') into v_wrapper_anon_exec;
  select has_function_privilege('authenticated','public.review_vehicle_special_equipment(uuid,text,text)','EXECUTE') into v_auth_exec;
  if v_wrapper_anon_exec or not v_auth_exec then raise exception 'Review RPC execute grants are not least-privilege'; end if;

  raise notice 'PASS: special equipment schema, RLS, composite ownership, evidence invalidation, and review RPC security';
end $$;
rollback;
