const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);
const isNonEmptyString = value => typeof value === "string" && value.trim().length > 0;

/**
 * Validate the public PTV Data API profile envelope without guessing profile
 * identifiers. Only IMEA truck candidates are returned; callers must resolve
 * ambiguity from the live provider response before routing is enabled.
 */
export function getPTVIMEATruckProfileCandidates(payload) {
  if (!isRecord(payload) || !Array.isArray(payload.profiles)) return [];

  return payload.profiles
    .filter(profile =>
      isRecord(profile) &&
      profile.region === "IMEA" &&
      isNonEmptyString(profile.name) &&
      isRecord(profile.vehicle) &&
      /truck/i.test(`${profile.name} ${profile.description || ""}`)
    )
    .map(profile => ({
      name: profile.name.trim(),
      description: isNonEmptyString(profile.description) ? profile.description.trim() : "",
      region: profile.region,
      vehicle: profile.vehicle
    }));
}

/**
 * A profile is selected only when exactly one IMEA truck candidate exists.
 * Zero or multiple candidates fail closed instead of guessing.
 */
export function selectUniquePTVIMEATruckProfile(payload) {
  const candidates = getPTVIMEATruckProfileCandidates(payload);
  return candidates.length === 1 ? candidates[0] : null;
}

/**
 * Build the documented Data API request. The key is sent only in a header.
 * This helper does not perform a network request.
 */
export function buildPTVPredefinedProfilesRequest(apiKey) {
  if (!isNonEmptyString(apiKey)) throw new Error("Missing PTV API key");

  return {
    url: "https://api.myptv.com/data/v1/vehicle-profiles/predefined",
    headers: { ApiKey: apiKey.trim(), Accept: "application/json" }
  };
}
