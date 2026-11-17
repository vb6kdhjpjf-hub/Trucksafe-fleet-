# Truck points of interest (POI) — product and trust contract

Status: design-only. No POI provider, import, API endpoint, database table, map layer, or paid service is enabled by this document.

## Product scope

TruckSafe should support a broad, filterable POI layer alongside truck-safe routing and road-safety alerts. Initial categories:

- Fuel and energy: diesel, AdBlue, charging where relevant, truck-accessible pumps, fleet cards and opening hours.
- Food: restaurants, diners, cafes, takeaway and food services.
- Rest and parking: truck parking, designated heavy-vehicle rest areas, secure parking, overnight parking, toilets, showers and driver facilities.
- Vehicle services: truck workshops, mobile mechanics, tire services, roadside assistance, washing, lubrication, weighing stations and air.
- Freight operations: logistics hubs, loading/unloading areas, depots, truck stops and permitted staging areas.
- Driver essentials: lodging, convenience stores, pharmacies and other useful services where appropriate.

Categories must be individually filterable and searchable. Users should be able to search nearby, along a planned route, near a destination, or within a chosen detour distance. Route-aware results must use the selected planned route and must not infer the route from GPS history.

## Truck suitability is a separate, explicit property

A POI being present on a consumer map does not mean a heavy vehicle can safely or legally enter it. Store and display suitability as evidence-backed fields, not as an assumption:

- access status: confirmed_truck_access, restricted_truck_access, unknown, or not_applicable;
- supported vehicle dimensions and mass, where verified: height, width, length, gross weight, axle limits;
- entrance/exit constraints, one-way circulation, turning space and road approach restrictions;
- service capabilities: truck diesel, AdBlue, high-flow pumps, truck wash, heavy-vehicle bays, weighbridge, showers, secure parking;
- opening hours and service hours, each with source and last-checked time;
- parking capacity and availability only when supplied by a reliable live source;
- accessibility confidence, evidence source, verification date, and expiry/freshness policy.

Unknown access must never be presented as confirmed truck access. If suitability is unknown, show a clear warning and do not route a truck through a restricted access path. POI information is not legal restriction evidence and must never create, edit, or deactivate rows in `public.road_restrictions`.

## Source and freshness requirements

Potential sources require separate review before use: official authority datasets, licensed commercial POI providers, operator-published data, and carefully moderated user submissions. Publicly visible data is not automatically licensed for commercial display, caching, redistribution, or long-term storage.

For each source, review geographic coverage, category coverage, positional accuracy, update cadence, terms/licence, attribution, rate limits, retention, correction process, and outage behavior. Keep source provenance and last-verified timestamps. Do not claim comprehensive nationwide coverage until it has been measured and validated.

User submissions may suggest a new POI or correction, but cannot self-certify truck access, legal access, opening hours, capacity, or live availability. High-impact access attributes require trusted evidence and review.

## Map and driver experience

- Use distinct icons and category filters; allow the driver to hide categories.
- Show distance and route detour separately; never imply a detour is truck-safe unless evaluated against the vehicle profile and verified road restrictions.
- Show opening-hours freshness and label stale or unknown data.
- Provide call, website, and navigation actions only when the source supplies valid details.
- Keep the interaction low-distraction: voice alerts should be limited to relevant, opted-in events and should not encourage interaction while driving.
- Never say a parking location has space available without a current, reliable availability feed.
- Offer reporting/correction with moderation and abuse controls.

## Privacy, security, and architecture

POI search should not expose driver identity, fleet membership, vehicle registration, or raw GPS trails to third-party sources. Minimize location precision and transmit only what is needed for the requested search. Provider credentials remain server-side. Apply source-specific quotas, caching rules, and auditability.

Keep POIs, live road events, private fleet incidents, and legal truck restrictions as separate data domains with separate trust and retention policies. A POI provider outage must not silently remove or weaken road-restriction safety checks.

## Safe implementation sequence

1. Keep this contract and category taxonomy as design-only until a source is selected.
2. Compare candidate sources and licences; measure coverage for Israel and truck-specific attributes.
3. Define a normalized POI schema and source-specific freshness policies for review. The version-1 schema is now documented in `truck-poi.schema.json`; it separates source licensing, truck-access evidence, vehicle limits, capabilities, opening hours, and live parking availability.
4. Build offline tests with synthetic fixtures only. Initial contract and schema-shape tests are included in CI; they do not yet validate provider payloads or connect to a database.
5. After explicit approval, implement an isolated Test-only read path and access-control tests.
6. Only after separate approval, run a bounded pilot using one approved source, with attribution, monitoring, rate limits, correction handling, and a kill switch.

No source, migration, API, provider subscription, production data change, or deployment is authorized by this design document.

## Optional partner offers and driver rewards

A later commercial layer may show opt-in, station-specific offers such as a coffee and pastry after a qualifying refuelling visit. This is a partner feature, not a core navigation dependency:

- Keep offers separate from POI facts, truck-access evidence, road restrictions, and safety-event data.
- An offer must identify the participating operator/location, exact eligibility (for example, qualifying refuelling transaction), benefit, redemption method, valid dates/times, exclusions, stock/availability caveat, and partner terms.
- Do not claim that refuelling occurred based only on GPS presence, a geofence, or a driver tap. Qualifying purchase must be confirmed by a participating operator/payment/POS integration, or by a partner-issued receipt/token flow with fraud controls.
- Prefer a partner-issued, short-lived, single-use redemption token or QR code validated at the station POS. Do not build fuel payment processing, store payment credentials, or collect full receipts/card data as a shortcut.
- Until a verified integration exists, the app may show a clearly labelled informational offer only; it must not promise automatic eligibility or successful redemption.
- Offers are optional, user-initiated, and must never influence safe-route selection, hide a safer stop, or distract a moving driver. Present them when parked or before departure.
- Minimize data: share only the minimum transaction/eligibility signal required with the partner, with explicit user consent and clear retention terms. Do not expose fleet membership, vehicle registration, or route history to advertisers.
- Commercial ranking and sponsorship must be visibly labelled and kept separate from safety, suitability, distance, and route-detour ranking.

This is a future design option only. No partner has been contacted, no commercial agreement or integration exists, and no offer is currently redeemable in TruckSafe.
