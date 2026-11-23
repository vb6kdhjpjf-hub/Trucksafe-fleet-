# Route assessment and atomic trip-start contract

Status: implementation specification; not an operational routing approval. No provider is selected, enabled, or called by this document.

## Safety boundary

A provider route is not proof of truck safety. The current provider and nationwide restriction-coverage gates remain closed. Until both are independently approved, the system must not create an assessment in an operationally approvable state and must not permit a trip-start operation that claims route approval.

This contract is deliberately separate from the planned-route adapter contract. It defines how a future, approved route assessment becomes bound to one trip-start transaction.

## Proposed data model

Use a non-exposed `private` schema table, provisionally `private.route_assessments`. Confirm the repository's actual schema, naming conventions, grants, and migration history before writing a migration. Do not create this table directly in a hosted database.

Minimum fields:

- `id uuid primary key`
- `fleet_id`, `task_id`, `driver_id`, `vehicle_id` (all required and fleet-bound)
- `trailer_ids uuid[]` in canonical, stable order; empty only when the verified vehicle profile establishes no trailer
- `status` constrained to `draft`, `evaluated`, `approved_for_trip`, `consumed`, `rejected`, `expired`, `invalidated`, `superseded`
- `snapshot_version`, `snapshot jsonb`, `snapshot_sha256`
- `provider_id`, `provider_route_id`, `route_fetched_at`, `route_geometry_sha256`
- ¶»§q«^