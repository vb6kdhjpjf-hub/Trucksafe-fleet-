CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA private;
CREATE TABLE public.fleets (id uuid PRIMARY KEY);
CREATE TABLE public.drivers (
  id uuid PRIMARY KEY, fleet_id uuid NOT NULL, status text NOT NULL, user_id uuid
);
CREATE TABLE public.vehicles (
  id uuid PRIMARY KEY, fleet_id uuid NOT NULL, status text NOT NULL,
  assigned_driver_id uuid, updated_at timestamptz DEFAULT now()
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
CREATE FUNCTION private.has_fleet_role(p_fleet_id uuid, p_roles text[])
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('test.is_manager', true), 'false') = 'true'
$$;
CREATE FUNCTION private.is_fleet_member(p_fleet_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
