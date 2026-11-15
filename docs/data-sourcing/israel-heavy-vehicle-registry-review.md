# Israel heavy-vehicle technical registry review

Review date: 12 November 2026  
Status: public catalogue metadata reviewed; **not approved for production ingestion or automatic vehicle-profile verification**

## Official dataset lead

The Ministry of Transport publishes a dataset titled "כלי רכב מעל 3 וחצי טון וכלי רכב חסרי קוד דגם" (vehicles above 3.5 tonnes and vehicles without a model code).

- Catalogue: https://data.gov.il/he/datasets/ministry_of_transport/heavy-truck
- Publisher: Ministry of Transport and Road Safety
- Catalogue contact: bidata@mot.gov.il
- Catalogue listing update observed: 10 November 2026
- Catalogue licence label: "Other (Open)" — this label alone does not specify whether commercial reuse, redistribution, caching, or derivation inside a paid navigation service is permitted.
- The public catalogue description covers active trucks, buses, tractors, work vehicles and supported trailer types.

The visible field schema includes vehicle registration number, chassis number, EU type approval, manufacture year, make/model, fuel, gross weight, tare/self weight, trailer/load-related weight, axle count, axle/tire configuration and registration-order metadata.

## Relevance to TruckSafe

The technical fields may help a fleet manager compare a saved vehicle profile with official registration data, particularly:
- gross permitted weight;
- tare/self weight;
- axle count and axle/tire configuration;
- vehicle type and model metadata.

This could reduce transcription errors, but the dataset is not a live load sensor and does not establish the current loaded weight or actual load distribution on each axle. It also does not provide road/bridge restrictions or prove that a vehicle may traverse a specific road.

## Privacy, licensing and data-quality controls

The dataset contains direct vehicle identifiers (registration and chassis numbers). Do not bulk-copy these identifiers into TruckSafe, logs, analytics, test fixtures, or the application database as part of this discovery work.

Before any integration:
1. Obtain and review the complete licence/terms, including explicit permission for commercial use, derived fields, storage, refresh, and redistribution.
2. Establish a lawful purpose and privacy assessment for any registration/chassis lookup; minimise identifiers and retention.
3. Confirm the data's authoritative status, update cadence, coverage, correction process, and handling of imported/temporarily inactive vehicles.
4. Confirm the meaning, units, and applicability of gross weight, tare weight, trailer load and axle/tire fields against the vehicle registration certificate and official definitions.
5. Treat any result as a review aid only. The current human-reviewed registration-document workflow remains the source of approval for a saved TruckSafe vehicle profile unless a separately approved and audited verification process is implemented.
6. Never infer actual trip weight or per-axle load from static registry fields.

## Implementation decision

Classify this dataset as a **candidate vehicle-profile reference only**. No file was downloaded, no registration or chassis identifiers were imported, no external authority was contacted, and no production or Test database was changed during this review. Do not enable automatic profile population or registration approval from this dataset.
