const ISRAEL_BOUNDS = Object.freeze({
  minLatitude: 29,
  maxLatitude: 34,
  minLongitude: 34,
  maxLongitude: 36
});

const validCoordinate = (value, min, max) =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

/**
 * Build a PTV text-geocoding request. Credentials are sent only as a header,
 * never as a query parameter, so the URL is safe to log.
 */
export function buildPTVGeocodeRequest(address, apiKey) {
  if (typeof address !== "string" || !address.trim() || address.trim().length > 180) {
    throw new Error("Invalid address for PTV geocoding");
  }
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    throw new Error("Missing PTV API key");
  }

  const url = new URL("https://api.myptv.com/geocoding/v1/locations/by-text");
  url.search = new URLSearchParams({
    searchText: address.trim(),
    countryFilter: "IL"
  }).toString();

  return {
    url: url.toString(),
    headers: { ApiKey: apiKey.trim() }
  };
}

/**
 * Normalize one PTV location record. Truck routing requires an explicit
 * roadAccessPosition; referencePosition can be a rooftop or locality center
 * and is not safe enough to use as a truck departure/arrival point.
 */
export function normalizePTVGeocodeResult(location) {
  if (!location || typeof location !== "object" || Array.isArray(location)) return null;

  const address = location.address || {};
  const countryCode = address.countryCodeIsoAlpha2 || address.countryCode;
  if (countryCode !== "IL") return null;

  const position = location.roadAccessPosition;
  if (!position ||
      !validCoordinate(position.latitude, ISRAEL_BOUNDS.minLatitude, ISRAEL_BOUNDS.maxLatitude) ||
      !validCoordinate(position.longitude, ISRAEL_BOUNDS.minLongitude, ISRAEL_BOUNDS.maxLongitude)) {
    return null;
  }

  return {
    lat: position.latitude,
    lng: position.longitude,
    label: typeof location.formattedAddress === "string" && location.formattedAddress.trim()
      ? location.formattedAddress.slice(0, 240)
      : ""
  };
}

/**
 * PTV returns { locations: [...] }, ordered by matching score. Select the
 * first record that passes the strict Israel/country/coordinate checks.
 */
export function normalizePTVGeocodeResponse(payload) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.locations)) return null;

  for (const location of payload.locations) {
    const normalized = normalizePTVGeocodeResult(location);
    if (normalized) return normalized;
  }
  return null;
}
