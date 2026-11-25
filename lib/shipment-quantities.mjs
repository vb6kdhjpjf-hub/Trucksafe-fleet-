const UNITS = new Set(["pallet", "carton", "package", "piece", "roll", "bundle", "container", "kg", "tonne"]);
const COUNT_UNITS = new Set(["pallet", "carton", "package", "piece", "roll", "bundle", "container"]);
const WEIGHT_UNITS = new Set(["kg", "tonne"]);

function quantity(value, field, allowZero = true) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number < 0 || (!allowZero && number === 0)) {
    throw new TypeError(`${field} must be a finite ${allowZero ? "non-negative" : "positive"} quantity`);
  }
  if (Math.abs(number * 1000 - Math.round(number * 1000)) > 1e-8) {
    throw new TypeError(`${field} supports at most three decimal places`);
  }
  return Math.round(number * 1000) / 1000;
}

export function normalizeCargoLine(line) {
  if (!line || typeof line !== "object") throw new TypeError("Cargo line is required");
  const unit = String(line.unit || "");
  if (!UNITS.has(unit)) throw new TypeError("Unsupported cargo unit");
  const planned = quantity(line.planned_quantity, "planned_quantity", false);
  const delivered = quantity(line.delivered_quantity ?? 0, "delivered_quantity");
  const damaged = quantity(line.damaged_quantity ?? 0, "damaged_quantity");
  const rejected = quantity(line.rejected_quantity ?? 0, "rejected_quantity");
  const returned = quantity(line.returned_quantity ?? 0, "returned_quantity");
  if (delivered + damaged + rejected > planned + 1e-8) {
    throw new RangeError("Delivered, damaged and rejected quantities exceed the planned quantity");
  }
  if (returned > delivered + 1e-8) {
    throw new RangeError("Returned quantity cannot exceed the delivered quantity");
  }
  return Object.freeze({
    line_id: line.line_id == null ? null : String(line.line_id),
    description: String(line.description || "").trim(),
    unit,
    planned_quantity: planned,
    delivered_quantity: delivered,
    damaged_quantity: damaged,
    rejected_quantity: rejected,
    returned_quantity: returned,
    quantity_kind: WEIGHT_UNITS.has(unit) ? "weight" : "count",
    is_weight_measurement: false
  });
}

export function summarizeCargoLines(lines) {
  if (!Array.isArray(lines) || lines.length === 0) throw new TypeError("At least one cargo line is required");
  const normalized = lines.map(normalizeCargoLine);
  const byUnit = {};
  for (const line of normalized) {
    const entry = byUnit[line.unit] || (byUnit[line.unit] = {
      planned: 0, delivered: 0, damaged: 0, rejected: 0, returned: 0
    });
    entry.planned += line.planned_quantity;
    entry.delivered += line.delivered_quantity;
    entry.damaged += line.damaged_quantity;
    entry.rejected += line.rejected_quantity;
    entry.returned += line.returned_quantity;
  }
  const complete = normalized.every(line =>
    line.delivered_quantity + line.damaged_quantity + line.rejected_quantity === line.planned_quantity
  );
  const hasShortage = normalized.some(line =>
    line.delivered_quantity + line.damaged_quantity + line.rejected_quantity < line.planned_quantity
  );
  return Object.freeze({
    lines: normalized,
    by_unit: Object.freeze(byUnit),
    outcome: hasShortage ? "partial" : complete ? "complete" : "partial",
    all_quantities_accounted_for: complete
  });
}

export function normalizePalletExchange(exchange = {}) {
  const delivered = quantity(exchange.delivered ?? 0, "pallets_delivered");
  const received = quantity(exchange.received ?? 0, "pallets_received");
  const damaged = quantity(exchange.damaged ?? 0, "pallets_damaged");
  const outstanding = delivered - received;
  return Object.freeze({
    delivered,
    received,
    damaged,
    outstanding,
    unit: "pallet",
    weight_kg: null,
    is_weight_measurement: false
  });
}

export function assessDeliveryProof({ signature, recipientName, exceptionReason, dispatcherOverride = false } = {}) {
  const signed = Boolean(signature && String(signature).trim() && recipientName && String(recipientName).trim());
  if (signed) return Object.freeze({ accepted: true, proof_status: "signed" });
  if (dispatcherOverride && exceptionReason && String(exceptionReason).trim()) {
    return Object.freeze({ accepted: true, proof_status: "authorized_exception" });
  }
  return Object.freeze({
    accepted: false,
    proof_status: "missing",
    reason: "Recipient signature and name are required, or an authorized dispatcher must record an exception"
  });
}

export function applyCargoChangeToWeightEvidence(evidence = {}) {
  const status = evidence.status || "unknown";
  const knownStatuses = new Set(["verified_scale", "authoritative_document", "estimated", "unknown", "stale"]);
  if (!knownStatuses.has(status)) throw new TypeError("Unknown weight evidence status");
  if (status === "verified_scale" || status === "authoritative_document") {
    return Object.freeze({
      ...evidence,
      status: "stale",
      stale_reason: "Cargo quantity changed after the last verified weight evidence",
      requires_reconciliation: true
    });
  }
  return Object.freeze({
    ...evidence,
    status,
    stale_reason: evidence.stale_reason || null,
    requires_reconciliation: status === "unknown" || status === "estimated" || status === "stale"
  });
}

export const cargoUnitOptions = Object.freeze([
  { value: "pallet", label: "משטחים", kind: "count" },
  { value: "carton", label: "קרטונים", kind: "count" },
  { value: "package", label: "חבילות", kind: "count" },
  { value: "piece", label: "יחידות", kind: "count" },
  { value: "roll", label: "גלילים", kind: "count" },
  { value: "bundle", label: "אגדים", kind: "count" },
  { value: "container", label: "מכולות", kind: "count" },
  { value: "kg", label: "ק״ג", kind: "weight" },
  { value: "tonne", label: "טון", kind: "weight" }
]);
