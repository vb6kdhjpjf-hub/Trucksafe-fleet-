CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA private;
CREATE TABLE public.fleets (id uuid PRIMARY KEY);
CREATE TABLE public.fleet_members (
  fleet_id uuid NOT NULL, user_id uuid NOT NULL, role text NOT NULL,
  PRIMARY KEY (fleet_id, user_id)
);
CREATE TABLE public.drivers (
  id uuid PRIMARY KEY, fleet_id uuid NOT NULL, status text NOT NULL, user_id uuid
);
CREATE TABLE public.vehicles (
  id uuid PRIMARY KEY, fleet_id uuid NOT NULL, registration_number text,
  status text NOT NULL, assigned_driver_id uuid, updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY, fleet_id uuid NOT NULL, assigned_driver_id uuid NOT NULL,
  assigned_vehicle_id uuid NOT NULL, status text NOT NULL, updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), fleet_id uuid NOT NULL,
  task_id uuid, driver_id uuid NOT NULL, vehicle_id uuid NOT NULL,
  status text NOT NULL, origin_address text, destination_address text,
  started_at timestamptz, ended_at timestamptz, updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), fleet_id uuid NOT NULL,
  trip_id uuid, vehicle_id uuid NOT NULL, driver_id uuid NOT NULL,
  inspection_type text NOT NULL, checklist jsonb NOT NULL, defects text,
  passed boolean NOT NULL, inspected_at timestamptz NOT NULL
);
CREATE TABLE public.incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), fleet_id uuid NOT NULL,
  driver_id uuid NOT NULL, vehicle_id uuid NOT NULL, severity text NOT NULL,
  incident_type text NOT NULL, description text NOT NULL, status text NOT NULL,
  reported_at timestamptz NOT NULL, created_by uuid NOT NULL
);
ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE FUNCTION private.has_fleet_role(target_fleet uuid, allowed_roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.fleet_members fm
    WHERE fm.fleet_id = target_fleet
      AND fm.user_id = auth.uid()
      AND fm.role = ANY(allowed_roles)
  )
$$;
CREATE FUNCTION private.is_fleet_member(target_fleet uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.fleet_members fm
    WHERE fm.fleet_id = target_fleet AND fm.user_id = auth.uid()
  )
$$;

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY vehicles_select_member
ON public.vehicles
FOR SELECT
TO authenticated
USING (private.is_fleet_member(fleet_id));
