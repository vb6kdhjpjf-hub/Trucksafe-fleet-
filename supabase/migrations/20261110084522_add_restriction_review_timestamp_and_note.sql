-- Additional review metadata required before a restriction can be treated as verified.
alter table public.road_restrictions
  add column if not exists source_last_checked_at timestamptz,
  add column if not exists verification_note text,
  add column if not exists radius_m numeric not null default 75;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='road_restrictions_radius_check') then
    alter table public.road_restrictions add constraint road_restrictions_radius_check
      check (radius_m between 10 and 1000);
  end if;
  if not exists (select 1 from pg_constraint where conname='road_restrictions_verified_review_check') then
    alter table public.road_restrictions add constraint road_restrictions_verified_review_check
      check (
        verification_status <> 'verified'
        or (
          verified_at is not null
          and verified_by is not null
          and source_name is not null and btrim(source_name) <> ''
          and source_url is not null
          and source_last_checked_at is not null
          and verification_note is not null and btrim(verification_note) <> ''
        )
      );
  end if;
end $$;

comment on column public.road_restrictions.source_last_checked_at is 'Timestamp when a reviewer last checked the source and the restriction details.';
comment on column public.road_restrictions.verification_note is 'Required reviewer note explaining the verification decision.';
comment on column public.road_restrictions.radius_m is 'Proximity buffer in meters used when matching a route to a point restriction.';
