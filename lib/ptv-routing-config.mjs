const nonEmpty = value => typeof value === "string" && value.trim().length > 0;

/**
 * PTV is deliberately isolated from the existing HERE configuration.
 * A provider request is possible only after all feature, provider, credential,
 * and usage-consent gates have been explicitly enabled.
 */
export function getPTVRoutingConfig(env = process.env) {
  const explicitlyEnabled = env.TRUCK_ROUTING_ENABLED === "true";
  const providerSelected = env.TRUCK_ROUTING_PROVIDER === "ptv";
  const apiKey = nonEmpty(env.PTV_API_KEY) ? env.PTV_API_KEY.trim() : null;
  const usageApproved = env.PTV_PROVIDER_USAGE_APPROVED === "true";
  const freePlanConfirmed = env.PTV_FREE_PLAN_CONFIRMED === "true";

  const ready = explicitlyEnabled && providerSelected && Boolean(apiKey) &&
    usageApproved && freePlanConfirmed;

  const reason = !explicitlyEnabled
    ? "disabled"
    : !providerSelected
      ? "provider_not_selected"
      : !apiKey
        ? "missing_provider_key"
        : !usageApproved
          ? "provider_usage_not_approved"
          : !freePlanConfirmed
            ? "free_plan_not_confirmed"
            : "ready";

  return {
    configured: ready,
    reason,
    apiKey: ready ? apiKey : null
  };
}
