# מגבלות אימות משקל במסלולי משאיות

Status: safety limitation — routing remains disabled until the separate restriction-coverage and provider gates are approved.

## What the application currently knows

- The saved vehicle profile contains tare/empty weight, gross permitted weight, dimensions, axle count, trailer count, and a saved per-axle value. These fields require a human-reviewed registration-document verification state.
- The driver or dispatcher enters the current total trip weight in the routing form.
- The server checks that the entered number is at least the saved empty weight and no greater than the saved gross permitted weight.
- The entered current total weight is passed to HERE as a routing vehicle parameter and used against verified fleet restrictions of type `weight`.

## What is not verified

- The current trip weight is user-supplied. TruckSafe is not connected to a weighbridge, onboard weighing sensor, cargo manifest, or other trusted live weight source.
- The server validates the numeric range, not the truth or provenance of the entered value.
- The saved per-axle value is a registration/profile value, not a live measurement of the load on each axle.
- TruckSafe does not currently calculate or verify the actual load distribution across axles.
- A gross-weight check does not establish legal axle-load compliance, trailer combination compliance, or road/bridge structural suitability.

## Required user-facing behavior

The routing page must state clearly that current trip weight is entered manually and should be based on a recent weighbridge reading or reliable cargo/vehicle records, not an estimate. It must also state that axle-load distribution is not measured.

## Before production routing

1. Decide which evidence is accepted for trip weight (weighbridge ticket, calibrated onboard scale, validated cargo manifest, or an explicitly approved alternative).
2. Store the source, timestamp, operator, and evidence reference for each trip-weight assertion, with appropriate privacy and retention controls.
3. Define whether the product can support an actual axle-load distribution model; do not treat a single stored per-axle limit as a measured axle load.
4. Obtain authoritative legal and provider semantics for axle load, gross combination weight, trailer count, and vehicle dimensions.
5. Keep routing blocked unless the relevant input is verified to the required standard and independent road restriction coverage is approved.

A user-entered weight that passes the numeric range check is not a verified measurement and must never be described as one.


## Official heavy-vehicle registry candidate (reviewed 12 November 2026)

The Ministry of Transport's public catalogue lists a technical dataset for vehicles above 3.5 tonnes and vehicles without a model code. Its visible schema includes gross weight, tare/self weight, trailer/load-related weight, axle count, axle/tire configuration, plus registration and chassis identifiers. The catalogue listing was observed as updated on 10 November 2026.

This is a possible review aid for static vehicle specifications only. It is not a weighbridge reading, onboard scale, cargo manifest, or source of actual axle-load distribution. Registration and chassis identifiers are sensitive identifiers and must not be bulk-copied into the application or logs. The catalogue's "Other (Open)" licence label is not sufficient evidence of commercial reuse or redistribution rights.

See [the source review](../data-sourcing/israel-heavy-vehicle-registry-review.md). No registry data has been imported. Human-reviewed registration documents remain the current approval basis for saved vehicle profiles.
