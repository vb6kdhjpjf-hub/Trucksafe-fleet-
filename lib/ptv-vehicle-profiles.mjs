const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);
const isNonEmptyString = value => typeof value === "string" && value.trim().length > 0;

/**
 * Return truck-like profiles from the standard PTV Data API response.
 * Do not assume an IMEA profile exists: the standard profile catalogue is
 * region-specific and must be inspected as returned by PTV.
 */
export function getPTVTruckProfileCandidates(payload) {
  if (!isRecord(payload) || !Array.isArray(payload.profiles)) return [];

  return payload.profiles
    .filter(profile =>
      isRecord(profile) &&
      isNonEmptyString(profile.name) &&
      isNonEmptyString(profile.region) &&
      isRecord(profile.vehicle) &&
      /truck|lorry|semitrailer|trailer/i.test(`${profile.name} ${profile.description || ""}`)
    )
    .map(profile => ({
      name: profile.name.trim(),
      description: isNonEmptyString(profile.description) ? profile.description.trim() : "",
      region: profile.region.trim(),
      vehicle: profile.vehicle
    }));
}

/**
 * Select only an explicitly requested region and only if it yields one
 * candidate. Missing region or ambiguous results fail closed.
 */
export function selectUniquePTVTruckProfile(payload, requiredRegion) {
  if (!isNonEmptyString(requiredRegion)) return null;
  const candidates = getPTVTruckProfileCandidates(payload)
    .filter(profile => profile.region.toLowerCase() === requiredRegion.trim().toLowerCase());
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
