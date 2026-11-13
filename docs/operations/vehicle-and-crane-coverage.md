# Vehicle body types and special equipment

Vehicle classification is stored on `vehicles.body_type`. The catalogue includes rigid trucks, tractor units, trailers, tankers, refrigerated trucks, low loaders, concrete equipment, cranes, aerial platforms and recovery vehicles.

Special equipment profiles are stored in `public.vehicle_special_equipment`, fleet-scoped by a composite `(fleet_id, vehicle_id)` foreign key. Low-loaders are also fail-closed and require an internally reviewed special-equipment profile, even though they do not require a crane lifting chart. Travel dimensions are separate from working dimensions. Crane, aerial-platform and concrete-pump routing is fail-closed until the fleet manager has reviewed registration, travel dimensions, axle configuration, manufacturer lifting chart and working-envelope evidence.

This internal evidence review is not government approval, legal certification, permit, or guarantee that a road is suitable. Route calculations still depend on separately validated provider and authoritative road-restriction coverage. Documents stay in the private `vehicle-registrations` bucket. Schema changes were applied only to the dedicated Test project.
