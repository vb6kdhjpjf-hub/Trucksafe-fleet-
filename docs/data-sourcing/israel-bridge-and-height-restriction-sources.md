# Israel Bridge and Height-Restriction Data Sources

Status: source discovery / acquisition plan  
Last reviewed: 2026-11-12  
Safety rule: **none of the sources listed here is currently approved as a verified, routing-blocking restriction feed.**

## 1. What we know

### Ministry of Transport – road-safety infrastructure layer specification
- Official page: https://www.gov.il/he/pages/30_12_2025
- Published 2025-12-30.
- The Ministry describes a coordinated geospatial information catalogue across government companies and local authorities. It specifically identifies a comprehensive bridge inventory as important for route planning, inspection/maintenance, and engineering risk assessment.
- Interpretation: this is evidence that an authoritative bridge-inventory initiative/specification exists. It is **not, by itself, a live downloadable bridge-height/restriction dataset**, and must not be treated as one.

### Netivei Israel (National Roads Company) – infrastructure inventory
- Research/open-data information page: https://istrc.net.technion.ac.il/open-data/
- The page says Netivei Israel can provide infrastructure information for interurban roads, including company inventory such as roads and bridges, and information related to cargo movements / abnormal loads.
- Contact published on that page: MeyJ@iroads.co.il.
- Interpretation: this is the strongest acquisition lead for a national-road bridge inventory and potential heavy/abnormal-load constraints. Access, coverage, fields, freshness, licence, and operational suitability still need written confirmation.

### Ministry of Transport – road tunnels GIS dataset
- Official dataset: https://data.gov.il/he/datasets/ministry_of_transport/tunnels
- Publisher: Ministry of Transport; the dataset is tagged as national road-tunnel GIS.
- The catalogue page lists files updated on 1 June 2026. However, the linked metadata record identifies the layer as created on 1 November 2022, last updated on 15 November 2022, temporal coverage 2022, and update frequency “variable”; contact is Hazav at `geo@mot.gov.il`.
- The currently documented layer describes road tunnels, not truck restrictions. The reviewed metadata does not establish measured vertical clearance, signed height limit, weight/axle limits, lane/direction applicability, operating time windows, current validity, or a live closure/change feed.
- Interpretation: useful nationwide candidate-asset discovery and a strong lead for identifying tunnel records whose restriction evidence should be requested. The catalogue's June 2026 file date does not resolve the older metadata's temporal coverage; this discrepancy must be clarified with Hazav before relying on freshness. A tunnel feature or missing feature never proves a safe passage.
- Registry key: `mot-road-tunnels-gis`; `candidateOnly: true`; `routingEligible: false`.

### Ministry of Transport – height-obstacle guidelines, second edition (April 2026)
- Official PDF: https://www.gov.il/BlobFolder/policy/traffic_height_obstacle/he/Guidelines-for-height-obstacles-2026.pdf
- This is a technical standard/guideline, not a national inventory.
- It distinguishes measured vertical clearance from the clearance displayed on signs. It describes measurement and safety-margin requirements and requires periodic review, particularly after paving works.
- The application's current verification policy requires source-backed measurement evidence before a height restriction can be marked verified.

### Israel Railways grade-separation dataset
- Official dataset: https://data.gov.il/he/datasets/ministry_of_transport/levelseparation
- The catalogue currently exposes a CSV with 618 records, last updated 30 June 2024. The visible fields include rail/grade-separation name, X/Y coordinates, road, hectometer/chainage, location/description, whether rail passes over, status, year-month, maintenance body, and traffic-authority code/type.
- The published schema does not include measured or posted clearance, truck weight/axle limits, width/length limits, lane/direction-specific restrictions, or restriction time windows. This is a rail/road grade-separation subset, not a comprehensive inventory of every road bridge in Israel.
- The catalogue lists `GOLDO@MOT.GOV.IL` as its contact mailbox. The update date is old relative to this review, so the current status and any newer version must be confirmed.
- Permitted use: candidate discovery only. It cannot establish a height restriction or a safe/unsafe truck passage; absence of a record does not prove no bridge or restriction exists.

