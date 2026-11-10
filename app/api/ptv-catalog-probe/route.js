import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const apiKey = process.env.PTV_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "PTV_API_KEY_MISSING" }, { status: 503 });
  }

  try {
    // Fixed PTV Data API URL; credentials remain server-side.
    const upstream = await fetch(
      "https://api.myptv.com/data/v1/vehicle-profiles/predefined",
      {
        method: "GET",
        headers: { ApiKey: apiKey, Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
      }
    );

    const contentType = upstream.headers.get("content-type") || "";
    const result = {
      ok: upstream.ok,
      upstreamStatus: upstream.status,
      contentType,
      profileCount: null,
      sampleProfiles: [],
      responseShape: null,
    };

    if (upstream.ok && contentType.includes("application/json")) {
      const body = await upstream.json();
      const profiles = Array.isArray(body?.profiles) ? body.profiles : [];
      result.profileCount = profiles.length;
      result.responseShape = {
        topLevelKeys: Object.keys(body || {}).slice(0, 20),
        firstProfileKeys: profiles[0] && typeof profiles[0] === "object"
          ? Object.keys(profiles[0]).slice(0, 30)
          : [],
        firstVehicleKeys: profiles[0]?.vehicle && typeof profiles[0].vehicle === "object"
          ? Object.keys(profiles[0].vehicle).slice(0, 30)
          : [],
      };
      result.sampleProfiles = profiles.slice(0, 12).map((profile) => ({
        id: typeof profile?.id === "string" ? profile.id : null,
        name: typeof profile?.name === "string" ? profile.name : null,
        description: typeof profile?.description === "string" ? profile.description.slice(0, 160) : null,
        vehicleType: profile?.vehicle?.type ?? profile?.vehicleType ?? null,
        country: profile?.country ?? profile?.region ?? null,
      }));
    }

    return NextResponse.json(result, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error?.name === "TimeoutError" ? "PTV_REQUEST_TIMEOUT" : "PTV_REQUEST_FAILED",
    }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
