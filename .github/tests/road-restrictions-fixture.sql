-- Minimal isolated schema for geospatial road restriction migration tests.
CREATE TABLE public.road_restrictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fleet_id uuid NOT NULL,
  road_name text NOT NULL,
  restriction_type text NOT NULL,
  direction text,
  max_height_m numeric,
  max_weight_t numeric,
  max_width_m numeric,
  max_length_m numeric,
  valid_from time,
  valid_until time,
  active_from date,
  active_until date,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.road_restrictions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.road_restrictions TO authenticated;

CREATE POLICY road_restrictions_select_member
ON public.road_restrictions FOR SELECT TO authenticated
USING (private.is_fleet_member(fleet_id));

CREATE POLICY road_restrictions_insert_managers
ON public.road_restrictions FOR INSERT TO authenticated
WITH CHECK (private.has_fleet_role(fleet_id, ARRAY['owner','fleet_manager','dispatcher']));

CREATE POLICY road_restrictions_update_managers
ON public.road_restrictions FOR UPDATE TO authenticated
USING (private.has_fleet_role(fleet_id, ARRAY['owner','fleet_manager','dispatcher']))
WITH CHECK (private.has_fleet_role(fleet_id, ARRAY['owner','fleet_manager','dispatcher']));

CREATE POLICY road_restrictions_delete_managers
ON public.road_restrictions FOR DELETE TO authenticated
USING (private.has_fleet_role(fleet_id, ARRAY['owner','fleet_manager','dispatcher']));