### Ministry of Transport — delegated road-signing authority datasets
- Official road-authority segment dataset: https://data.gov.il/he/datasets/ministry_of_transport/roadauthority. Its description says it maps road segments where the traffic-signing authority was delegated to a body other than the municipality. The publisher is the Ministry of Transport; the page lists `pinusi@mot.gov.il` as its contact mailbox and shows a dataset update date of 22 July 2026.
- Official local traffic-authority directory: https://data.gov.il/he/datasets/ministry_of_transport/traffic_authority. It lists authority names and stable codes (for example, Netivei Israel, Cross-Israel, Ayalon Highways, Israel Railways and others); the currently indexed CSV page shows an update date of 28 February 2023.
- Interpretation: these are useful **responsibility-discovery / routing-of-enquiry** sources. They can help identify which body may own or control signage for a road segment. They do not contain a current inventory of truck height, weight, width, time-window or closure restrictions, and do not prove the current operational restriction state. The older authority directory also needs freshness confirmation before relying on it for current contacts.
- Acquisition follow-up: use the authority-segment dataset and directory to build a candidate road-owner contact matrix, then request the actual restriction register, source documents, change feed and commercial-use permission from each responsible authority. Do not treat delegated signage authority as proof of asset ownership or measurement responsibility.


### Ministry of Transport – Hazav transport-planning GIS portal
- Portal: https://geo.mot.gov.il/
- The Ministry describes Hazav as a spatial portal aggregating transport-planning information from infrastructure companies, government bodies, local authorities and other publishers. The portal states that layer update frequency varies and that displayed information must not be treated as binding legal or authoritative information. Contact for portal corrections: geo@mot.gov.il.
- Interpretation: use it to discover candidate layers and their individual publishers/metadata. Do not treat the portal itself as an authoritative truck-restriction feed. Every layer needs its own owner, source document, update date, spatial coverage, data dictionary and commercial-use licence review. A missing feature is not evidence that a road is unrestricted.
- Registry key: `mot-geospatial-transport-planning-portal`; `candidateOnly: true`; `routingEligible: false`.

### ArcGIS Feature Service – roadblocks and detours for out-of-service bridges
- Service: https://services3.arcgis.com/PcGFyTym9yKZBRgz/ArcGIS/rest/services/gsharim_blocks/FeatureServer
- Service description: "detours and roadblocks for out_of_service bridges"; it exposes layers for bridge roadblocks, detours, and bridges. The service metadata reports a maximum record count of 1,000 and an Israel Transverse Mercator coordinate reference system.
- The roadblock layer metadata exposes bridge code and bridge ID fields. The inspected layer does not expose measured vertical clearance, gross/axle weight limits, time windows, current validity, road direction/lane, a clear publisher/copyright statement, or a documented update cadence.
- Its full spatial extent is a small regional footprint, not nationwide coverage. Do not infer any road is clear outside the mapped footprint or because no feature is returned.
- Interpretation: candidate-only evidence for discovering selected out-of-service bridges and possible detours. The source owner, authoritative status, freshness, licence, completeness, road-network matching, and operational update process remain unconfirmed. It must not be imported as a verified restriction feed or used to approve routes.
- Registry key: `regional-out-of-service-bridge-roadblocks-arcgis`; `routingEligible: false`.

### Local authority GIS layers
- Example: Tel Aviv municipal bridge layer: https://gisn.tel-aviv.gov.il/ArcGIS/rest/services/IView2/MapServer/550
- It identifies bridge features and type within the municipal GIS.
- Permitted use: local candidate discovery only unless the authority supplies current, authoritative clearance/restriction records and a clear update process. A bridge geometry alone is not a restriction.

### OpenStreetMap – community truck-restriction tags (lead only)
- Project: https://www.openstreetmap.org/
- The OpenStreetMap tagging documentation describes `maxheight` as a vehicle height limit and distinguishes it from `maxheight:physical`, which describes a physical height limit. It also documents direction-specific tags such as `maxheight:forward` and `maxheight:backward`, and recommends attaching a bridge clearance limit to the road segment passing beneath the bridge.
- The documentation explicitly warns that a missing `maxheight` tag may mean either that no restriction exists or that nobody has mapped it. Therefore, absence of a tag must never be interpreted as a verified-clear road.
- OpenStreetMap is community-maintained, not a government or road-owner restriction register. Tags can be incomplete, incorrectly valued, stale, or associated with the wrong segment/direction/lane. A mapped value is not a signed measurement record or proof of current legal applicability.
- Licensing: any use must be reviewed against the Open Database License (ODbL), attribution and share-alike obligations before ingestion or commercial display.
- Permitted use: candidate lead for human verification only; not a verified restriction feed, not proof of nationwide coverage, and never a basis to approve a route.
- Registry key: `openstreetmap-community-truck-restrictions`; `candidateOnly: true`; `routingEligible: false`.

