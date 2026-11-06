create or replace function private.reject_demo_vehicle_task_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assigned_vehicle_id is not null and exists (
    select 1
    from public.vehicles v
    where v.id = new.assigned_vehicle_id
      and v.fleet_id = new.fleet_id
      and v.is_demo = true
  ) then
    raise exception 'לא ניתן לשייך משימה לרכב הדגמה. יש לבחור רכב אמיתי.';
  end if;

  return new;
end;
$$;

revoke all on function private.reject_demo_vehicle_task_assignment() from public, anon, authenticated;

drop trigger if exists reject_demo_vehicle_task_assignment on public.tasks;
create trigger reject_demo_vehicle_task_assignment
before insert or update of assigned_vehicle_id on public.tasks
for each row execute function private.reject_demo_vehicle_task_assignment();
