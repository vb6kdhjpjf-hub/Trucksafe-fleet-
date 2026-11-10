-- TruckSafe Fleet test-baseline trigger restoration.
-- TEST DATABASE ONLY. Run only after the reviewed schema snapshot has created
-- the public application tables and functions. Never run this script against Production.
-- The schema-only export already contains all 15 application-table triggers.
-- It omits only the custom auth.users trigger, restored below. No rows are copied.

CREATE TRIGGER on_auth_user_created_profile
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