## 2. Data acceptance hierarchy

1. **Verified restriction:** current written record from the road owner / competent traffic authority, or a signed measurement record from a qualified responsible body, with exact location/direction/lane, restriction value, effective date, and a retrievable HTTPS source document.
2. **Candidate asset:** official bridge/grade-separation inventory with geometry and owner, but no verified restriction measurement. Keep as `unverified`; never block/permit a route based on it.
3. **Community / third-party observation:** useful only as a lead for human review. Never elevate automatically to verified.
4. **Missing, conflicting, stale, or ambiguous data:** fail closed for the affected safety decision; show a warning / require manual confirmation rather than assuming the road is suitable.

## 3. Required fields before a bridge record can affect routing

- Stable source record ID and source organisation.
- Road owner / responsible authority and contact or maintenance body.
- Road number/name, direction, carriageway, lane(s), and precise point/segment geometry.
- Restriction type and value (height, weight, width, length, time window, closure).
- For height: measured vertical clearance per relevant lane, posted clearance, measurement date, accuracy, method, exact measurement location, and signed/official measurement document.
- Effective-from / effective-until or explicit current-validity statement.
- Source publication/update date, retrieval date, licence/usage terms, and a source URL.
- A documented update cadence and a way to detect withdrawn or superseded records.

## 4. Acquisition request to Netivei Israel

Request, without assuming public availability:
- Current bridge and underpass inventory for roads under its responsibility, including stable IDs, coordinates/geometry, road/direction/lane references, and asset owner.
- All current height, weight, width, length, time-window and closure restrictions relevant to heavy vehicles.
- For height restrictions, measured clearance per lane, posted sign value, measurement date/accuracy/method, and official measurement/inspection documents.
- Data dictionary, coverage boundaries, update frequency, change/deprecation feed, licence, and permission for use in a commercial navigation product.
- Whether records include temporary works, maintenance closures, and emergency restrictions, and how real-time updates are distributed.
- A named data steward / operational contact for corrections and urgent withdrawals.

## 5. Import and release gates

- Do not scrape or bulk-import an unverified source into the production restriction table.
- First load candidate data into a separate review/staging process (not yet implemented); preserve source IDs and original payloads.
- Deduplicate only with traceable rules; never merge conflicting measurements silently.
- Every candidate remains `unverified`. A human reviewer must inspect the source document and geometry.
- A height record can be marked `verified` only when the current database constraints and the Ministry measurement evidence requirements are satisfied.
- Revalidate records when the source changes, the source expires, the road owner withdraws it, or roadworks may have changed the clearance.
- Keep the active routing engine disabled until authoritative coverage, freshness, terms of use, and end-to-end route enforcement have been independently validated.

## 6. Current implementation boundary

The existing `road_restrictions` review workflow and database guard enforce evidence for verified height records. This document is a source-acquisition plan only: it does not add database tables, import records, change routing behavior, enable PTV, or deploy to Production.

## 7. Supplier response evaluation checklist

Do not treat a positive reply or a sample file as proof of nationwide operational coverage. Before accepting a provider, record evidence for every item below:

| Gate | Evidence required | Pass condition |
| --- | --- | --- |
| Authority | Data-owner identity and responsibility map | Each record is attributable to the competent road owner / authority |
| Geographic coverage | Coverage map, road classes, excluded areas and known gaps | Coverage is explicit; gaps are not silently treated as clear roads |
| Truck constraints | Data dictionary and sample records | Height, gross/axle weight, dimensions, time windows and closures are separately represented where applicable |
| Measurement quality | Measurement method, date, accuracy, lane/direction and signed evidence | Height values can be traced to a current official measurement |
| Temporal validity | Effective dates, expiry, supersession and emergency update behavior | Expired or withdrawn records cannot remain active |
| Update mechanism | API/change feed/file delivery, cadence, outage notice and last-updated metadata | Changes and withdrawals can be detected within an agreed operational window |
| Licensing | Written commercial-use, storage, transformation and display permission | Product use is expressly permitted, including derived route decisions |
| Reliability | SLA, support contact, incident process and correction channel | Operational ownership and escalation are documented |
| Independent validation | Field/authority spot checks and route-level test cases | False negatives and stale-data behavior meet an approved safety threshold |

