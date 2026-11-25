# Local Supabase migration baseline blocker

Verified 23 November 2026 with the repository-pinned Supabase CLI 3.3.0 and PostgreSQL 17.

A fresh local Supabase stack started its PostgreSQL, Auth, and Storage services, but migration replay stopped at the first tracked migration, 20261108120000_add_geospatial_road_restrictions.sql, because public.road_restrictions does not exist. No tracked migration creates that table or the core fleet baseline tables. The tracked migration chain therefore assumes a schema provisioned outside the repository.

The dedicated Test project's supabase_migrations.schema_migrations history also differs from the 46 migration files in the branch. For example, Test records version 20261108193434 for add_geospatial_road_restrictions, while the branch's first file is 20261108120000_add_geospatial_road_restrictions.

Do not repair remote migration history, synthesize a baseline from the post-migration schema, or apply a workaround permanently to Test or Production. Before relying on supabase db reset or adding a new schema migration, establish a reviewed baseline from an authoritative pre-migration schema snapshot and reconcile the version/history mapping.

Until that prerequisite is resolved, validate any incremental SQL only in an explicitly rollback-only transaction against the dedicated Test project (or a separately provisioned disposable project). Production remains out of scope.
