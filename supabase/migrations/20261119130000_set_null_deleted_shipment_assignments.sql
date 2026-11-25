-- Deleting a driver or vehicle must safely unassign planned shipments,
-- not block fleet cleanup or leave dangling assignment references.
alter table public.shipments
  drop constraint if exists shipments_driver_same_fleet_fkey,
  drop constraint if exists shipments_vehicle_same_fleet_fkey;

alter table public.shipments
  add constraint shipments_driver_same_fleet_fkey
    foreign key (fleet_id, assigned_driver_id)
    references public.drivers (fleet_id, id)
    on delete set null (assigned_driver_id),
  add constraint shipments_vehicle_same_fleet_fkey
    foreign key (fleet_id, assigned_vehicle_id)
    references public.vehicles (fleet_id, id)
    on delete set null (assigned_vehicle_id);
