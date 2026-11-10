alter table public.road_restrictions
  add column if not exists measured_clearance_m numeric,
  add column if not exists measurement_date date,
  add column if not exists measurement_accuracy_cm numeric,
  add column if not exists measurement_method text,
  add column if not exists measurement_location_note text,
  add column if not exists measurement_document_url text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='road_restrictions_measured_clearance_check') then
    alter table public.road_restrictions add constraint road_restrictions_measured_clearance_check
      check (measured_clearance_m is null or measured_clearance_m between 0.5 and 20);
  end if;
  if not exists (select 1 from pg_constraint where conname='road_restrictions_measurement_accuracy_check') then
    alter table public.road_restrictions add constraint road_restrictions_measurement_accuracy_check
      check (measurement_accuracy_cm is null or measurement_accuracy_cm between 0.1 and 10);
  end if;
  if not exists (select 1 from pg_constraint where conname='road_restrictions_measurement_doc_https_check') then
    alter table public.road_restrictions add constraint road_restrictions_measurement_doc_https_check
      check (measurement_document_url is null or measurement_document_url ~ '^https://');
  end if;
  if not exists (select 1 from pg_constraint where conname='road_restrictions_verified_height_measurement_check') then
    alter table public.road_restrictions add constraint road_restrictions_verified_height_measurement_check
      check (
        verification_status <> 'verified'
        or restriction_type <> 'height'
        or (
          measured_clearance_m is not null
          and max_height_m is not null
          and measurement_date is not null
          and measurement_date <= current_date
          and measurement_accuracy_cm is not null
          and measurement_accuracy_cm <= 1
          and coalesce(btrim(measurement_method),'') <> ''
          and length(coalesce(btrim(measurement_location_note),'')) >= 12
          and measurement_document_url is not null
          and measurement_document_url ~ '^https://'
          and measured_clearance_m - max_height_m between 0.20 and 0.29
        )
      );
  end if;
end $$;
