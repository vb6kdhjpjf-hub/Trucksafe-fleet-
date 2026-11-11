export async function resolveSingleFleetMembership(client, userId) {
  if (!client || typeof userId !== "string" || !userId) {
    return { data: null, error: { code: "AUTH_REQUIRED" } };
  }

  const { data: memberships, error } = await client
    .from("fleet_members")
    .select("fleet_id,role")
    .eq("user_id", userId)
    .limit(2);

  if (error) {
    return { data: null, error: { code: "MEMBERSHIP_LOOKUP_FAILED", message: error.message } };
  }

  const rows = Array.isArray(memberships) ? memberships : [];
  if (rows.length === 0) return { data: null, error: { code: "NO_FLEET" } };
  if (rows.length > 1) return { data: null, error: { code: "MULTIPLE_FLEETS" } };
  return { data: rows[0], error: null };
}
