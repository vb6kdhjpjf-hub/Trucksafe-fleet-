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
