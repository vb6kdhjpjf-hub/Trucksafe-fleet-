-- Protect verified road restrictions from deletion by ordinary fleet users.
-- Unverified rows remain subject to the existing fleet-manager RLS delete policy.
create or replace function private.guard_verified_road_restriction_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.verification_status = 'verified'
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Road restriction verification requires trusted administrative review';
  end if;
  return old;
end;
$$;

revoke all on function private.guard_verified_road_restriction_delete() from public, anon, authenticated;

drop trigger if exists road_restrictions_guard_verified_delete on public.road_restrictions;
create trigger road_restrictions_guard_verified_delete
before delete on public.road_restrictions
for each row execute function private.guard_verified_road_restriction_delete();