### Mandatory pilot before national activation

1. Obtain a written data agreement and a representative sample covering urban, interurban, municipal and national-road authorities.
2. Build a staging-only importer that preserves the raw source payload, source ID, retrieval timestamp, source version and checksum.
3. Validate geometry, coordinate reference system, lane/direction association, units, time zones, effective intervals and duplicate/conflict handling.
4. Compare a statistically justified sample against current official signs, signed measurements and road-owner records. Record false negatives separately; do not average them away.
5. Test closures and restrictions that begin/end during a trip, including Israel-local midnight, daylight-saving transitions and last-minute withdrawals.
6. Run shadow evaluations against candidate routes without displaying them as approved navigation. Log disagreements and obtain human review.
7. Require written sign-off from the data owner, product safety reviewer and operational owner before changing any production feature flag.

**Automatic rejection conditions:** unclear commercial licence; unknown measurement date; no stable source ID; missing lane/direction where it affects applicability; stale or non-withdrawable records; unexplained coverage gaps; or any inability to distinguish “no restriction known” from “road verified clear”.

Until every mandatory gate is passed, the data source remains candidate-only and nationwide truck routing remains disabled.

## 8. Source assessment report (evidence completeness only)

The pure helper `lib/restriction-source-assessment.mjs` evaluates whether a candidate's review dossier contains references for each gate in the supplier checklist. It reports each dimension as `missing`, `partial`, or `evidenced`; omitted dimensions are always `missing`. It does not fetch, inspect, authenticate, or validate the truth of referenced documents.

The report covers authority, geographic coverage, truck constraints, measurement quality, temporal validity, update mechanism, licensing, reliability, and independent validation. A complete dossier means only that a reviewer has supplied a reference for every dimension. It is **not** source approval, proof of nationwide coverage, or permission to route.

The helper always returns `approved_for_routing: false`. A human safety review, source-owner confirmation, pilot validation, licensing review, and explicit release approval remain separate mandatory gates. The helper is not connected to the route API, database, ingestion process, or production feature flags.

Tests use synthetic references only and are included in `npm run test:ptv`.


## 9. Axle-load enforcement boundary

The saved vehicle profile contains an axle count and a declared `weight_per_axle_kg` value, and the HERE request forwards those values to the provider. This is not a measured or live per-axle load distribution. The current internal restriction evaluator compares gross/current vehicle weight with gross-weight limits; it does not calculate load on each axle or axle group, and it does not approve axle-specific limits.

Accordingly:
- An axle-specific restriction type (for example, `axle_weight`) is currently unsupported and must remain unresolved / blocked by the evaluator's fail-closed behavior.
- Do not derive per-axle load by dividing gross weight by axle count; real load distribution depends on vehicle geometry, axle spacing, cargo placement, trailer configuration and coupling loads.
- Before supporting axle-specific routing, add verified registration/configuration fields for axle groups and spacing, a trustworthy way to establish the actual loaded axle/group weights, unit and limit validation, and provider semantics tests. The route decision must independently compare every applicable axle/group limit.
- Until then, do not describe a route as axle-safe or claim axle-specific compliance.


## 10. Actual axle load versus registered axle limit

HERE Routing API v8 defines `vehicle[weightPerAxle]` as the actual total load on an axle, including payload. A registration maximum or generic permitted axle limit is not an actual loaded axle measurement. TruckSafe therefore keeps any saved registration axle limit separate from the trip-specific measured load. The routing form must collect the actual load on the heaviest axle for the current trip, based on a recent weighbridge / axle-scale measurement, and send that trip value to HERE. It must not infer axle load by dividing total vehicle weight by axle count. The app does not have a sensor connection and cannot independently verify the measurement; the driver/operator remains responsible for entering a reliable current measurement. If the actual axle load is unavailable, routing must be rejected rather than sending the registered limit as if it were actual load.


## 11. Ministry GIS layer catalogue and specification guidance (reviewed 12 November 2026)

