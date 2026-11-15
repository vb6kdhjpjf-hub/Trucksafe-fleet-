export function isTruckRouteConfigured({ provider, apiKey, restrictionCoverageApproved, providerApproved }) {
  return provider === "here" &&
    typeof apiKey === "string" &&
    apiKey.trim().length > 0 &&
    restrictionCoverageApproved === "true" &&
    providerApproved === "true";
}
