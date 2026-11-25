# ArcGIS Bridge Candidate Review — Israel

Review date: 2026-11-11
Status: candidate-only; **not approved for routing or ingestion**

## Source inspected

ArcGIS REST service: `gsharim_blocks`
- Service: https://services3.arcgis.com/PcGFyTym9yKZBRgz/ArcGIS/rest/services/gsharim_blocks/FeatureServer
- Service description: detours and roadblocks for out-of-service bridges.
- Layers include roadblocks (0), bridge detours (1), bridge features (2), and several additional detour renderings/layers.
- Bridge layer (2): https://services3.arcgis.com/PcGFyTym9yKZBRgz/ArcGIS/rest/services/gsharim_blocks/FeatureServer/2
- Roadblock layer (0): https://services3.arcgis.com/PcGFyTym9yKZBRgz/ArcGIS/rest/services/gsharim_blocks/FeatureServer/0

## What the service actually contains

The bridge layer is a polyline feature layer with fields including:
- `STREET_NAM`
- `gesher_id`
- `shem` (name)
- `ktovet` (address)
- `sug` (type)
- `tipul_hasima` (closure treatment)
- geometry length

The roadblock layer is a point feature layer with `bridge_code` and `id_gesher`.

The inspected bridge-layer spatial extent is approximately X 176,227–183,924 and Y 660,357–671,620 in Israel Transverse Mercator. This is a small local-area extent, not nationwide coverage. The service metadata does not provide a trustworthy current-update timestamp, data steward, licence, or SLA in the inspected description.

## Suitability assessment

This is potentially useful as a local candidate source for identifying bridge assets and recorded roadblocks/detours. It is **not** a truck-height/weight restriction feed:
- No measured vertical clearance field was present in the inspected bridge-layer schema.
- No truck dimensions, gross/axle weight limits, lane-specific clearance, effective dates, or signed measurement records were exposed in the inspected schema.
- A bridge feature or detour/roadblock record does not establish that a particular truck can safely pass.
- The narrow spatial extent and unknown freshness/licensing prevent national or operational use.

## Decision

1. Keep this service in source-discovery documentation only.
2. Do not bulk-import it into `road_restrictions` or any production table.
3. Do not treat absence of a roadblock feature as evidence that a bridge is open or truck-safe.
4. Do not enable routing decisions from these layers.
5. Before any future staging-only evaluation, obtain the publisher/data-owner identity, geographic coverage, last-updated/change history, licence for commercial derived routing, and the authoritative meaning of `tipul_hasima`; compare sample features with current official road-owner records.
6. Any candidate records must remain unverified until a competent authority provides current, lane/direction-specific restriction evidence.

## Verification boundary

This review was metadata/schema inspection only. It did not download or import feature records, change any database, contact the publisher, modify routing, enable PTV/HERE, merge the draft PR, or deploy the application.
