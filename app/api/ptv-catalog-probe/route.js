import { timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body, status = 200) => Response.json(body, {
  status,
  headers: { "Cache-Control": "no-store, max-age=0", "Pragma": "no-cache" }
});

function authorized(request) {
  const expected = process.env.PTV_CATALOG_PROBE_TOKEN || "";
  const supplied = request.headers.get("x-trucksafe-probe-token") || "";
  if (!expected || !supplied || expected.length !== supplied.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}

export async function GET() {
  return json({ error: "not_found" }, 404);
}

export async function POST(request) {
  if (!authorized(request)) return json({ error: "not_found" }, 404);
  const apiKey = process.env.PTV_API_KEY || "";
  if (!apiKey) return json({ error: "ptv_key_missing" }, 503);

  try {
    const response = await fetch("https://api.myptv.com/data/v1/vehicle-profiles/predefined", {
      method: "GET",
      headers: { ApiKey: apiKey, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      return json({ ok: false, providerStatus: response.status, error: response.status === 401 ? "invalid_api_key_or_access" : "provider_request_failed" }, 200);
    }

    const payload = await response.json();
    if (!payload || !Array.isArray(payload.profiles)) {
      return json({ ok: false, error: "unexpected_catalog_schema", topLevelKeys: payload && typeof payload === "object" ? Object.keys(payload).slice(0, 30) : [] }, 200);
    }

    const profiles = payload.profiles.slice(0, 100).map(profile => {
      const vehicle = profile?.vehicle && typeof profile.vehicle === "object" ? profile.vehicle : {};
      const safeVehicle = {};
      for (const key of [
        "height", "heightAboveFrontAxle", "length", "width", "emptyWeight",
        "loadWeight", "totalPermittedWeight", "totalTechnicallyPermittedWeight",
        "axleWeight", "numberOfAxles", "numberOfTires"
      ]) {
        const value = vehicle[key];
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
          safeVehicle[key] = value;
        }
      }
      return {
        name: typeof profile?.name === "string" ? profile.name.slice(0, 120) : null,
        region: typeof profile?.region === "string" ? profile.region.slice(0, 80) : null,
        description: typeof profile?.description === "string" ? profile.description.slice(0, 240) : null,
        vehicle: safeVehicle
      };
    });

    return json({
      ok: true,
      profileCount: payload.profiles.length,
      returnedCount: profiles.length,
      profiles
    });
  } catch (error) {
    return json({
      ok: false,
      error: error?.name === "TimeoutError" ? "provider_timeout" : "provider_network_error"
    }, 200);
  }
}
