import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCargoLine, summarizeCargoLines, normalizePalletExchange,
  assessDeliveryProof, applyCargoChangeToWeightEvidence
} from "../../lib/shipment-quantities.mjs";

test("pallet-only cargo line is valid without any weight field", () => {
  const line = normalizeCargoLine({ description: "משטחי משקה", unit: "pallet", planned_quantity: 12, delivered_quantity: 10 });
  assert.equal(line.unit, "pallet");
  assert.equal(line.delivered_quantity, 10);
  assert.equal(line.quantity_kind, "count");
  assert.equal(line.is_weight_measurement, false);
  assert.equal("weight_kg" in line, false);
});

test("supports multiple independent units without converting them", () => {
  const summary = summarizeCargoLines([
    { unit: "pallet", planned_quantity: 8, delivered_quantity: 8 },
    { unit: "carton", planned_quantity: 24, delivered_quantity: 20, damaged_quantity: 2, rejected_quantity: 2 },
    { unit: "kg", planned_quantity: 125.5, delivered_quantity: 125.5 }
  ]);
  assert.equal(summary.outcome, "complete");
  assert.equal(summary.by_unit.pallet.delivered, 8);
  assert.equal(summary.by_unit.carton.delivered, 20);
  assert.equal(summary.by_unit.kg.delivered, 125.5);
});

test("does not allow cargo outcomes to exceed planned quantity", () => {
  assert.throws(() => normalizeCargoLine({
    unit: "pallet", planned_quantity: 10, delivered_quantity: 9, damaged_quantity: 2
  }), /exceed/);
});

test("returned quantity cannot exceed delivered quantity", () => {
  assert.throws(() => normalizeCargoLine({
    unit: "pallet", planned_quantity: 10, delivered_quantity: 2, returned_quantity: 3
  }), /Returned quantity/);
});

test("rejects unsupported units, zero plan quantities and excess precision", () => {
  assert.throws(() => normalizeCargoLine({ unit: "unknown", planned_quantity: 1 }), /Unsupported/);
  assert.throws(() => normalizeCargoLine({ unit: "pallet", planned_quantity: 0 }), /positive/);
  assert.throws(() => normalizeCargoLine({ unit: "kg", planned_quantity: 1.1234 }), /three decimal/);
});

test("pallet exchange is counted independently and never becomes a weight", () => {
  const exchange = normalizePalletExchange({ delivered: 10, received: 7, damaged: 1 });
  assert.equal(exchange.outstanding, 3);
  assert.equal(exchange.weight_kg, null);
  assert.equal(exchange.is_weight_measurement, false);
});

test("delivery proof requires signature or an authorized exception", () => {
  assert.equal(assessDeliveryProof({}).accepted, false);
  assert.equal(assessDeliveryProof({ signature: "sig", recipientName: "Dana" }).proof_status, "signed");
  assert.equal(assessDeliveryProof({ exceptionReason: "Recipient refused", dispatcherOverride: true }).accepted, true);
  assert.equal(assessDeliveryProof({ exceptionReason: "Recipient refused" }).accepted, false);
});

test("a cargo count change makes prior weight evidence stale without inventing a new weight", () => {
  const result = applyCargoChangeToWeightEvidence({ status: "verified_scale", gross_weight_kg: 18500 });
  assert.equal(result.status, "stale");
  assert.equal(result.gross_weight_kg, 18500);
  assert.equal(result.requires_reconciliation, true);
  assert.equal(applyCargoChangeToWeightEvidence({ status: "unknown" }).status, "unknown");
});
