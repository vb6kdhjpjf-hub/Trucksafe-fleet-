-- Add lane- and direction-specific bridge survey evidence.
-- Existing rows are preserved; legacy height records without this evidence
-- remain stored but are rejected by the route evaluator until re-reviewed.
alter table public.road_restrictions
  add column if not exists structure_id text,
  add column if not exists road_segment_id text,
  add column if not exists lane_id text,
  add column if not exists passage_length_m numeric,
  add column if not exists surveyor text,
  add column if not exists posted_clearance_status text not null default 'unknown',
  add column if not exists posted_clearance_m numeric,
  add column if not exists measurement_coverage jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='road_restrictions_posted_clearance_status_check') then
    alter table public.road_restrictions add constraint road_restrictions_posted_clearance_status_check
      check (posted_clearance_status in ('posted','not_posted','unknown'));
  end if;
  if not exists (select 1 from pg_constraint where conname='road_restrictions_posted_clearance_value_check') then
    alter table public.road_restrictions add constraint road_restrictions_posted_clearance_value_check
      check ((posted_clearance_status='posted' and posted_clearance_m between 0.5 and 20)
        or (posted_clearance_status in ('not_posted','unknown') and posted_clearance_m is null));
  end if;
  if not exists (select 1 from pg_constraint where conname='road_restrictions_passage_length_check') then
    alter table public.road_restrictions add constraint road_restrictions_passage_length_check
      check (passage_length_m is null or passage_length_m between 0.1 and 1000);
  end if;
end $$;

create or replace function public.guard_road_restriction_lane_clearance_evidence()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, private, auth
as $$
declare
  evidence_changed boolean := false;
  coverage jsonb;
begin
  if TG_OP='UPDATE' then
    evidence_changed :=
      NEW.structure_id is distinct from OLD.structure_id
      or NEW.road_segment_id is distinct from OLD.road_segment_id
      or NEW.lane_id is distinct from OLD.lane_id
      or NEW.passage_length_m is distinct from OLD.passage_length_m
      or NEW.surveyor is distinct from OLD.surveyor
      or NEW.posted_clearance_status is distinct from OLD.posted_clearance_status
      or NEW.posted_clearance_m is distinct from OLD.posted_clearance_m
      or NEW.measurement_coverage is distinct from OLD.measurement_coverage;
    if OLD.verification_status='verified' and evidence_changed then
      if not private.has_fleet_role(NEW.fleet_id, ARRAY['owner','fleet_manager']::text[]) then
        raise exception 'Only fleet owners and fleet managers may change verified lane clearance evidence';
      end if;
      NEW.verification_status := 'unverified';
      NEW.verified_at := null;
      NEW.verified_by := null;
      NEW.source_last_checked_at := null;
      NEW.verification_note := null;
      NEW.verification_notes := null;
      return NEW;
    end if;
  end if;

  if NEW.restriction_type='height' and NEW.verification_status='verified'
     and (TG_OP='INSERT' or (TG_OP='UPDATE' and OLD.verification_status is distinct from 'verified')) then
    coverage := NEW.measurement_coverage;
    if coalesce(btrim(NEW.structure_id),'')=''
       or coalesce(btrim(NEW.road_segment_id),'')=''
       or coalesce(btrim(NEW.lane_id),'')=''
       or NEW.direction is null or NEW.direction not in ('forward','backward')
       or NEW.passage_length_m is null or NEW.passage_length_m<=0
       or coalesce(btrim(NEW.surveyor),'')=''
       or NEW.measured_clearance_m is null
       or NEW.measurement_date is null or NEW.measurement_date>current_date
       or NEW.measurement_accuracy_cm is null or NEW.measurement_accuracy_cm<=0 or NEW.measurement_accuracy_cm>1
       or coalesce(btrim(NEW.measurement_method),'')=''
       or NEW.measurement_document_url is null or NEW.measurement_document_url !~ '^https://'
       or NEW.source_name is null or btrim(NEW.source_name)=''
       or NEW.source_url is null or NEW.source_url !~ '^https://'
       or coverage is null or jsonb_typeof(coverage) is distinct from 'object'
       or (coverage->>'both_sides_measured') is distinct from 'true'
       or (coverage->>'lane_center_measured') is distinct from 'true'
       or (coverage->>'left_edge_measured') is distinct from 'true'
       or (coverage->>'right_edge_measured') is distinct from 'true'
       or (coverage->>'hanging_installations_checked') is distinct from 'true'
       or (NEW.passage_length_m>20 and (coverage->>'passage_center_measured') is distinct from 'true')
       or jsonb_typeof(coverage->'passage_center_measured') is distinct from 'boolean' then
      raise exception 'Height verification requires complete lane-specific physical survey evidence';
    end if;
    if NEW.posted_clearance_status='posted' and NEW.posted_clearance_m is null then
      raise exception 'Posted clearance must be stored separately from measured physical clearance';
    end if;
    if NEW.posted_clearance_status in ('not_posted','unknown') and NEW.posted_clearance_m is not null then
      raise exception 'Posted clearance value must be null when signage is absent or unknown';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists zzz_road_restrictions_lane_clearance_guard on public.road_restrictions;
create trigger zzz_road_restrictions_lane_clearance_guard
before insert or update on public.road_restrictions
for each row execute function public.guard_road_restriction_lane_clearance_evidence();

comment on column public.road_restrictions.measured_clearance_m is
  'Physical measured clearance for this exact lane and direction; not the posted sign value.';
comment on column public.road_restrictions.posted_clearance_m is
  'Clearance value displayed on signage, stored separately from physical measured clearance.';
comment on column public.road_restrictions.measurement_coverage is
  'Survey coverage checklist: both sides, lane centre, left/right edges, hanging installations, and centre of passages longer than 20m.';
