const SOURCES = new Set(["weighbridge_ticket", "certified_onboard_scale"]);

function isPositiveSafeKg(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function validTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function createDailyLoadState({
  tareWeightKg,
  registeredGrossLimitKg,
  registeredAxleLimitKg,
  currentGrossWeightKg,
  currentHeaviestAxleKg,
  measuredAt,
  measurementSource,
  measurementReference,
}) {
  if (
    !isPositiveSafeKg(tareWeightKg) ||
    !isPositiveSafeKg(registeredGrossLimitKg) ||
    !isPositiveSafeKg(registeredAxleLimitKg) ||
    !isPositiveSafeKg(currentGrossWeightKg) ||
    !isPositiveSafeKg(currentHeaviestAxleKg) ||
    tareWeightKg > currentGrossWeightKg ||
    currentGrossWeightKg > registeredGrossLimitKg ||
    currentHeaviestAxleKg > currentGrossWeightKg ||
    currentHeaviestAxleKg > registeredAxleLimitKg ||
    !validTimestamp(measuredAt) ||
    !SOURCES.has(measurementSource) ||
    typeof measurementReference !== "string" ||
    !measurementReference.trim()
  ) return { ok: false, reason: "invalid_initial_measurement" };

  return {
    ok: true,
    state: {
      tareWeightKg,
      registeredGrossLimitKg,
      registeredAxleLimitKg,
      currentGrossWeightKg,
      currentHeaviestAxleKg,
      revision: 0,
      lastMeasuredAt: measuredAt,
      lastMeasurementSource: measurementSource,
      lastMeasurementReference: measurementReference.trim(),
      appliedEventIds: [],
      events: [],
    },
  };
}

/**
 * Applies one completed loading/unloading operation to a daily load snapshot.
 * The actual gross and heaviest-axle readings are mandatory after every stop;
 * axle load is never estimated from the gross-weight delta.
 */
export function applyDailyLoadOperation(state, operation) {
  if (!state || !operation || typeof operation !== "object") {
    return { ok: false, reason: "invalid_input" };
  }
  const {
    eventId,
    kind,
    quantityKg,
    measuredGrossWeightKg,
    measuredHeaviestAxleKg,
    measuredAt,
    measurementSource,
    measurementReference,
    expectedRevision,
  } = operation;

  if (!Number.isSafeInteger(expectedRevision) || expectedRevision !== state.revision) {
    return { ok: false, reason: "stale_revision" };
  }
  if (typeof eventId !== "string" || !eventId.trim()) {
    return { ok: false, reason: "invalid_event_id" };
  }
  if (state.appliedEventIds.includes(eventId)) {
    return { ok: false, reason: "duplicate_event" };
  }
  if (!["load", "unload"].includes(kind) || !isPositiveSafeKg(quantityKg)) {
    return { ok: false, reason: "invalid_operation" };
  }
  if (
    !isPositiveSafeKg(measuredGrossWeightKg) ||
    !isPositiveSafeKg(measuredHeaviestAxleKg) ||
    !validTimestamp(measuredAt) ||
    !SOURCES.has(measurementSource) ||
    typeof measurementReference !== "string" ||
    !measurementReference.trim()
  ) return { ok: false, reason: "verified_measurement_required" };

  const expectedGrossWeightKg = state.currentGrossWeightKg +
    (kind === "load" ? quantityKg : -quantityKg);
  if (expectedGrossWeightKg < state.tareWeightKg) {
    return { ok: false, reason: "unload_exceeds_cargo" };
  }
  if (expectedGrossWeightKg > state.registeredGrossLimitKg) {
    return { ok: false, reason: "gross_limit_exceeded" };
  }
  if (measuredGrossWeightKg !== expectedGrossWeightKg) {
    return { ok: false, reason: "gross_measurement_mismatch" };
  }
  if (
    measuredHeaviestAxleKg > measuredGrossWeightKg ||
    measuredHeaviestAxleKg > state.registeredAxleLimitKg
  ) return { ok: false, reason: "axle_limit_exceeded" };

  const event = Object.freeze({
    eventId,
    kind,
    quantityKg,
    previousGrossWeightKg: state.currentGrossWeightKg,
    resultingGrossWeightKg: measuredGrossWeightKg,
    resultingHeaviestAxleKg: measuredHeaviestAxleKg,
    measuredAt,
    measurementSource,
    measurementReference: measurementReference.trim(),
    revision: state.revision + 1,
  });

  return {
    ok: true,
    state: {
      ...state,
      currentGrossWeightKg: measuredGrossWeightKg,
      currentHeaviestAxleKg: measuredHeaviestAxleKg,
      revision: state.revision + 1,
      lastMeasuredAt: measuredAt,
      lastMeasurementSource: measurementSource,
      lastMeasurementReference: measurementReference.trim(),
      appliedEventIds: [...state.appliedEventIds, eventId],
      events: [...state.events, event],
    },
    event,
  };
}
