-- Permit a caller to clean up only the proof objects they uploaded,
-- and only while no immutable delivery proof references those objects.
-- This handles failed/ambiguous client submissions without a broad DELETE grant.
create policy delivery_proof_objects_delete_own_unreferenced
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'delivery-proof-private'
  and cardinality(string_to_array(name, '/')) = 4
  and owner_id = (select auth.uid())::text
  and exists (
    select 1
    from public.shipments s
    join public.shipment_stops st
      on st.fleet_id = s.fleet_id
     and st.shipment_id = s.id
     and st.id::text = split_part(name, '/', 3)
    where s.fleet_id::text = split_part(name, '/', 1)
      and s.id::text = split_part(name, '/', 2)
      and (
        private.has_fleet_role(
          s.fleet_id,
          array['owner', 'fleet_manager', 'dispatcher']::text[]
        )
        or private.is_active_assigned_fleet_driver(
          s.fleet_id,
          s.assigned_driver_id
        )
      )
  )
  and not exists (
    select 1
    from public.delivery_proofs p
    where p.signature_object_path = name
       or name = any(p.photo_object_paths)
  )
);
