# Israel POI source review — discovery only

**Review date:** 2026-11-17  
**Status:** preliminary source discovery; no source approved for ingestion  
**Scope:** public points of interest that may help truck drivers. This review does not authorize an importer, API, database table, map layer, subscription, or production use.

## Decision summary

| Candidate | What it can support | Important limits | Decision |
|---|---|---|---|
| Ministry of Energy — public fuel stations with coordinates | Candidate seed list for public fuel-station locations and operator/name/address fields | The dataset page labels the licence `Other (Open)`; capture and review the exact licence text/version and any dataset-specific override before reuse. The spatial file is dated 2025-12-01 and portal metadata says updated 2026-01-19. It does not establish current opening, diesel/AdBlue/high-flow availability, truck dimensions, safe entrance/exit, parking, or truck suitability. | **Candidate for legal/licence review and sample validation only** |
| Ministry of Energy — fuel station register by station number | Cross-check candidate station registration/legal listing | Portal page says updated 2026-11-04 but does not establish geospatial coverage or truck capabilities. Registration is not a statement that a station is currently operating in compliance with every legal requirement. | **Potential cross-check only; inspect file and licence** |
| Third-party ArcGIS layer labelled “Truck Stops” / “Truck_Stops_HEV” | None established for Israel | Layer metadata reports spatial reference WKID 2193, an extent in projected coordinates, no copyright text, and last data edit 2024-10-10. The coordinate system/extent appear inconsistent with Israel and require authoritative confirmation; no attribution/licence is shown in the retrieved metadata. | **Reject as an Israel source unless provenance and CRS are independently established** |

## Evidence reviewed

1. Ministry of Energy public fuel-station geospatial dataset:  
   https://data.gov.il/he/datasets/energy_and_water/gas-station  
   Dataset resource record:  
   https://data.gov.il/he/datasets/energy_and_water/gas-station/5537a0ef-3eeb-449c-90c8-51e27564f0cb

   The portal describes fields for station number, company, station name, address, municipality, projected coordinates and longitude/latitude. It shows 1,255 records and describes the resource as current to 2025-12-01, with portal metadata updated 2026-01-19. The catalogue licence label is “Other (Open)”. Do not treat this label alone as a complete licence review: retain the exact portal licence text/version and verify whether a dataset-specific licence overrides the general portal terms.

2. Ministry of Energy fuel-station register:  
   https://data.gov.il/he/datasets/energy_and_water/fuelstationbynumber  
   Official public-fuel-station registration page and caveat:  
   https://www.gov.il/he/Departments/DynamicCollectors/fuel_station

   The official page says the register includes public stations that meet the conditions for inclusion under the Fuel Market Law, and explicitly cautions that inclusion does not mean the station operates in accordance with every applicable legal requirement. The register is not evidence of truck access or services.

3. ArcGIS “Truck Stops” candidate layer:  
   https://services-ap1.arcgis.com/QaJdPXzRwexxPIrh/ArcGIS/rest/services/Truck_Stops_HEV/FeatureServer/0  
   Service metadata:  
   https://services-ap1.arcgis.com/QaJdPXzRwexxPIrh/arcgis/rest/services/Truck_Stops_HEV/FeatureServer

   Retrieved metadata reports WKID 2193, data last edited 2024-10-10, and blank copyright text. No Israel provenance, data owner, licence, attribution wording, or truck-stop verification process was established. Do not import or display it as Israeli coverage.

## Required approval gates before any source is used

A source may not be ingested until all applicable gates are recorded in a source-review record:

1. **Identity and provenance:** named publisher/operator, canonical source URL, stable dataset/resource identifier, contact/ownership evidence, and a reproducible sample.
2. **Licence:** exact licence text and version captured at review and at each extraction; dataset-specific terms checked for precedence; commercial redistribution, derivative works, caching, attribution, retention, and termination conditions explicitly reviewed. An “open” catalogue label alone is insufficient.
3. **Geospatial correctness:** coordinate reference system, axis order, units, Israel coverage, positional accuracy, duplicate handling, and sample points manually validated against authoritative references.
4. **Meaning and fitness:** precisely state what the source proves and what it does not. A fuel-station registry proves neither diesel availability nor truck access; a mapped point does not prove safe entry, exit, turning radius, clearance, parking, or vehicle suitability.
5. **Freshness:** publisher update cadence, observed source timestamp, extraction timestamp, change detection, stale-data policy, and retirement procedure.
6. **Operational rights:** API/download terms, rate limits, attribution placement, caching limits, permitted derived data, and service continuity.
7. **Security and privacy:** no driver identity/location data is sent to an unapproved provider; validate untrusted fields, constrain fetch destinations, and avoid arbitrary URL fetching.
8. **Truck suitability evidence:** separately sourced and time-bounded evidence for each claim (height, width, length, gross/axle weight, diesel/AdBlue, high-flow pumps, parking, showers, etc.). User reports are observations, not authoritative legal access evidence.
9. **Human sign-off:** source owner, reviewer, review date, decision, unresolved risks, and explicit approval before ingestion.

## Safe first pilot proposal (not authorized yet)

If the legal review confirms reuse rights, a future isolated pilot could evaluate only the Ministry of Energy geospatial fuel-station list as **unverified station-location candidates**. It must not label stations as truck-compatible or claim live services. The pilot would require a synthetic/test-only import plan, source attribution, duplicate and coordinate validation, and a human sample review before any app integration.

No actual download, bulk import, source connection, database change, map publication, provider subscription, or authority contact was performed as part of this review.

## Portal licence terms checked (2026-11-17)

The current general Data.gov.il terms page was reviewed: https://data.gov.il/he/terms-of-use (page states it was updated 2025-08-30). The general portal licence grants a worldwide, royalty-free, non-exclusive licence without a stated time limit, permits copying, distribution, public availability, technical changes, derivative works, and commercial or non-commercial use, and requires source attribution. It prohibits misleading presentation or falsification, unlawful use, privacy-harming use, and implying official endorsement. It also states that a dataset-specific licence, if attached, takes precedence over the general portal licence; third-party rights not owned/controlled by the portal are excluded; the data is provided “as is” without warranty, and official written government publications prevail in a conflict.

**Updated assessment:** the general portal terms provide a plausible reuse basis, including commercial use, but do not by themselves close the source-specific review for the fuel-station resource. Before ingestion, preserve the exact licence shown on that resource at extraction time and confirm that no dataset-specific terms or third-party rights override the general terms. Implement visible attribution and clear “unverified location data” labelling, and do not present the government as endorsing TruckSafe. No ingestion or production use is approved by this licence review.
