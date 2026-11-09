export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Robots-Tag": "noindex, nofollow"
    }
  });

// Temporary Preview-only diagnostic. Vercel Deployment Protection must remain enabled.
// This endpoint has a fixed upstream URL and never accepts caller-supplied URLs or credentials.
export async function GET() {
  const apiKey = process.env.PTV_API_KEY;
  if (!apiKey) return json({ ok: false, reason: "PTV_API_KEY is not configured" }, 503);

  try {
    const upstream = await fetch(
      "https://api.myptv.com/data/v1/vehicle-profiles/predefined",
      {
        method: "GET",
        headers: { ApiKey: apiKey, Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(12000)
      }
    );

    if (!upstream.ok) {
      return json({ ok: false, upstreamStatus: upstream.status }, 502);
    }

    const data = await upstream.json();
    const profiles = Array.isArray(data?.profiles) ? data.profiles : [];
    const fields = [
      "id", "name", "region", "vehicle", "height", "width", "length",
      "emptyWeight", "loadWeight", "totalPermittedWeight", "axleWeight",
      "numberOfAxles"
    ];
    const safeProfiles = profiles.slice(0, 100).map((profile) => {
      const safe = {};
      for (const field of fields) {
        const value = profile?.[field];
        if (["string", "number", "boolean"].includes(typeof value)) {
          safe[field] = typeof value === "string" ? value.slice(0, 120) : value;
        }
      }
      return safe;
    });

    return json({
      ok: true,
      topLevelKeys: Object.keys(data || {}).slice(0, 30),
      profileCount: profiles.length,
      profiles: safeProfiles
    });
  } catch (error) {
    return json({
      ok: false,
      reason: error?.name === "TimeoutError" ? "upstream_timeout" : "upstream_request_failed"
    }, 502);
  }
}
