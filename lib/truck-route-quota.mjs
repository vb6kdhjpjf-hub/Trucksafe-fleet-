export async function checkTruckRouteQuota(client) {
  if (!client || typeof client.rpc !== "function") {
    return { allowed: false, status: 503, reason: "quota_unavailable" };
  }

  try {
    const { data, error } = await client.rpc("consume_truck_route_quota");
    if (error) return { allowed: false, status: 503, reason: "quota_unavailable" };
    if (data !== true) return { allowed: false, status: 429, reason: "quota_exceeded" };
    return { allowed: true, status: 200, reason: null };
  } catch {
    return { allowed: false, status: 503, reason: "quota_unavailable" };
  }
}
