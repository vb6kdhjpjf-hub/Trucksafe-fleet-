import { resolveSingleFleetMembership } from "./fleet-membership.mjs";

export async function resolveAuthenticatedFleetMembership(client, token) {
  if (!client?.auth || typeof token !== "string" || !token || token.length > 8192) {
    return { data: null, error: { code: "AUTH_REQUIRED" } };
  }

  const { data: authData, error: authError } = await client.auth.getUser(token);
  const user = authData?.user;
  if (authError || !user?.id) {
    return { data: null, error: { code: "INVALID_SESSION" } };
  }

  const { data: membership, error: membershipError } =
    await resolveSingleFleetMembership(client, user.id);
  if (membershipError) return { data: null, error: membershipError };

  return { data: { user, membership }, error: null };
}
