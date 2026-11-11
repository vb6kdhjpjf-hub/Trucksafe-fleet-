export async function resolveFleetWorkspace(client, expectedUserId) {
  if (!client?.auth || !expectedUserId) {
    return { data: null, error: { code: "AUTH_REQUIRED", message: "A verified authenticated user is required." } };
  }

  const { data: authData, error: authError } = await client.auth.getUser();
  const user = authData?.user;
  if (authError || !user || user.id !== expectedUserId) {
    return { data: null, error: { code: "AUTH_REQUIRED", message: "The authenticated user could not be verified." } };
  }

  const { data: memberships, error: membershipError } = await client
    .from("fleet_members")
    .select("fleet_id,role")
    .eq("user_id", user.id)
    .limit(2);

  if (membershipError) return { data: null, error: { code: "MEMBERSHIP_LOOKUP_FAILED", message: membershipError.message } };
  const rows = memberships || [];
  if (rows.length === 0) return { data: null, error: { code: "NO_FLEET", message: "No fleet membership was found for this account." } };
  if (rows.length > 1) return { data: null, error: { code: "MULTIPLE_FLEETS", message: "This account belongs to multiple fleets. An explicit fleet selection is required." } };

  const membership = rows[0];
  const { data: fleet, error: fleetError } = await client
    .from("fleets")
    .select("id,name")
    .eq("id", membership.fleet_id)
    .single();

  if (fleetError || !fleet) return { data: null, error: { code: "FLEET_LOOKUP_FAILED", message: fleetError?.message || "The fleet could not be loaded." } };
  return { data: { user, membership, fleet: { ...fleet, role: membership.role } }, error: null };
}
