export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const apiKey = process.env.PTV_API_KEY;
  if (!apiKey) {
    return Response.json(
      { ok: false, stage: "configuration", reason: "PTV_API_KEY_MISSING" },
      { status: 503 }
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const upstream = await fetch(
      "https://api.myptv.com/data/v1/vehicle-profiles/predefined",
      {
        method: "GET",
        headers: { ApiKey: apiKey, Accept: "application/json" },
        cache: "no-store",
        signal: controller.signal,
      }
    );

    return Response.json(
      {
        ok: upstream.ok,
        stage: "ptv_data_api",
        upstreamStatus: upstream.status,
        result: upstream.ok ? "PTV_API_ACCESS_CONFIRMED" : "PTV_API_ACCESS_NOT_CONFIRMED",
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        stage: "ptv_data_api",
        result: error && error.name === "AbortError" ? "UPSTREAM_TIMEOUT" : "UPSTREAM_REQUEST_FAILED",
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } finally {
    clearTimeout(timeout);
  }
}
