# Delivery-proof Storage safety contract

Updated: 2026-11-25

This document describes the Test-validated access model for the private `delivery-proof-private` bucket. It is not a Production rollout approval.

## Bucket limits

- Private bucket; public reads are disabled.
- Only PNG, JPEG and WebP uploads are accepted.
- Maximum object size is 10 MiB.
- The application allows up to 8 photos and 40 MiB combined photo payload per delivery proof.
- The database RPC independently validates the stored MIME metadata and byte size, including the 10 MiB signature limit, each photo limit, and the 40 MiB aggregate photo limit.

## Access rules

Upload and read policies validate the exact fleet/shipment/stop folder path. Fleet owner, fleet manager and dispatcher roles may upload; an active assigned driver may also upload. Read access is available to the authorized fleet roles and active assigned driver.

The DELETE policy is deliberately narrower than upload/read:

- The object must belong to the current authenticated user (`storage.objects.owner_id = auth.uid()`).
- The path must resolve to an existing shipment and stop.
- The caller must still be an authorized owner/fleet manager/dispatcher or the active assigned driver.
- No row in `public.delivery_proofs` may reference the object as its signature or one of its photos.

This supports cleanup after a failed or ambiguous client submission without granting a general delete capability. An object already referenced by a proof remains undeletable by browser clients, including the uploader. The service-role key is never shipped to the browser.

## Client retry and cleanup

Each mounted proof attempt holds one idempotency key and stable object paths. The UI binds the attempt to the authenticated user who started it. If upload or the RPC fails, it attempts to delete only the uploaded paths and only while that same user remains signed in. If the server actually committed the proof but the response was lost, the DELETE policy sees the immutable proof reference and preserves the object. A retry reuses the same idempotency key and exact paths.

If the session changed or network access is unavailable, automatic cleanup may be skipped or fail; the UI reports that temporary files may remain. No broad client DELETE policy or client-side service-role credential is used.

## Test evidence

The dedicated Test Auth integration exercises signed driver and owner uploads, owner/driver signed reads, cross-fleet read/upload/delete denial, same-user deletion of an unreferenced upload, denial of deletion after a synthetic proof row references the signature/photo paths, PDF MIME rejection, over-10-MiB upload rejection, and exact cleanup of disposable fixtures.

The rollback-only SQL suite exercises actual delivery-document RPC validation, idempotency, immutable snapshots, authorized signature exceptions, aggregate limits, and shipment/cargo cascade behavior.

The tests target only the dedicated Supabase Test project. Production remains unchanged until a separate migration and rollout plan is reviewed and explicitly approved.
