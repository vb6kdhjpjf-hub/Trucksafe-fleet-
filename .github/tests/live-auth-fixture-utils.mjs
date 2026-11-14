export const FIXTURE_MARKER = "trucksafe_ci_auth_fixture_v1";
export const FIXTURE_EMAIL_PREFIX = "trucksafe-ci-";
export const FIXTURE_FLEET_PREFIX = "TRUCKSAFE_CI_FIXTURE_";

export function isTruckSafeFixtureUser(user) {
  return user?.app_metadata?.trucksafe_ci_fixture === FIXTURE_MARKER &&
    typeof user?.email === "string" &&
    user.email.startsWith(FIXTURE_EMAIL_PREFIX) &&
    user.email.endsWith("@example.com");
}
