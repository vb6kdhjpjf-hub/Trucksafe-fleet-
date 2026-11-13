# Vehicle and crane coverage — V1 foundation

TruckSafe Fleet must classify conventional heavy vehicles and specialist bodies:
rigid trucks, tractor units, semi/full trailers, low-loaders, articulated and
telescopic cranes, loader cranes, heavy-lift cranes, mobile cranes on truck
chassis, aerial platforms/basket trucks, recovery cranes, concrete pumps,
mixers, tippers, tankers, refrigerated trucks and car carriers.

The catalogue in `lib/vehicle-capabilities.mjs` is classification and evidence
infrastructure. It does not claim every type is already supported by a routing
provider or covered by verified national road restrictions.

## Travel vs working configuration

Store travel configuration separately from working configuration. Travel data
includes actual road-going height, width, length, gross permitted mass, empty
mass, axle count/layout/spacing, trailer count and legal axle limits. Working
data includes boom/stowed equipment, outriggers, stabilizers, basket/platform,
manufacturer lifting chart, rated capacity by radius/configuration and
operating envelope.

Never use working dimensions as road dimensions. Never infer axle loads by
dividing gross weight by axle count. Routing must use verified registration
evidence and current measured trip weights where required.

## Evidence gate

Special vehicles require verified registration, travel dimensions and axle
configuration. Crane-equipped vehicles additionally require the manufacturer's
lifting chart and verified separation of travel and working configurations.
Missing or ambiguous evidence fails closed. Passing this evidence gate alone
does not certify a route or authorize lifting operations.

Provider profiles may not model every crane subtype, axle group, lift axle,
steering axle, trailer combination or local restriction. Do not silently map a
crane to a generic truck and claim full compliance. If a material constraint
cannot be represented or checked, mark the route unverified/reject it.

No nationwide Israeli truck/crane restriction coverage is implied. Authoritative,
current, licensed road/bridge/height/weight/time-window/permit sources and
documented geographic coverage are prerequisites for route-safety claims.

## Remaining integration

Persist body type and equipment evidence in fleet-scoped tables; build vehicle
create/edit forms; add Test-only migration and RLS tests after approval; map
verified travel parameters to each routing provider; test crane-specific route
constraints; and add import/export mappings. No schema, Supabase data, provider
credentials, production, or deployment changes were made by this foundation.
