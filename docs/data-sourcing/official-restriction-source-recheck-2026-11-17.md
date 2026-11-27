# Official Restriction-Source Recheck — Israel

Review date: 2026-11-17
Branch: `fix/physical-clearance-routing-gate`
Status: discovery only; **no source approved for operational truck routing**

## Findings

### Ministry of Transport Hazav GIS portal
- Portal: https://geo.mot.gov.il/
- The portal describes information assembled from infrastructure companies, government bodies, local authorities and private publishers.
- Its own usage notice says layer update frequency varies and displayed information must not be treated as legally binding.
- Decision: discovery/catalogue navigation only. Every underlying layer needs its own publisher, update date, schema, coverage, licence and authority review.

### Government road-signing authority dataset
- Catalogue: https://data.gov.il/he/datasets/ministry_of_transport/roadauthority
- The catalogue describes road segments where traffic-signing authority has been delegated to a body other than the municipality.
- The catalogue page showed an update date of 22 July 2026.
- This identifies responsibility boundaries; it does not provide the actual current truck height, gross/axle weight, width, length, time-window or closure restrictions.
- Decision: useful for building a road-authority responsibility matrix only. Do not treat it as a restriction register or proof of road safety.

### ArcGIS out-of-service bridge roadblocks
- Service: https://services3.arcgis.com/PcGFyTym9yKZBRgz/ArcGIS/rest/services/gsharim_blocks/FeatureServer
- Service description: detours and roadblocks for out-of-service bridges.
- The bridge layer (2) exposes bridge identity/name/address/type and geometry fields; it does not expose measured clearance, truck weight/axle limits, lane-specific restrictions or validity windows.
- Layer metadata reports its data last edited on 23 January 2019. Its spatial extent is a small regional footprint, not nationwide.
- Decision: candidate asset/roadblock discovery only. Stale metadata and missing truck restriction fields make it unsuitable for operational routing. Absence of a feature is not evidence of an open or safe crossing.

### Ministry height-obstacle guidelines (April 2026)
- Official document: https://www.gov.il/BlobFolder/policy/traffic_height_obstacle/he/Guidelines-for-height-obstacles-2026.pdf
- This is a technical guidance document, not a live national restriction inventory.
- It reinforces the need to distinguish measured physical clearance from posted/signage values and to retain lane-specific measurement evidence.
- Decision: use as a verification-method reference; it cannot supply missing bridge records or prove any route safe.

### Community OpenStreetMap-derived low-bridge listing
- Example secondary presentation: https://www.ilovay.com/bridges/israel
- It reports 769 mapped height restrictions, including records with unknown height, and attributes its data to OpenStreetMap.
- This is not a competent authority register; completeness, correctness, lane/direction association, freshness, licence and field validation are not established by the listing.
- Decision: at most a human-review lead after separate licensing review. Never use it to approve a route or claim nationwide coverage.

## Acceptance decision

No newly rechecked source satisfies all mandatory gates for:
1. competent authority / asset-owner provenance;
2. nationwide or explicitly bounded coverage and known gaps;
3. current lane- and direction-specific truck restrictions;
4. measured clearance and signed supporting evidence where height applies;
5. gross and axle weight, width, length and time-window limits where applicable;
6. validity, expiry, update/withdrawal mechanism and operational freshness;
7. explicit commercial-use and derived-routing permission; and
8. independent validation against current authority records and field evidence.

Therefore:
- Keep every source above candidate-only / reference-only.
- Do not import these records into the production restriction table.
- Do not change routing provider gates or activate route guidance.
- Missing or absent records must never be interpreted as unrestricted roads.
- Keep PR #19 open and Draft; no merge, deployment, preview or Production database operation.

## Scope of this recheck

This was a public metadata/document review. No bulk data download, database write, external authority contact, provider activation, or route decision was performed.