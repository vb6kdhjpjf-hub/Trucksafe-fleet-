# Israel Bridge and Height-Restriction Data Sources

Status: source discovery / acquisition plan  
Last reviewed: 2026-11-10  
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

### Ministry of Transport – height-obstacle guidelines, second edition (April 2026)
- Official PDF: https://www.gov.il/BlobFolder/policy/traffic_height_obstacle/he/Guidelines-for-height-obstacles-2026.pdf
- This is a technical standard/guideline, not a national inventory.
- It distinguishes measured vertical clearance from the clearance displayed on signs. It describes measurement and safety-margin requirements and requires periodic review, particularly after paving works.
- The application's current verification policy requires source-backed measurement evidence before a height restriction can be marked verified.

### Israel Railways grade-separation dataset
- Official dataset search lead: https://data.gov.il/
- The previously located dataset identifies grade-separation locations/names and maintenance responsibility, but does not provide measured vertical clearance.
- Permitted use: candidate discovery only. It cannot establish a height restriction or a safe/unsafe truck passage.

### Local authority GIS layers
- Example: Tel Aviv municipal bridge layer: https://gisn.tel-aviv.gov.il/ArcGIS/rest/services/IView2/MapServer/550
- It identifies bridge features and type within the municipal GIS.
- Permitted use: local candidate discovery only unless the authority supplies current, authoritative clearance/restriction records and a clear update process. A bridge geometry alone is not a restriction.

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
