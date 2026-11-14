import { resolveSingleFleetMembership } from "./fleet-membership.mjs";

export async function resolveFleetWorkspace(client, expectedUserId) {
  if (!client?.auth || !expectedUserId) {
    return { data: null, error: { code: "AUTH_REQUIRED", message: "A verified authenticated user is required." } };
  }

  const { data: authData, error: authError } = await client.auth.getUser();
  const user = authData?.user;
  if (authError || !user || user.id !== expectedUserId) {
    return { data: null, error: { code: "AUTH_REQUIRED", message: "The authenticated user could not be verified." } };
  }

  const { data: membership, error: membershipError } = await resolveSingleFleetMembership(client, user.id);
  if (membershipError) return { data: null, error: membershipError };
  const { data: fleet, error: fleetError } = await client
    .from("fleets")
    .select("id,name")
    .eq("id", membership.fleet_id)
    .single();

  if (fleetError || !fleet) return { data: null, error: { code: "FLEET_LOOKUP_FAILED", message: fleetError?.message || "The fleet could not be loaded." } };
  return { data: { user, membership, fleet: { ...fleet, role: membership.role } }, error: null };
}
