export function isTruckRouteConfigured({ provider, apiKey, restrictionCoverageApproved }) {
  return provider === "here" &&
    typeof apiKey === "string" &&
    apiKey.trim().length > 0 &&
    restrictionCoverageApproved === "true";
}
