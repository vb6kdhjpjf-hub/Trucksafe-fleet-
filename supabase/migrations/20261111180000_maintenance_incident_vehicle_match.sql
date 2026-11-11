-- Prevent maintenance records from linking an incident for a different vehicle.
-- NOT VALID preserves legacy rows for a separate audit while enforcing all new
-- inserts and updates immediately. Validate only after legacy mismatches are reviewed.

ALTER TABLE public.incidents
  ADD CONSTRAINT incidents_fleet_vehicle_id_key
  UNIQUE (fleet_id, vehicle_id, id);

ALTER TABLE public.maintenance_records
  DROP CONSTRAINT maintenance_records_incident_same_fleet_fkey,
  ADD CONSTRAINT maintenance_records_incident_same_vehicle_fkey
    FOREIGN KEY (fleet_id, vehicle_id, incident_id)
    REFERENCES public.incidents (fleet_id, vehicle_id, id)
    ON DELETE SET NULL (incident_id)
    NOT VALID;
