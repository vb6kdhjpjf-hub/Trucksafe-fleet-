# Cargo, delivery documents, and proof of delivery — product architecture

Status: approved engineering direction for the isolated development branch; not a production release.
Scope: multi-tenant fleet operations for pallet, piece, package, container, and measured-weight workflows, with a simple driver experience.

## Product objective

A dispatcher must be able to plan and document a delivery regardless of whether the cargo is weighed, counted by pallets, counted by cartons/pieces, or described by a customer document. The driver should normally need only to open the assigned stop, confirm what was delivered, record any discrepancy, capture recipient proof, and finish. The system must not force the driver to enter technical weight data when none exists.

Operational quantity and vehicle safety evidence are separate concepts. A count of pallets is a valid operational fact; it is not a weight measurement and must never be represented as one.

## Core domain model

### 1. Shipment / delivery order

A shipment is the commercial-operational instruction and can contain:
- Customer, ship-to address, contact, delivery window, purchase-order/customer reference.
- Origin warehouse/depot, destination, assigned fleet/vehicle/driver, route/stop sequence.
- Requested items and quantities, handling instructions, temperature or special-care requirements where relevant.
- Status lifecycle: draft, planned, assigned, in_transit, partially_delivered, delivered, delivery_exception, cancelled.
- Links to one or more delivery notes and proof-of-delivery records.

Do not overload the existing generic task table with document or cargo-line semantics. Introduce a dedicated shipment domain and connect it to tasks/trips through explicit foreign keys after reviewing existing lifecycle constraints.

### 2. Cargo lines and quantity units

Each shipment line has a product/customer description and a quantity with an explicit unit of measure. Initial supported units:
- pallet
- carton / case
- package
- piece / unit
- roll / bundle
- container (with type/size)
- kilogram / tonne, only when supplied by a reliable source or measurement

Store planned quantity, delivered quantity, rejected/damaged quantity, and returned quantity separately. Use decimal-safe numeric quantities with unit-specific precision, not floating-point arithmetic. A line can be pallet-count-only with no weight at all. Optional product catalogue defaults may describe packaging, but defaults are never silently promoted into verified vehicle weight.

Pallet tracking must also distinguish:
- customer-owned / exchange pallets,
- pallet type (e.g. EUR/EPAL, disposable, customer-specific),
- delivered, exchanged, returned, and outstanding pallet counts.
A pallet count is not assumed to equal a standard pallet weight or standard pallet dimensions.

### 3. Stop execution

Each stop has ordered cargo actions and a simple status:
- pending, arrived, in_progress, partially_completed, completed, failed, skipped.
- Driver records actual quantity per line, including partial delivery.
- Exception reasons: recipient absent, site closed, refused, damaged, shortage, access issue, unsafe unloading, vehicle issue, other.
- Optional note and photo evidence for exception or damage.
- Timestamp and GPS capture when permission and device capability are available; location evidence is marked unavailable when not provided, never fabricated.
- A stop may be completed only when required line outcomes and proof requirements are satisfied, or an authorized dispatcher records an override with a reason and audit event.

### 4. Delivery notes (תעודות משלוח)

A delivery note is a first-class immutable business document, not just a free-text attachment:
- Fleet/company legal identity and configurable document series/numbering.
- Customer identity, destination, date/time, order and purchase-order references.
- Item lines with descriptions, SKU/customer code where available, quantities and units, delivered/short/damaged/returned quantities.
- Pallet exchange and return counts where applicable.
- Driver, vehicle, shipment and stop references.
- Recipient name, role, signature, signed timestamp, and optional stamp/photo attachments.
- Document status: draft, issued, partially fulfilled, fulfilled, voided/cancelled (with reason); corrections use a linked replacement/credit/correction record rather than silently editing an issued document.
- Rendered PDF snapshot and machine-readable record. PDF generation must be deterministic and preserve the exact issued content.
- Audit trail for issue, signature, amendment, cancellation, download and re-send.

Numbering must be unique within a company/document series and allocated transactionally on the server. Never trust a client-generated document number. Document templates, language, legal fields, retention, and accounting requirements must be configurable per company and validated with Israeli accounting/legal requirements before claiming compliance.

A delivery note is not automatically a tax invoice or receipt. Accounting documents should be generated by or integrated with the customer's authorized ERP/accounting system unless a separately reviewed compliant invoicing module is built.

### 5. Proof of delivery (POD)

