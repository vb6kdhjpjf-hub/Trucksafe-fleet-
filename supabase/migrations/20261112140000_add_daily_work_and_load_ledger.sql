-- Daily truck work plans and an append-only, measured load ledger.
-- The earlier fleet-scoped migration defines these composite keys. Keep this
-- migration independently safe on Test environments where that migration has
-- not yet been applied, without changing row data.
create unique index if not exists vehicles_fleet_id_id_daily_work_key
  on public.vehicles(fleet_id,id);
create unique index if not exists drivers_fleet_id_id_daily_work_key
  on public.drivers(fleet_id,id);

-- Production rollout is intentionally not performed by this repository workflow.

create table public.daily_work_plans (
  id uuid primary key default gen_random_uuid(),
  fleet_id uuid not null references public.fleets(id) on delete cascade,
  work_date date not null,
  driver_id uuid not null,
  vehicle_id uuid not null,
  status text not null default 'planned'
    check (status in ('planned','active','completed','cancelled')),
  tare_weight_kg bigint not null check (tare_weight_kg > 0),
  registered_gross_limit_kg bigint not null,
  registered_axle_limit_kg bigint not null,
  current_gross_weight_kg bigint not null,
  current_heaviest_axle_kg bigint not null,
  load_revision integer not null default 0 check (load_revision >= 0),
  measurement_at timestamptz not null,
  measurement_source text not null
    check (measurement_source in ('weighbridge_ticket','certified_onboard_scale')),
  measurement_reference text not null check (length(btrim(measurement_reference)) > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_work_plans_fleet_id_id_key unique (fleet_id,id),
  constraint daily_work_plans_driver_same_fleet_fkey
    foreign key (fleet_id,driver_id) references public.drivers(fleet_id,id),
  constraint daily_work_plans_vehicle_same_fleet_fkey
    foreign key (fleet_id,vehicle_id) references public.vehicles(fleet_id,id),
  constraint daily_work_plans_weight_bounds_check
    check (
      registered_gross_limit_kg >= tare_weight_kg
      and current_gross_weight_kg between tare_weight_kg and registered_gross_limit_kg
      and registered_axle_limit_kg > 0
      and current_heaviest_axle_kg between 1 and registered_axle_limit_kg
      and current_heaviest_axle_kg <= current_gross_weight_kg
    )
);

create unique index daily_work_plans_one_active_vehicle_idx
  on public.daily_work_plans(fleet_id,vehicle_id)
  where status = 'active';
create unique index daily_work_plans_one_active_driver_idx
  on public.daily_work_plans(fleet_id,driver_id)
  where status = 'active';
create index daily_work_plans_fleet_date_idx
  on public.daily_work_plans(fleet_id,work_date,status);

create table public.daily_work_stops (
  id uuid primary key default gen_random_uuid(),
  fleet_id uuid not null,
  plan_id uuid not null,
  sequence_no integer not null check (sequence_no > 0),
  operation_kind text not null check (operation_kind in ('load','unload')),
  address text not null check (length(btrim(address)) > 0),
  planned_quantity_kg bigint not null check (planned_quantity_kg > 0),
  status text not null default 'pending'
    check (status in ('pending','completed','skipped')),
  actual_quantity_kg bigint,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_work_stops_plan_sequence_key unique (plan_id,sequence_no),
  constraint daily_work_stops_fleet_id_id_key unique (fleet_id,id),
  constraint daily_work_stops_plan_same_fleet_fkey
    foreign key (fleet_id,plan_id) references public.daily_work_plans(fleet_id,id) on delete cascade,
  constraint daily_work_stops_completion_check
    check (
      (status = 'completed' and actual_quantity_kg > 0 and completed_at is not null)
      or (status <> 'completed' and actual_quantity_kg is null and completed_at is null)
    )
);

create index daily_work_stops_plan_status_idx
  on public.daily_work_stops(plan_id,status,sequence_no);

create table public.daily_load_events (
  id uuid primary key default gen_random_uuid(),
  fleet_id uuid not null,
  plan_id uuid not null,
  stop_id uuid not null,
  event_key uuid not null,
  operation_kind text not null check (operation_kind in ('load','unload')),
  quantity_kg bigint not null check (quantity_kg > 0),
  previous_gross_weight_kg bigint not null,
  resulting_gross_weight_kg bigint not null,
  resulting_heaviest_axle_kg bigint not null,
  measured_at timestamptz not null,
  measurement_source text not null
    check (measurement_source in ('weighbridge_ticket','certified_onboard_scale')),
  measurement_reference text not null check (length(btrim(measurement_reference)) > 0),
  revision integer not null check (revision > 0),
  performed_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint daily_load_events_plan_event_key unique (plan_id,event_key),
  constraint daily_load_events_plan_revision_key unique (plan_id,revision),
  constraint daily_load_events_plan_same_fleet_fkey
    foreign key (fleet_id,plan_id) references public.daily_work_plans(fleet_id,id),
  constraint daily_load_events_stop_same_fleet_fkey
    foreign key (fleet_id,stop_id) references public.daily_work_stops(fleet_id,id)
);

create index daily_load_events_plan_created_idx
  on public.daily_load_events(plan_id,created_at);

create or replace function public.create_daily_work_plan(
  p_fleet_id uuid,p_work_date date,p_driver_id uuid,p_vehicle_id uuid,
  p_tare_weight_kg bigint,p_registered_gross_limit_kg bigint,p_registered_axle_limit_kg bigint,
  p_initial_gross_weight_kg bigint,p_initial_heaviest_axle_kg bigint,
  p_measurement_at timestamptz,p_measurement_source text,p_measurement_reference text,p_stops jsonb
)
returns uuid language plpgsql security definer set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_plan_id uuid;
  v_stop jsonb;
  v_sequence integer := 0;
  v_operation text;
  v_address text;
  v_quantity bigint;
  v_vehicle public.vehicles%rowtype;
  v_driver public.drivers%rowtype;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if not private.has_fleet_role(p_fleet_id,array['owner','fleet_manager','dispatcher']::text[]) then
    raise exception 'Only an authorized fleet manager may create a daily work plan';
  end if;
  if p_work_date is null or p_driver_id is null or p_vehicle_id is null then
    raise exception 'Work date, driver and vehicle are required';
  end if;

  select * into v_driver from public.drivers
  where id=p_driver_id and fleet_id=p_fleet_id;
  if not found or v_driver.status <> 'active' then
    raise exception 'The assigned driver is not active in this fleet';
  end if;
  select * into v_vehicle from public.vehicles
  where id=p_vehicle_id and fleet_id=p_fleet_id;
  if not found or v_vehicle.status not in ('available','assigned') then
    raise exception 'The selected vehicle is not available in this fleet';
  end if;
  if v_vehicle.registration_verification_status is distinct from 'verified'
     or v_vehicle.empty_weight_kg is null or v_vehicle.gross_weight_kg is null
     or v_vehicle.weight_per_axle_kg is null then
    raise exception 'Vehicle registration and all weight limits must be verified before planning';
  end if;
  if p_tare_weight_kg is distinct from v_vehicle.empty_weight_kg
     or p_registered_gross_limit_kg is distinct from v_vehicle.gross_weight_kg
     or p_registered_axle_limit_kg is distinct from v_vehicle.weight_per_axle_kg then
    raise exception 'Submitted vehicle limits do not match the verified registration profile';
  end if;
  if p_initial_gross_weight_kg is null
     or p_initial_gross_weight_kg < v_vehicle.empty_weight_kg
     or p_initial_gross_weight_kg > v_vehicle.gross_weight_kg
     or p_initial_heaviest_axle_kg is null or p_initial_heaviest_axle_kg <= 0
     or p_initial_heaviest_axle_kg > v_vehicle.weight_per_axle_kg
     or p_initial_heaviest_axle_kg > p_initial_gross_weight_kg then
    raise exception 'Initial measured weights exceed the verified vehicle limits';
  end if;
  if p_measurement_source is null or p_measurement_source not in ('weighbridge_ticket','certified_onboard_scale')
     or p_measurement_reference is null or length(btrim(p_measurement_reference))=0
     or p_measurement_at is null or p_measurement_at > now() + interval '5 minutes'
     or p_measurement_at < now() - interval '24 hours' then
    raise exception 'A recent, referenced initial gross and axle measurement is required';
  end if;
  if p_stops is null or jsonb_typeof(p_stops) <> 'array'
     or jsonb_array_length(p_stops) < 1 or jsonb_array_length(p_stops) > 30 then
    raise exception 'A daily plan must contain between 1 and 30 stops';
  end if;

  insert into public.daily_work_plans(
    fleet_id,work_date,driver_id,vehicle_id,status,tare_weight_kg,
    registered_gross_limit_kg,registered_axle_limit_kg,current_gross_weight_kg,
    current_heaviest_axle_kg,measurement_at,measurement_source,measurement_reference,created_by
  ) values (
    p_fleet_id,p_work_date,p_driver_id,p_vehicle_id,'planned',v_vehicle.empty_weight_kg,
    v_vehicle.gross_weight_kg,v_vehicle.weight_per_axle_kg,p_initial_gross_weight_kg,
    p_initial_heaviest_axle_kg,p_measurement_at,p_measurement_source,btrim(p_measurement_reference),v_actor
  ) returning id into v_plan_id;

  for v_stop in select value from jsonb_array_elements(p_stops)
  loop
    v_sequence := v_sequence + 1;
    v_operation := v_stop->>'operation_kind';
    v_address := btrim(coalesce(v_stop->>'address',''));
    begin
      v_quantity := (v_stop->>'planned_quantity_kg')::bigint;
    exception when others then
      raise exception 'Stop % has an invalid planned quantity',v_sequence;
    end;
    if v_operation is null or v_operation not in ('load','unload')
       or v_address='' or v_quantity is null or v_quantity<=0 then
      raise exception 'Stop % is missing a valid operation, address or quantity',v_sequence;
    end if;
    insert into public.daily_work_stops(fleet_id,plan_id,sequence_no,operation_kind,address,planned_quantity_kg)
    values(p_fleet_id,v_plan_id,v_sequence,v_operation,v_address,v_quantity);
  end loop;
  return v_plan_id;
end;
$function$;

revoke all on function public.create_daily_work_plan(uuid,date,uuid,uuid,bigint,bigint,bigint,bigint,bigint,timestamptz,text,text,jsonb) from public,anon;
grant execute on function public.create_daily_work_plan(uuid,date,uuid,uuid,bigint,bigint,bigint,bigint,bigint,timestamptz,text,text,jsonb) to authenticated;

create or replace function public.activate_daily_work_plan(p_fleet_id uuid,p_plan_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_plan public.daily_work_plans%rowtype;
  v_vehicle public.vehicles%rowtype;
  v_driver public.drivers%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.has_fleet_role(p_fleet_id,array['owner','fleet_manager','dispatcher']::text[]) then
    raise exception 'Only an authorized fleet manager may activate a daily work plan';
  end if;
  select * into v_plan from public.daily_work_plans
  where id=p_plan_id and fleet_id=p_fleet_id for update;
  if not found or v_plan.status <> 'planned' then
    raise exception 'Daily work plan is not available for activation';
  end if;
  select * into v_vehicle from public.vehicles
  where id=v_plan.vehicle_id and fleet_id=p_fleet_id for update;
  if not found or v_vehicle.status not in ('available','assigned')
     or v_vehicle.registration_verification_status is distinct from 'verified'
     or v_vehicle.empty_weight_kg is distinct from v_plan.tare_weight_kg
     or v_vehicle.gross_weight_kg is distinct from v_plan.registered_gross_limit_kg
     or v_vehicle.weight_per_axle_kg is distinct from v_plan.registered_axle_limit_kg then
    raise exception 'Vehicle is unavailable or its verified registration profile has changed';
  end if;
  select * into v_driver from public.drivers
  where id=v_plan.driver_id and fleet_id=p_fleet_id;
  if not found or v_driver.status <> 'active' then
    raise exception 'Assigned driver is no longer active';
  end if;
  if not exists(select 1 from public.daily_work_stops s where s.plan_id=p_plan_id and s.fleet_id=p_fleet_id) then
    raise exception 'Daily work plan has no stops';
  end if;
  update public.daily_work_plans set status='active',updated_at=now()
  where id=p_plan_id and fleet_id=p_fleet_id;
  return p_plan_id;
end;
$function$;

revoke all on function public.activate_daily_work_plan(uuid,uuid) from public,anon;
grant execute on function public.activate_daily_work_plan(uuid,uuid) to authenticated;

alter table public.daily_work_plans enable row level security;
alter table public.daily_work_stops enable row level security;
alter table public.daily_load_events enable row level security;

create policy daily_work_plans_select_member
on public.daily_work_plans for select to authenticated
using (
  private.has_fleet_role(fleet_id,array['owner','fleet_manager','dispatcher','safety_manager']::text[])
  or exists (
    select 1 from public.drivers d
    where d.id = daily_work_plans.driver_id
      and d.fleet_id = daily_work_plans.fleet_id
      and d.user_id = (select auth.uid())
  )
);

create policy daily_work_plans_insert_managers
on public.daily_work_plans for insert to authenticated
with check (
  private.has_fleet_role(fleet_id,array['owner','fleet_manager','dispatcher']::text[])
  and created_by = (select auth.uid())
  and status in ('planned','active')
);

create policy daily_work_plans_update_managers
on public.daily_work_plans for update to authenticated
using (private.has_fleet_role(fleet_id,array['owner','fleet_manager','dispatcher']::text[]))
with check (private.has_fleet_role(fleet_id,array['owner','fleet_manager','dispatcher']::text[]));

create policy daily_work_stops_select_member
on public.daily_work_stops for select to authenticated
using (
  private.has_fleet_role(fleet_id,array['owner','fleet_manager','dispatcher','safety_manager']::text[])
  or exists (
    select 1 from public.daily_work_plans p
    join public.drivers d on d.id=p.driver_id and d.fleet_id=p.fleet_id
    where p.id=daily_work_stops.plan_id and p.fleet_id=daily_work_stops.fleet_id
      and d.user_id=(select auth.uid())
  )
);

create policy daily_work_stops_insert_managers
on public.daily_work_stops for insert to authenticated
with check (private.has_fleet_role(fleet_id,array['owner','fleet_manager','dispatcher']::text[]));

create policy daily_work_stops_update_managers
on public.daily_work_stops for update to authenticated
using (private.has_fleet_role(fleet_id,array['owner','fleet_manager','dispatcher']::text[]))
with check (private.has_fleet_role(fleet_id,array['owner','fleet_manager','dispatcher']::text[]));

create policy daily_load_events_select_member
on public.daily_load_events for select to authenticated
using (
  private.has_fleet_role(fleet_id,array['owner','fleet_manager','dispatcher','safety_manager']::text[])
  or exists (
    select 1 from public.daily_work_plans p
    join public.drivers d on d.id=p.driver_id and d.fleet_id=p.fleet_id
    where p.id=daily_load_events.plan_id and p.fleet_id=daily_load_events.fleet_id
      and d.user_id=(select auth.uid())
  )
);

revoke all on public.daily_work_plans, public.daily_work_stops, public.daily_load_events from anon, authenticated;
grant select, insert, update on public.daily_work_plans, public.daily_work_stops to authenticated;
grant select on public.daily_load_events to authenticated;

create or replace function public.record_daily_load_operation(
  p_fleet_id uuid,
  p_plan_id uuid,
  p_stop_id uuid,
  p_event_key uuid,
  p_operation_kind text,
  p_quantity_kg bigint,
  p_measured_gross_weight_kg bigint,
  p_measured_heaviest_axle_kg bigint,
  p_measured_at timestamptz,
  p_measurement_source text,
  p_measurement_reference text,
  p_expected_revision integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_plan public.daily_work_plans%rowtype;
  v_stop public.daily_work_stops%rowtype;
  v_expected_gross bigint;
  v_next_revision integer;
  v_actor uuid := auth.uid();
  v_is_manager boolean;
  v_vehicle public.vehicles%rowtype;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if p_event_key is null or p_stop_id is null or p_plan_id is null or p_fleet_id is null then
    raise exception 'Missing daily load operation identifiers';
  end if;
  if p_operation_kind is null or p_operation_kind not in ('load','unload') or p_quantity_kg is null or p_quantity_kg <= 0 then
    raise exception 'Invalid loading or unloading quantity';
  end if;
  if p_measurement_source is null or p_measurement_source not in ('weighbridge_ticket','certified_onboard_scale')
     or p_measurement_reference is null or length(btrim(p_measurement_reference)) = 0
     or p_measured_at is null
     or p_measured_at > now() + interval '5 minutes'
     or p_measured_at < now() - interval '24 hours'
     or p_measured_gross_weight_kg is null or p_measured_heaviest_axle_kg is null then
    raise exception 'A recent, referenced gross and axle measurement is required';
  end if;

  v_is_manager := private.has_fleet_role(
    p_fleet_id,array['owner','fleet_manager','dispatcher']::text[]
  );

  select * into v_plan
  from public.daily_work_plans
  where id=p_plan_id and fleet_id=p_fleet_id
  for update;

  if not found then raise exception 'Daily work plan not found in this fleet'; end if;
  if not v_is_manager and not exists (
    select 1 from public.drivers d
    where d.id=v_plan.driver_id and d.fleet_id=p_fleet_id and d.user_id=v_actor
  ) then raise exception 'Only the assigned driver or an authorized fleet manager may record this stop'; end if;
  if v_plan.status <> 'active' then raise exception 'Daily work plan is not active'; end if;
  select * into v_vehicle from public.vehicles
  where id=v_plan.vehicle_id and fleet_id=p_fleet_id
  for update;
  if not found or v_vehicle.registration_verification_status is distinct from 'verified'
     or v_vehicle.empty_weight_kg is distinct from v_plan.tare_weight_kg
     or v_vehicle.gross_weight_kg is distinct from v_plan.registered_gross_limit_kg
     or v_vehicle.weight_per_axle_kg is distinct from v_plan.registered_axle_limit_kg then
    raise exception 'Vehicle registration or verified weight profile changed; stop load updates until re-verification';
  end if;

  if v_plan.load_revision <> p_expected_revision then raise exception 'Stale load revision'; end if;
  if exists (
    select 1 from public.daily_load_events
    where plan_id=p_plan_id and event_key=p_event_key
  ) then raise exception 'Duplicate load operation event'; end if;

  select * into v_stop
  from public.daily_work_stops
  where id=p_stop_id and fleet_id=p_fleet_id and plan_id=p_plan_id
  for update;
  if not found then raise exception 'Stop not found in this daily work plan'; end if;
  if v_stop.status <> 'pending' then raise exception 'Stop is already completed or unavailable'; end if;
  if v_stop.operation_kind <> p_operation_kind then raise exception 'Operation does not match the planned stop'; end if;
  if p_quantity_kg > v_stop.planned_quantity_kg then raise exception 'Actual quantity exceeds the planned stop quantity'; end if;

  v_expected_gross := v_plan.current_gross_weight_kg
    + case when p_operation_kind='load' then p_quantity_kg else -p_quantity_kg end;

  if v_expected_gross < v_plan.tare_weight_kg then raise exception 'Unloading exceeds the remaining cargo'; end if;
  if v_expected_gross > v_plan.registered_gross_limit_kg then raise exception 'Registered gross weight limit exceeded'; end if;
  if p_measured_gross_weight_kg <> v_expected_gross then raise exception 'Measured gross weight does not match the declared operation'; end if;
  if p_measured_heaviest_axle_kg <= 0
     or p_measured_heaviest_axle_kg > p_measured_gross_weight_kg
     or p_measured_heaviest_axle_kg > v_plan.registered_axle_limit_kg then
    raise exception 'Measured axle load exceeds the registered axle limit';
  end if;

  v_next_revision := v_plan.load_revision + 1;

  insert into public.daily_load_events(
    fleet_id,plan_id,stop_id,event_key,operation_kind,quantity_kg,
    previous_gross_weight_kg,resulting_gross_weight_kg,resulting_heaviest_axle_kg,
    measured_at,measurement_source,measurement_reference,revision,performed_by
  ) values (
    p_fleet_id,p_plan_id,p_stop_id,p_event_key,p_operation_kind,p_quantity_kg,
    v_plan.current_gross_weight_kg,p_measured_gross_weight_kg,p_measured_heaviest_axle_kg,
    p_measured_at,p_measurement_source,btrim(p_measurement_reference),v_next_revision,v_actor
  );

  update public.daily_work_plans
  set current_gross_weight_kg=p_measured_gross_weight_kg,
      current_heaviest_axle_kg=p_measured_heaviest_axle_kg,
      load_revision=v_next_revision,
      measurement_at=p_measured_at,
      measurement_source=p_measurement_source,
      measurement_reference=btrim(p_measurement_reference),
      updated_at=now()
  where id=p_plan_id and fleet_id=p_fleet_id;

  update public.daily_work_stops
  set status='completed',actual_quantity_kg=p_quantity_kg,completed_at=now(),updated_at=now()
  where id=p_stop_id and fleet_id=p_fleet_id;

  return jsonb_build_object(
    'plan_id',p_plan_id,
    'stop_id',p_stop_id,
    'load_revision',v_next_revision,
    'current_gross_weight_kg',p_measured_gross_weight_kg,
    'current_heaviest_axle_kg',p_measured_heaviest_axle_kg
  );
end;
$function$;

revoke all on function public.record_daily_load_operation(uuid,uuid,uuid,uuid,text,bigint,bigint,bigint,timestamptz,text,text,integer) from public, anon;
grant execute on function public.record_daily_load_operation(uuid,uuid,uuid,uuid,text,bigint,bigint,bigint,timestamptz,text,text,integer) to authenticated;

comment on table public.daily_work_plans is
  'One evolving daily work plan per truck and driver; current load is based on verified weighbridge or certified onboard readings.';
comment on table public.daily_work_stops is
  'Ordered daily pickup/unloading stops. Each stop is completed only by the transactional measured-load RPC.';
comment on table public.daily_load_events is
  'Append-only ledger of measured load changes; direct authenticated writes are revoked.';
