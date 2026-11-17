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


## Follow-up register and legal-status check (2026-11-17)

The resource page for the Ministry of Energy register by station number (https://data.gov.il/he/datasets/energy_and_water/fuelstationbynumber) currently displays “לא צויין” for its licence field and identifies the file as the Ministry's list of registered public fuel stations, updated 2026-11-04. This is not a licence approval. Do not reuse or redistribute this register until its applicable terms are identified and recorded.

The Ministry's public register page (https://www.gov.il/he/Departments/DynamicCollectors/fuel_station) explains that listed public stations meet the statutory conditions for inclusion in the register, but expressly says listing does not establish that a station operates in accordance with every applicable legal requirement. Therefore, even after lawful reuse is confirmed, this register can serve only as a registration/listing cross-check. It cannot be displayed as proof of current operation, business licensing compliance, truck access, available fuel types, high-flow pumps, parking, or safe truck manoeuvring.

**Current source decision remains unchanged:** neither Ministry dataset is approved for ingestion. The geospatial dataset remains a candidate for legal review and sample validation only; the station-number register remains a potential cross-check only, with its licence unresolved. No file was downloaded or imported, and no database, map, provider, or production system was changed.


## Additional parking and rest-facility candidates checked (2026-11-17)

### Ministry of Transport — existing bus terminals and infrastructure facilities

Official resource: https://data.gov.il/he/datasets/ministry_of_transport/bus_terminal_fcl

The Data.gov.il resource page identifies the publisher as the Ministry of Transport and Road Safety, lists Creative Commons Attribution, and shows a resource update date of 2026-07-12. Its description is specifically infrastructure for **public bus transportation**. The published catalogue summary reports 296 facilities and 14,813 bus parking positions; associated attributes include bus-terminal operations, bus overnight parking, driver rooms and public toilets.

**Decision: not a truck-parking source.** The licence appears reusable subject to CC BY attribution, but the facility type and parking positions are explicitly bus-oriented. Nothing reviewed establishes truck access, truck-sized bays, turning geometry, overnight truck permission, security, or compatibility with any TruckSafe vehicle profile. Do not relabel these records as truck stops or truck parking. At most, a future separately approved research layer could retain them as bus-only facilities, clearly separated from truck POIs.

### Survey of Israel / ArcGIS — “מגרשי חניה” parking lots

Catalogue page reviewed: https://data-israeldata.opendata.arcgis.com/datasets/47e920790e1f49a1a1768e72dfab80ac_0/about

The catalogue metadata reports 5,826 records, data last updated 2018-05-17, and **No License Provided**. Its “Authoritative” catalogue label does not resolve ownership, reuse permission, currentness, or truck suitability.

**Decision: reject for ingestion and display** until the data owner supplies explicit reuse terms and a currentness assessment. The age and missing licence are independent blockers; a generic parking-lot point would not prove truck capacity or safe manoeuvring.

### Source-search conclusion

No reviewed source in this follow-up qualifies as a validated national truck-parking/rest-area feed. The bus-terminal layer is a licensed bus-infrastructure dataset, not a truck dataset; the general parking-lot layer has no provided licence and is stale. Keep the TruckSafe truck-parking category empty of purportedly verified national coverage until a suitable, licensed source and truck-specific evidence are established. No files were downloaded, no data imported, and no database or map changed.


## Operator-published truck-stop candidates on Highway 6 (2026-11-17)

This review found two stronger, operator-published candidate sources. They are suitable for a narrowly scoped, human-verified pilot proposal, but not yet for automatic nationwide ingestion or live truck-routing decisions.

### Derech Eretz / Kvish 6 — fuel and service centres at Naan and Magal

Operator information page: https://www.kvish6.co.il/ContentPage.aspx?Id=125

The road operator's current public page lists four Dor Alon fuel stations along Highway 6: two at Naan, between Nesherim and Sorek interchanges (one on each side), and two at Magal, between Nitzanei Oz and Baqa interchanges (one on each side). The operator describes each as including a commercial service centre, a truck-weighing area, and a rest/recreation area.

**Evidence classification:** operator-published location/amenity claims for four service-centre candidates. This is materially stronger than a generic parking-lot point, but the page does not identify exact coordinates or entrance geometry, current parking capacity, diesel/AdBlue/high-flow availability, overnight permission, truck dimensions accepted, opening hours, or live occupancy. Do not infer these fields. Preserve the operator page URL and observation timestamp if a later approved pilot is undertaken. Confirm current station identity and access before routing a specific truck.

### TransIsrael — two southern Highway 6 rest lay-bys

Official project page: https://www.transisrael.co.il/Project?projectID=64

TransIsrael states that two southern rest lay-bys have opened, while two central-section rest lay-bys remain planned. The page describes a rest lay-by as approximately 1 km long and specifies a design mix of approximately five truck spaces, three bus spaces and eight private-vehicle spaces, alongside accessible and EV spaces and planned/associated driver facilities. A May 7, 2026 report of the Ministry of Transport / TransIsrael opening announcement locates the two southern facilities between Sorek interchange and Kiryat Gat and says they include designated truck parking: https://www.rashuiot.co.il/html5/ARCLookup.taf?G=8702&SM=&_ID=75878&_function=details&did=1118

**Evidence classification:** strong evidence that two truck-capable rest lay-bys were opened in the southern Highway 6 corridor. The official page does not provide a machine-readable coordinate or exact entrance/exit geometry in the reviewed content. The five truck spaces are a published design description, not a live occupancy feed or guarantee of an available space. Do not create map pins from guessed mileposts or image captions. Before any pilot record, obtain exact location/chainage and travel-direction access from an authoritative operator source, verify present operating status, and record vehicle-size limits and facilities separately.

### Implementation decision

These operator sources are the best current leads found in this review for an initial Highway 6 pilot. They justify a source-validation work item, not immediate import. No licence for bulk extraction or redistribution was established from these operator webpages; treat them as human-review leads until written/explicit reuse terms, permitted refresh method, attribution, and caching conditions are confirmed. No authority or operator was contacted, no data was downloaded, no POI was imported, and no map or database was changed.
