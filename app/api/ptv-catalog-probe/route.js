import { timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function GET(request) {
  const expected = process.env.PTV_CATALOG_PROBE_TOKEN || "";
  const supplied = request.headers.get("x-trucksafe-probe-token") || "";
  if (!expected || !safeEqual(supplied, expected)) {
    return Response.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const key = process.env.PTV_API_KEY || "";
  if (!key) return Response.json({ ok: false, reason: "missing_key" }, { status: 503 });
  try {
    const response = await fetch("https://api.myptv.com/data/v1/vehicle-profiles/predefined", {
      method: "GET",
      headers: { ApiKey: key, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10000)
    });
    const body = await response.json().catch(() => null);
    const profiles = Array.isArray(body?.profiles) ? body.profiles : Array.isArray(body) ? body : [];
    return Response.json({
      ok: response.ok,
      status: response.status,
      profileCount: profiles.length,
      profiles: profiles.slice(0, 80).map(p => ({
        id: typeof p?.id === "string" ? p.id : null,
        name: typeof p?.name === "string" ? p.name : null,
        region: typeof p?.region === "string" ? p.region : null,
        vehicleType: typeof p?.vehicleType === "string" ? p.vehicleType : null,
        dimensions: p?.dimensions && typeof p.dimensions === "object" ? p.dimensions : null,
        weights: p?.weights && typeof p.weights === "object" ? p.weights : null
      })),
      responseShape: body && typeof body === "object" ? Object.keys(body).slice(0, 20) : []
    }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ ok: false, reason: error?.name === "TimeoutError" ? "timeout" : "upstream_error" }, { status: 502 });
  }
}
