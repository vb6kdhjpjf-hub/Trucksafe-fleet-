alter table public.vehicles
  add column if not exists is_demo boolean not null default false;

create or replace function private.reject_demo_vehicle_trip()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'לא ניתן לפתוח נסיעה ללא משתמש מחובר';
  end if;

  if exists (
    select 1
    from public.vehicles v
    where v.id = new.vehicle_id
      and v.fleet_id = new.fleet_id
      and v.is_demo = true
  ) then
    raise exception 'לא ניתן לפתוח נסיעה עם רכב הדגמה. יש לשייך רכב אמיתי עם מסמכים תקפים.';
  end if;

  return new;
end;
$$;

revoke all on function private.reject_demo_vehicle_trip() from public;
drop trigger if exists reject_demo_vehicle_trip on public.trips;
create trigger reject_demo_vehicle_trip
before insert or update of vehicle_id on public.trips
for each row execute function private.reject_demo_vehicle_trip();
