const REQUIRED_DOCUMENTS = Object.freeze([
  { field: "test_due_at", key: "vehicle_test" },
  { field: "insurance_due_at", key: "vehicle_insurance" },
  { field: "registration_due_at", key: "vehicle_registration" }
]);

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function getIsraelCalendarDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return values.year + "-" + values.month + "-" + values.day;
}

/** Missing or expired mandatory vehicle documents block dispatch and route planning. */
export function assessVehicleDocumentCompliance(vehicle, today = getIsraelCalendarDate()) {
  if (!isValidDate(today)) {
    return { ready: false, reason: "invalid_reference_date", missing: [], invalid: [], expired: [] };
  }

  const missing = [];
  const invalid = [];
  const expired = [];
  for (const document of REQUIRED_DOCUMENTS) {
    const value = vehicle?.[document.field];
    if (value == null || value === "") {
      missing.push(document.key);
    } else if (!isValidDate(value)) {
      invalid.push(document.key);
    } else if (value < today) {
      expired.push(document.key);
    }
  }

  if (missing.length || invalid.length || expired.length) {
    return { ready: false, reason: "vehicle_documents_not_current", missing, invalid, expired };
  }
  return { ready: true, reason: null, missing: [], invalid: [], expired: [] };
}
