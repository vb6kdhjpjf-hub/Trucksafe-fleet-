alter table public.vehicles
  add constraint vehicles_fleet_id_id_unique unique (fleet_id,id);
