export function getTruckRoutingConfig(env = process.env) {
  const explicitlyEnabled = env.TRUCK_ROUTING_ENABLED === "true";
  const providerApproved = env.TRUCK_ROUTING_PROVIDER === "here";
  const apiKey = explicitlyEnabled && providerApproved && typeof env.HERE_API_KEY === "string" && env.HERE_API_KEY.trim()
    ? env.HERE_API_KEY
    : null;

  const reason = !explicitlyEnabled
    ? "disabled"
    : !providerApproved
      ? "provider_not_approved"
      : !apiKey
        ? "missing_provider_key"
        : "ready";

  return { configured: Boolean(apiKey), reason, apiKey };
}
