export function normalizeDeliveryGpsCoordinates(latitude, longitude) {
  if (typeof latitude !== "number" || typeof longitude !== "number" ||
      !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }
  // The database stores NUMERIC(9,6). Normalize before sending so an
  // idempotent retry compares the exact same persisted coordinate values.
  return {
    latitude: Number(latitude.toFixed(6)),
    longitude: Number(longitude.toFixed(6))
  };
}
