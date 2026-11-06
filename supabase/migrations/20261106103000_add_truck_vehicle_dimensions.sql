-- Persist truck dimensions so route calculations can use the vehicle's registered profile.
-- Existing fleet records remain nullable; no guessed dimensions are assigned.
alter table public.vehicles
  add column if not exists routing_vehicle_type text,
  add column if not exists height_cm numeric(6,1),
  add column if not exists width_cm numeric(6,1),
  add column if not exists length_cm numeric(7,1),
  add column if not exists gross_weight_kg numeric(10,1),
  add column if not exists axle_count integer,
  add column if not exists trailer_count integer not null default 0,
  add column if not exists weight_per_axle_kg numeric(10,1);

alter table public.vehicles
  add constraint vehicles_routing_vehicle_type_check check (routing_vehicle_type is null or routing_vehicle_type in ('StraightTruck','Tractor')),
  add constraint vehicles_height_cm_check check (height_cm is null or height_cm between 100 and 600),
  add constraint vehicles_width_cm_check check (width_cm is null or width_cm between 100 and 350),
  add constraint vehicles_length_cm_check check (length_cm is null or length_cm between 200 and 3000),
  add constraint vehicles_gross_weight_kg_check check (gross_weight_kg is null or gross_weight_kg between 1000 and 100000),
  add constraint vehicles_axle_count_check check (axle_count is null or axle_count between 2 and 12),
  add constraint vehicles_trailer_count_check check (trailer_count between 0 and 3),
  add constraint vehicles_weight_per_axle_kg_check check (weight_per_axle_kg is null or weight_per_axle_kg between 500 and 30000);

comment on column public.vehicles.height_cm is 'Total vehicle height in centimeters, including trailer/load where applicable; sourced from vehicle documents.';
comment on column public.vehicles.width_cm is 'Total vehicle width in centimeters.';
comment on column public.vehicles.length_cm is 'Total vehicle length in centimeters, including trailer.';
comment on column public.vehicles.gross_weight_kg is 'Maximum gross vehicle weight in kilograms from registration documents.';
comment on column public.vehicles.routing_vehicle_type is 'HERE Routing vehicle type: StraightTruck or Tractor.';
comment on column public.vehicles.trailer_count is 'Number of trailers used for routing profile.';
comment on column public.vehicles.axle_count is 'Total axle count used for truck restriction calculations.';
comment on column public.vehicles.weight_per_axle_kg is 'Maximum axle weight in kilograms when known.'
