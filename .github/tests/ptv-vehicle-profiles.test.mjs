import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPTVPredefinedProfilesRequest,
  getPTVTruckProfileCandidates,
  selectUniquePTVTruckProfile
} from "../../lib/ptv-vehicle-profiles.mjs";

const profile = (name, region, description = "Typical truck") => ({
  name, region, description,
  vehicle: { height: 380, width: 250, length: 1200, totalPermittedWeight: 26000 }
});

test("builds the documented Data API request and keeps key out of URL", () => {
  const request = buildPTVPredefinedProfilesRequest(" secret ");
  assert.equal(request.url, "https://api.myptv.com/data/v1/vehicle-profiles/predefined");
  assert.equal(request.headers.ApiKey, "secret");
  assert.equal(request.url.includes("secret"), false);
});

test("rejects missing API key", () => {
  assert.throws(() => buildPTVPredefinedProfilesRequest("  "), /Missing PTV API key/);
});

test("returns truck-like profiles from the provider catalogue without assuming a region", () => {
  const result = getPTVTruckProfileCandidates({
    profiles: [
      profile("EUR_TRAILER_TRUCK", "EUROPE", "Typical semi-trailer truck"),
      profile("USA_TRUCK", "AMERICA"),
      profile("EUR_CAR", "EUROPE", "Passenger car"),
      { name: "MALFORMED_TRUCK", region: "EUROPE", description: "Truck" }
    ]
  });
  assert.equal(result.length, 2);
  assert.deepEqual(result.map(item => item.region), ["EUROPE", "AMERICA"]);
});

test("requires an explicit region before selecting a profile", () => {
  assert.equal(selectUniquePTVTruckProfile({ profiles: [profile("EUR_TRUCK", "EUROPE")] }), null);
});

test("does not guess when no truck profile exists for the requested region", () => {
  assert.equal(selectUniquePTVTruckProfile({ profiles: [profile("EUR_TRUCK", "EUROPE")] }, "IMEA"), null);
});

test("does not guess when multiple truck profiles exist in requested region", () => {
  const result = selectUniquePTVTruckProfile({
    profiles: [profile("EUR_TRUCK_A", "EUROPE"), profile("EUR_TRUCK_B", "EUROPE")]
  }, "EUROPE");
  assert.equal(result, null);
});

test("selects exactly one candidate only for explicitly matched region", () => {
  const result = selectUniquePTVTruckProfile({
    profiles: [profile("EUR_TRAILER_TRUCK", "EUROPE"), profile("USA_TRUCK", "AMERICA")]
  }, "EUROPE");
  assert.equal(result.name, "EUR_TRAILER_TRUCK");
});

test("malformed provider payload fails closed", () => {
  assert.deepEqual(getPTVTruckProfileCandidates(null), []);
  assert.deepEqual(getPTVTruckProfileCandidates({ profiles: {} }), []);
});
