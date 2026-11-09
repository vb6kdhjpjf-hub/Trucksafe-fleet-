import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPTVPredefinedProfilesRequest,
  getPTVIMEATruckProfileCandidates,
  selectUniquePTVIMEATruckProfile
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

test("returns only IMEA profiles identified as trucks", () => {
  const result = getPTVIMEATruckProfileCandidates({
    profiles: [
      profile("IMEA_TRUCK_EXAMPLE", "IMEA"),
      profile("EUR_TRUCK_EXAMPLE", "EUROPE"),
      profile("IMEA_CAR_EXAMPLE", "IMEA", "Passenger car"),
      { name: "IMEA_TRUCK_BAD", region: "IMEA", description: "Truck" }
    ]
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].name, "IMEA_TRUCK_EXAMPLE");
});

test("does not guess when no IMEA truck profile exists", () => {
  assert.equal(selectUniquePTVIMEATruckProfile({ profiles: [profile("EUR_TRUCK", "EUROPE")] }), null);
});

test("does not guess when multiple IMEA truck profiles exist", () => {
  const result = selectUniquePTVIMEATruckProfile({
    profiles: [profile("IMEA_TRUCK_A", "IMEA"), profile("IMEA_TRUCK_B", "IMEA")]
  });
  assert.equal(result, null);
});

test("malformed provider payload fails closed", () => {
  assert.deepEqual(getPTVIMEATruckProfileCandidates(null), []);
  assert.deepEqual(getPTVIMEATruckProfileCandidates({ profiles: {} }), []);
});
