export function getTruckRoutingConfig(env = process.env) {
  const explicitlyEnabled = env.TRUCK_ROUTING_ENABLED === "true";
  const providerApproved = env.TRUCK_ROUTING_PROVIDER === "here";
  // The previously configured HERE credential was exposed in chat. Require an explicit
  // rotation attestation and separate usage approval before any paid provider request.
  const credentialRotated = env.HERE_API_KEY_ROTATED === "true";
  const usageApproved = env.HERE_PROVIDER_USAGE_APPROVED === "true";
  const apiKey = explicitlyEnabled && providerApproved && credentialRotated && usageApproved &&
    typeof env.HERE_API_KEY === "string" && env.HERE_API_KEY.trim()
      ? env.HERE_API_KEY
      : null;

  const reason = !explicitlyEnabled
    ? "disabled"
    : !providerApproved
      ? "provider_not_approved"
      : !credentialRotated
        ? "credential_rotation_not_confirmed"
        : !usageApproved
          ? "provider_usage_not_approved"
          : !apiKey
            ? "missing_provider_key"
            : "ready";

  return { configured: Boolean(apiKey), reason, apiKey };
}
