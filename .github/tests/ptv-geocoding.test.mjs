import test from "node:test";
import assert from "node:assert/strict";
import { buildPTVGeocodeRequest, normalizePTVGeocodeResult } from "../../lib/ptv-geocoding.mjs";

test("PTV geocoding sends Israel filter and keeps API key out of URL", () => {
  const request = buildPTVGeocodeRequest("מגדל, ישראל", "private-test-key");
  const url = new URL(request.url);
  assert.equal(url.origin, "https://api.myptv.com");
  assert.equal(url.pathname, "/geocoding/v1/locations/by-text");
  assert.equal(url.searchParams.get("searchText"), "מגדל, ישראל");
  assert.equal(url.searchParams.get("countryFilter"), "IL");
  assert.equal(url.searchParams.has("apiKey"), false);
  assert.equal(request.headers.ApiKey, "private-test-key");
});

test("PTV geocoding rejects empty or oversized addresses and missing keys", () => {
  assert.throws(() => buildPTVGeocodeRequest(" ", "key"));
  assert.throws(() => buildPTVGeocodeRequest("a".repeat(181), "key"));
  assert.throws(() => buildPTVGeocodeRequest("Migdal", ""));
});

test("PTV geocoding prefers road access position for truck routing", () => {
  const result = normalizePTVGeocodeResult({
    address: { countryCodeIsoAlpha2: "IL" },
    formattedAddress: "Migdal, Israel",
    referencePosition: { latitude: 32.84, longitude: 35.5 },
    roadAccessPosition: { latitude: 32.841, longitude: 35.501 }
  });
  assert.deepEqual(result, { lat: 32.841, lng: 35.501, label: "Migdal, Israel" });
});

test("PTV geocoding accepts the documented fallback countryCode field", () => {
  const result = normalizePTVGeocodeResult({
    address: { countryCode: "IL" },
    referencePosition: { latitude: 32.8, longitude: 35.4 }
  });
  assert.deepEqual(result, { lat: 32.8, lng: 35.4, label: "" });
});

test("PTV geocoding rejects non-Israeli and out-of-bounds results", () => {
  assert.equal(normalizePTVGeocodeResult({
    address: { countryCodeIsoAlpha2: "DE" },
    referencePosition: { latitude: 32.8, longitude: 35.4 }
  }), null);
  assert.equal(normalizePTVGeocodeResult({
    address: { countryCodeIsoAlpha2: "IL" },
    referencePosition: { latitude: 40, longitude: 35.4 }
  }), null);
  assert.equal(normalizePTVGeocodeResult({
    address: { countryCodeIsoAlpha2: "IL" },
    referencePosition: { latitude: 32.8, longitude: 40 }
  }), null);
  assert.equal(normalizePTVGeocodeResult(null), null);
});