The Ministry's GIS catalogue and its layer-specification guidance were listed as updated on 11 November 2026. The catalogue is a discovery and standardisation aid, not evidence that a complete bridge-clearance or truck-restriction layer is already available. The Ministry's own Hazav portal says source layers come from multiple organisations, update at varying frequencies, and are not legally binding.

For every discovered layer, record and independently validate the actual data publisher, geographic coverage, dataset-level update date (not merely the catalogue page date), field definitions, measurement method and accuracy, direction/lane semantics, temporal validity, update cadence, and licence / commercial-use permissions. Until those checks are complete, catalogue entries remain discovery-only and must never approve a route.

The Ministry's 2025 road-safety infrastructure specification explicitly describes a comprehensive bridge geographic database as a critical information need and describes the ongoing work to collect and standardise information from multiple infrastructure companies and local authorities. This is evidence of an effort to build/standardise the information base, not evidence that a complete national truck restriction dataset is already published.


## 12. Ministry bridge GIS layer specification — important schema gap (reviewed 12 November 2026)

The Ministry's version-1 bridge GIS specification (August/November 2025) is a valuable official schema lead. It defines a bridge polygon layer in Israel Transverse Mercator (EPSG:2039), a stated spatial accuracy of 1 metre, and an annual update frequency. It includes road/authority and bridge-location fields, plus `Gavrit_Min` and `Gavrit_Max`. The field table explicitly defines these as minimum and maximum bridge clearance **according to the posted sign**; they must not be described or interpreted as measured physical clearance.

The specification also includes `Placement`, `Lane_N` and `Lane_Under` fields to describe the bridge's position within the road and lane counts. However, it does not define a lane-specific physically measured vertical-clearance value, measurement method/date, survey accuracy record, or measurement evidence field. A 1-metre spatial-location accuracy statement and annual update cadence do not establish safe road-segment matching or timely updates for temporary changes.

**Implementation consequence:** treat this specification as a candidate asset/schema model only. Keep posted clearance separate from measured physical clearance. Before any import, obtain the actual dataset and metadata, inspect completeness and coverage, and require an independent lane-level survey record under the Ministry's 2026 height-obstacle guidelines, direction/lane mapping, current validity, and commercial-use rights. Never mark a record verified or allow routing based solely on `Gavrit_Min` / `Gavrit_Max`.


## 13. 2026 height-obstacle guidelines — actionable survey standard (reviewed 12 November 2026)

The Ministry's second-edition height-obstacle guidelines (April 2026) provide a materially stronger technical benchmark than the bridge GIS schema alone. They explicitly distinguish **measured vertical clearance** (the physical free space between the road surface and the underside of the obstacle) from **posted/proposed clearance** (the value displayed on the height-restriction sign). They require a detailed survey to an accuracy of ±1 cm, with measurements alongside kerbs/road-edge lines, alongside lane markings, and at the centre of every lane. Measurements are taken on both sides of the obstacle; for an underpass longer than 20 m, an additional measurement is required at its centre. Hanging equipment beneath the structure must be included, and the lowest measured value in each lane is the lane's measured clearance. The guidelines also call for periodic remeasurement and immediate updates after roadworks that affect clearance.

This creates a practical acceptance benchmark for the dataset request and future ingestion. A bridge GIS row containing only `Gavrit_Min` / `Gavrit_Max` is not enough: the supplier must identify whether each value is measured or posted, provide the lane-specific survey record and supporting plan/evidence, survey date and responsible body, and show how subsequent surveys and roadworks updates are handled. The ±1 cm requirement is the survey standard in the guidelines; it must not be confused with the bridge layer's separate 1 m spatial-location accuracy.

**Implementation consequence:** require lane-level measured clearance and a survey evidence trail before any record can be considered for verified restriction review. Keep the guideline document itself as a measurement standard only, not as a source of individual bridge locations or route permissions.


## 14. Tel Aviv municipal roadworks ArcGIS layer — temporary-event discovery only (reviewed 12 November 2026)

An official Tel Aviv-Yafo municipal ArcGIS feature layer publishes roadworks and traffic-impacting events as line geometry. Its metadata describes daytime/nighttime works, public events, sports/cultural events, lane reductions or closures, and start/end dates and times. Fields include work description, lane-reduction description, start/end date and time, an open-works indicator, and a data-import date.