POD is a structured record tied to a specific stop and delivery note:
- recipient identity/name and optional role,
- signature captured on device,
- delivery time and optional GPS evidence, captured only after an explicit driver action; no background location tracking,
- delivered quantities and discrepancies,
- photos and attachments,
- driver identity and device/session audit metadata.
Support recipient unavailable/refusal flows with reason and optional dispatcher approval. Store private files in private object storage with short-lived signed access, strict fleet/customer authorization, file-size/type validation, malware scanning where available, and retention/deletion policy. Do not expose public storage URLs.

Offline driver workflow must save a clearly marked local pending draft, queue uploads safely, use idempotency keys, and reconcile server state on reconnect. Never show a delivery as finally issued/signed until the server confirms durable receipt. Signature/photo uploads must be resumable and protected against duplicate submission.

## Vehicle load and safety boundary

- Operational cargo quantities (pallets, cartons, units) are always recorded independently of weight.
- Weight evidence has explicit states: verified_scale, authoritative_document, estimated, unknown, stale. Only verified_scale or a separately approved authoritative source may satisfy rules that require measured weight; estimated/unknown values are never presented as measured.
- If a delivery is pallet-count-only, the driver can complete the operational count and POD without entering kilograms.
- A pallet-only load/unload event does not mutate the verified gross/axle snapshot. It records that cargo composition changed and that the last measurement no longer represents the exact current cargo state.
- The route/safety layer must not infer cargo mass or axle distribution from pallet count. When current verified weight is unavailable, safety decisions must use conservative approved vehicle limits and restriction rules where that is sufficient; any route or operation that requires current actual gross/axle evidence must be marked as requiring verification and must not receive a false safety-approved state.
- A later certified weighing can reconcile the current snapshot and explicitly close the measurement gap.
- The dispatcher UI should explain a block in plain language and offer the next safe action (e.g. weighbridge), not expose technical validation errors to the driver.

## UX principles

### Driver (mobile-first)
1. One assigned route and a prominent next stop.
2. Large actions: Arrived, Start unloading, Confirm quantities, Capture recipient signature, Finish stop.
3. Show only the units relevant to this delivery. If the line is pallet-only, ask “כמה משטחים נפרקו?”—not kilograms.
4. Default planned quantities are visible; driver enters actual quantities only when they differ or confirms all.
5. A short exception flow with common reasons and optional photo/note.
6. Clear offline/pending/synced states and no duplicate taps.
7. Hebrew-first, RTL, accessible controls, with future per-company language configuration.

### Dispatcher / operations
- Create shipment from order, duplicate recurring order, import CSV/ERP/API.
- Plan multiple stops, assign driver/vehicle, track status and exceptions.
- See planned vs delivered quantities, pallet exchange balances, POD and delivery-note status.
- Filter by customer, branch, warehouse, route, driver, vehicle, date and exception.
- Bulk actions for assignment and document export, guarded by role permissions.
- Avoid asking the dispatcher to re-enter data already supplied by ERP/order import.

## Enterprise controls

- Tenant/fleet and branch scoping on every shipment, stop, document, line, event and file.
- Explicit roles and least-privilege access for company admin, branch manager, dispatcher, driver, finance/document viewer, and safety manager.
- Immutable append-only audit events for sensitive transitions.
- Server-side authorization and transactional RPCs for issuing documents, completing stops, recording signatures and allocating numbering.
- Idempotency for all mobile submissions and document issuance.
- Private document storage, encryption in transit/at rest, retention policies, backup/restore tests and access logs.
- Customer/ERP integrations through versioned APIs and import/export adapters; integration failures must be visible and retryable.
- Company-specific document series, fields, templates, workflows and approval policies without creating a separate codebase per customer.

## Delivery roadmap

1. Domain contract and schema review: map existing fleets, tasks, trips, drivers, vehicles, customer data, storage and RLS before adding tables.
2. Cargo quantity primitives and pallet-only stop flow with deterministic unit tests.
3. Shipment and cargo-line schema with cross-tenant composite foreign keys and RLS.
4. Transactional stop completion and idempotent event ledger; keep operational quantity independent from weight evidence.
5. Delivery note issuance, transactional numbering, immutable snapshot/PDF and audit trail.
6. POD signature/photo flow with private storage and offline-safe retry.
7. Dispatcher and driver mobile UX, Hebrew RTL, accessibility and error recovery.
8. CSV/ERP integration, customer-specific templates, reports and exports.
9. Security review, tenant-isolation tests, concurrency tests, document tamper tests, backup/restore, load testing and controlled customer pilot.

## Release and compliance gates

This document defines product direction only. No schema has been applied to Test or Production by this document. No deployment or PR merge is authorized. Before production use, validate document numbering and legal requirements with the customer’s accountant/legal adviser, test signed POD evidence and retention, complete privacy/security review, and run a real pilot with representative dispatchers and drivers.
