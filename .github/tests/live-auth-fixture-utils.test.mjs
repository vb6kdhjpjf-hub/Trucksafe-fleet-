import assert from "node:assert/strict";
import test from "node:test";
import { FIXTURE_MARKER, isTruckSafeFixtureUser } from "./live-auth-fixture-utils.mjs";

test("cleanup selector matches only explicitly marked TruckSafe CI users", () => {
  assert.equal(isTruckSafeFixtureUser({
    email: "trucksafe-ci-run@example.com",
    app_metadata: { trucksafe_ci_fixture: FIXTURE_MARKER }
  }), true);
});

test("cleanup selector refuses a matching email without the server-controlled marker", () => {
  assert.equal(isTruckSafeFixtureUser({
    email: "trucksafe-ci-run@example.com",
    user_metadata: { trucksafe_ci_fixture: FIXTURE_MARKER }
  }), false);
});

test("cleanup selector refuses marked users without the dedicated email prefix", () => {
  assert.equal(isTruckSafeFixtureUser({
    email: "someone@example.com",
    app_metadata: { trucksafe_ci_fixture: FIXTURE_MARKER }
  }), false);
});

test("cleanup selector refuses unrelated users", () => {
  assert.equal(isTruckSafeFixtureUser({
    email: "trucksafe-ci-run@example.com",
    app_metadata: { trucksafe_ci_fixture: "other" }
  }), false);
});
