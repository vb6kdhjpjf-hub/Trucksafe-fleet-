-- Enforce the complete physical-survey contract at the database boundary.
-- The application validator remains a second layer; a verified height row
-- must not be persistable with incomplete survey or provenance fields.
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
      country_code = 'IL'
      and nullif(btrim(structure_id), '') is not null
      and char_length(structure_id) <= 200
      and nullif(btrim(road_segment_id), '') is not null
      and char_length(road_segment_id) <= 200
      and direction is not null
      and direction in ('forward', 'backward')
      and nullif(btrim(lane_id), '') is not null
      and char_length(lane_id) <= 100
      and passage_length_m is not null
      and passage_length_m > 0
      and passage_length_m <= 1000
      and max_height_m is not null
      and max_height_m between 0.5 and 20
      and measured_clearance_m is not null
      and measured_clearance_m between 0.5 and 20
      and measurement_date is not null
      and measurement_date <= (now() at time zone 'Asia/Jerusalem')::date
      and measurement_accuracy_cm is not null
      and measurement_accuracy_cm > 0
      and measurement_accuracy_cm <= 1
      and char_length(btrim(coalesce(measurement_method, ''))) between 3 and 200
      and char_length(btrim(coalesce(surveyor, ''))) between 2 and 200
      and char_length(btrim(coalesce(source_name, ''))) between 2 and 200
      and source_url is not null
      and source_url ~* '^https://[^[:space:]]+$'
      and measurement_document_url is not null
      and measurement_document_url ~* '^https://[^[:space:]]+$'
      and verified_at is not null
      and verified_by is not null
      and source_last_checked_at is not null
      and char_length(btrim(coalesce(verification_note, ''))) between 5 and 4000
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
      and jsonb_typeof(measurement_coverage) = 'object'
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
