-- CHECK expressions that evaluate to NULL pass in PostgreSQL.
-- Explicit IS NOT NULL guards prevent incomplete evidence from being verified.
begin;
set local lock_timeout = '5s';

alter table public.road_restrictions
  drop constraint if exists road_restrictions_verified_lane_level_height_evidence_check;

alter table public.road_restrictions
  add constraint road_restrictions_verified_lane_level_height_evidence_check
  check (
    verification_status <> 'verified'
    or restriction_type <> 'height'
    or (
      nullif(btrim(structure_id), '') is not null
      and nullif(btrim(road_segment_id), '') is not null
      and nullif(btrim(lane_id), '') is not null
      and direction is not null
      and direction in ('forward', 'backward')
      and passage_length_m is not null
      and passage_length_m between 0.01 and 1000
      and nullif(btrim(surveyor), '') is not null
      and posted_clearance_status is not null
      and posted_clearance_status in ('posted', 'not_posted', 'unknown')
      and (
        (
          posted_clearance_status = 'posted'
          and posted_clearance_m is not null
          and posted_clearance_m between 0.5 and 20
        )
        or (
          posted_clearance_status in ('not_posted', 'unknown')
          and posted_clearance_m is null
        )
      )
      and measurement_coverage is not null
      and measurement_coverage ?& array[
        'both_sides_measured',
        'lane_center_measured',
        'left_edge_measured',
        'right_edge_measured',
        'hanging_installations_checked',
        'passage_center_measured'
      ]
      and measurement_coverage - array[
        'both_sides_measured',
        'lane_center_measured',
        'left_edge_measured',
        'right_edge_measured',
        'hanging_installations_checked',
        'passage_center_measured'
      ] = '{}'::jsonb
      and measurement_coverage -> 'both_sides_measured' = 'true'::jsonb
      and measurement_coverage -> 'lane_center_measured' = 'true'::jsonb
      and measurement_coverage -> 'left_edge_measured' = 'true'::jsonb
      and measurement_coverage -> 'right_edge_measured' = 'true'::jsonb
      and measurement_coverage -> 'hanging_installations_checked' = 'true'::jsonb
      and jsonb_typeof(measurement_coverage -> 'passage_center_measured') = 'boolean'
      and (
        passage_length_m <= 20
        or measurement_coverage -> 'passage_center_measured' = 'true'::jsonb
      )
    )
  );

commit;
