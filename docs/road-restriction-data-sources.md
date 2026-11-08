# Israeli road-restriction data sources and ingestion policy

Last reviewed: 2026-11-08

## Operational rule

A map layer is not automatically a legal truck restriction feed. Do not create an enforced restriction from a bridge marker, road-authority boundary, planned infrastructure layer, map symbol, or free-text note unless the source explicitly supplies the restriction, its legal/operational authority, location, direction, applicability, and effective dates.

All imported records start as `unverified`. A source URL, data download, or successful geospatial parse is not proof of legal accuracy. Only a separate trusted review process may promote a record to `verified`.

## Reviewed sources

| Source | What it contains | Freshness / limits | Permitted use |
|---|---|---|---|
| [Ministry of Transport – Road Authority (data.gov.il)](https://data.gov.il/he/datasets/ministry_of_transport/roadauthority) | Road segments where traffic-signing authority has been delegated to a body other than the municipality | Catalog page last updated 22 July 2026; update cadence is not stated. It identifies jurisdiction, not bridge clearance or truck weight limits. | Authority/jurisdiction lookup only; never infer a restriction from it. |
| [Ministry of Transport – Level Separations (data.gov.il)](https://data.gov.il/he/datasets/ministry_of_transport/levelseparation) | Locations/names of road–rail grade separations and their maintenance bodies | Dataset last updated 30 June 2024; not a current inventory of road height/weight limits. | Context and asset discovery only. A bridge point is not a clearance measurement. |
| [Ministry of Transport – Hatzav GIS](https://geo.mot.gov.il/) | Aggregated transport-planning GIS layers from infrastructure companies, ministries, public bodies and municipalities | Update frequency varies by layer. The Ministry says the information is not binding legal information. | Discovery and cross-checking only; preserve layer metadata and date. |
| [Guidelines for traffic arrangements near height obstacles (April 2026)](https://www.gov.il/BlobFolder/policy/traffic_height_obstacle/he/Guidelines-for-height-obstacles-2026.pdf) | Engineering/traffic-arrangement guidance for height obstacles | Guidance document, not a live nationwide obstacle inventory or machine-readable legal restriction feed. | Reviewer checklist and data-capture procedure only. |
| [Tel Aviv GIS – Road works layer 852](https://gisn.tel-aviv.gov.il/ArcGIS/rest/services/IView2____test/MapServer/852) | Polyline extents of road works/events that affect traffic, with descriptions and dates | Municipal coverage only; not nationwide. | Possible future local temporary-works adapter after checking field definitions, licence, freshness and service stability. |
| [Bridge roadblocks ArcGIS layer](https://services3.arcgis.com/PcGFyTym9yKZBRgz/ArcGIS/rest/services/gsharim_blocks/FeatureServer/0) | Bridge-related roadblock point layer | Old/limited coverage and no published clearance/weight values in the layer description. | Discovery only; not a safe restriction feed. |

## Required fields before automated enforcement

A feed must provide:
- Stable source record ID and source organization.
- Geometry that can be matched to the road network (prefer road segment/line or a surveyed point with a defensible radius).
- Restriction type and explicit numeric limit with units.
- Direction / affected carriageway and vehicle applicability.
- Start/end date and time, including timezone and recurring schedule semantics.
- Publication/update timestamp, source URL, legal or operational basis, and withdrawal/cancellation semantics.
- A documented update cadence and a way to detect stale or withdrawn records.

If any required field is absent, keep the record as an unverified candidate or reject it. Never guess coordinates, units, limits, direction or expiry.

## Proposed source onboarding

1. Obtain written confirmation of API/download availability, licence, update cadence and permitted commercial use from the Ministry of Transport, Netivei Israel and relevant local authorities.
2. Pilot one bounded geography (Migdal/Tiberias and adjoining routes) only after a source supplies actual restriction attributes.
3. Import to a staging/candidate table with raw source payload and checksum; do not write directly to the enforced fleet table.
4. Compare a sample against signed traffic orders / field signage and have an authorized reviewer approve it.
5. Monitor freshness and automatically expire stale temporary records; do not keep them active indefinitely.
6. Expand only after measured completeness, false-negative testing and written approval.

## HERE integration

HERE currently lists Israel under full truck-restriction data coverage, with the caveat that very small local roads may be exceptions and routes can still be calculated where truck-restriction data is unavailable. A successful HERE response is therefore not proof of complete local coverage. TruckSafe must keep its own provenance/validation status and treat critical notices as a hard stop.

Official docs:
- [Truck-routing country coverage](https://docs.here.com/routing/docs/routing-v8-truck-routing-coverage)
- [Truck-routing restrictions and vehicle properties](https://docs.here.com/routing/docs/routing-v8-truck-routing)
- [Vehicle properties and trailer dimensions](https://docs.here.com/routing/docs/routing-v8-vehicle-properties)

No paid HERE request or external data subscription was activated as part of this review.


## Reviewer-only verification function (prepared, not deployed)

The source code is in `supabase/functions/verify-road-restriction/index.ts`. It is intentionally disabled until a controlled deployment is approved.

Required Edge Function secrets:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side secret only; never expose to the browser)
- `TRUCK_RESTRICTION_REVIEWER_IDS` (comma-separated UUID allowlist; empty means disabled)
- `TRUCK_RESTRICTION_ALLOWED_SOURCE_HOSTS` (comma-separated exact hostnames; empty means disabled)

The function verifies the caller's Supabase JWT, checks the reviewer UUID allowlist, requires explicit source and field-check confirmations plus a written review note, validates the source hostname and restriction fields, then writes the verification timestamp/reviewer/audit note using the service role. It refuses re-verification of already verified rows; those need a separate controlled correction workflow.

Do not deploy the function or set reviewer IDs until the organization has formally appointed reviewers and approved the source-host allowlist.
