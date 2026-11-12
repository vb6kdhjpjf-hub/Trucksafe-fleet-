import { resolveAuthenticatedFleetMembership } from "./authenticated-fleet-membership.mjs";
import { isSupportedFleetRole } from "./fleet-membership.mjs";

export async function resolveFleetApiAccess(client, token, options = {}) {
  const { data: access, error } = await resolveAuthenticatedFleetMembership(client, token);

  if (error?.code === "INVALID_SESSION" || error?.code === "AUTH_REQUIRED") {
    return { data: null, status: 401, reason: "invalid_session" };
  }
  if (error || !access) {
    return { data: null, status: 403, reason: "fleet_membership_required" };
  }

  const membership = access.membership;
  if (!membership || typeof membership.fleet_id !== "string" || !membership.fleet_id ||
      !isSupportedFleetRole(membership.role)) {
    return { data: null, status: 403, reason: "fleet_membership_invalid" };
  }

  const allowedRoles = options.allowedRoles;
  if (Array.isArray(allowedRoles) && !allowedRoles.includes(access.membership.role)) {
    return { data: null, status: 403, reason: "fleet_manager_required" };
  }

  return { data: access, status: 200, reason: null };
}
