-- TruckSafe Fleet test-baseline trigger restoration.
-- TEST DATABASE ONLY. Run only after the reviewed schema snapshot has created
-- all application tables and functions. Never run this script against Production.
-- These definitions were read from the original database catalog; this script
-- creates triggers only and does not copy or modify application rows.

CREATE TRIGGER on_auth_user_created_profile
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

CREATE TRIGGER set_updated_at
BEFORE UPDATE ON public.drivers
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER add_fleet_owner_membership
AFTER INSERT ON public.fleets
FOR EACH ROW EXECUTE FUNCTION public.add_fleet_owner_membership();

CREATE TRIGGER set_updated_at
BEFORE UPDATE ON public.fleets
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER enforce_incident_resolution_before_write
BEFORE INSERT OR UPDATE ON public.incidents
FOR EACH ROW EXECUTE FUNCTION private.enforce_incident_resolution();

CREATE TRIGGER set_updated_at
BEFORE UPDATE ON public.incidents
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_updated_at
BEFORE UPDATE ON public.maintenance_records
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER guard_driver_task_update
BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.guard_driver_task_update();

CREATE TRIGGER reject_demo_vehicle_task_assignment
BEFORE INSERT OR UPDATE OF assigned_vehicle_id ON public.tasks
FOR EACH ROW EXECUTE FUNCTION private.reject_demo_vehicle_task_assignment();

CREATE TRIGGER set_updated_at
BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER guard_driver_trip_update
BEFORE UPDATE ON public.trips
FOR EACH ROW EXECUTE FUNCTION public.guard_driver_trip_update();

CREATE TRIGGER reject_demo_vehicle_trip
BEFORE INSERT OR UPDATE OF vehicle_id ON public.trips
FOR EACH ROW EXECUTE FUNCTION private.reject_demo_vehicle_trip();

CREATE TRIGGER set_updated_at
BEFORE UPDATE ON public.trips
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER guard_driver_vehicle_update
BEFORE UPDATE ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION public.guard_driver_vehicle_update();

CREATE TRIGGER set_updated_at
BEFORE UPDATE ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