This is a useful example of a structured **temporary-event** feed, but it is limited to Tel Aviv-Yafo and is not a national road restriction source. The metadata does not establish a real-time service-level freshness guarantee, completeness, or authoritative semantics for the open/closed indicator. A work-zone record does not necessarily mean a full road closure and says nothing by itself about truck height, weight, or axle restrictions.

**Implementation consequence:** register it only as a city-scoped candidate. Before any integration, verify licensing, actual update cadence, field semantics, temporal validity and completeness, and corroborate closures with an authoritative traffic notice. Never treat the layer as national coverage, a verified truck restriction, or route approval.


## 15. Tel Aviv municipal bridge / tunnel inventory — asset discovery only (reviewed 12 November 2026)

The Tel Aviv-Yafo municipal ArcGIS layer 550 contains line geometry for bridges, tunnels and underpasses. Its attributes include a bridge identifier, name, purpose/type (including road bridges, pedestrian bridges, rail bridges, tunnels and pedestrian underpasses), associated street names and a data-import date.

It is a useful municipal asset inventory lead, but it is limited to Tel Aviv-Yafo. Its published fields do not include vertical clearance, weight/width limits, measurement evidence, lane or travel direction. It therefore cannot establish whether a truck can safely pass beneath or across any structure. The absence of an asset from this municipal layer is not evidence that no bridge or restriction exists.

**Implementation consequence:** keep this source city-scoped and discovery-only. It may help identify candidate structures for later authoritative survey matching, subject to coverage, freshness and licence checks; it must never create a verified restriction or approve a route.


## 16. Tel Aviv Waze traffic-event layer — secondary situational awareness only (reviewed 12 November 2026)

The municipal ArcGIS layer 891 exposes point reports for minor crashes, stopped vehicles, roadworks, hazards, traffic jams and `ROAD_CLOSED_EVENT`. Its fields include report confidence, reliability, report rating, publication time and update date. The layer extent is local to Tel Aviv-Yafo.

These are Waze reports exposed through a municipal GIS service, not an official road-authority closure register. Confidence/reliability fields describe report metadata; they do not establish confirmation by a traffic authority. Reports can be missing, duplicated, incorrect or stale. The layer contains no truck-specific height, weight, width or axle restrictions, and absence of a report cannot be interpreted as an open road.

**Implementation consequence:** keep it as a city-scoped, secondary awareness candidate only. Any future use must be subject to licensing, update-latency and map-matching review, and should surface as an unverified alert that requires corroboration. It must never independently close a road, clear a route, or establish national coverage.


## 17. Road-signing authority datasets — authority discovery, not restriction data (reviewed 12 November 2026)

Two additional Ministry catalogues help identify which body may need to validate a road restriction:

- The **delegated area-signing-authority GIS** catalogue is listed as updated on 22 July 2026. It maps areas where local traffic-signing authority has been delegated to a body other than the municipal authority.
- The **traffic-authority directory** lists authority names, types and codes, including national infrastructure companies. Its indexed CSV was last updated on 28 February 2023 and is therefore a stale starting list, not a current responsibility register.

These are useful for building an authority-contact matrix, but neither dataset describes bridge clearance, weight limits, truck access, operating hours or temporary closures. A delegated signing authority is not necessarily the bridge asset owner, maintenance operator or data custodian. Every assignment must be confirmed with the relevant body for the exact road segment/asset and current date. Neither dataset may create a restriction, clear a road, or approve a route.


## 18. Delegated signing-authority areas — distinguish catalogue refresh from row currency (reviewed 12 November 2026)

The Ministry's `area_authority` catalogue is listed as updated on 22 July 2026 and contains 231 area records. The CSV includes a `YEARMONTH` field; visible examples include 202303, 202312 and 202403. Therefore, a recent catalogue file timestamp must not be mistaken for a fresh authority determination for every area. The layer is useful for finding a likely delegated signing authority, but it does not establish the current responsible body for a specific bridge, road segment or maintenance asset.

**Implementation consequence:** keep it as an authority-discovery candidate. Any responsibility assignment must be checked against the row's own period and confirmed with the authority for the exact asset/segment and effective date. It is not a restriction dataset and cannot approve or block a route.
