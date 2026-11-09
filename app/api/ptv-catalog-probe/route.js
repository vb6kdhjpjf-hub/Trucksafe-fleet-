import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function tokenMatches(expected, provided) {
  if (typeof expected !== "string" || typeof provided !== "string") return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function summarizeProfile(profile) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return null;
  const allowed = [
    "name", "description", "region", "vehicle", "height", "heightAboveFrontAxle",
    "length", "width", "emptyWeight", "loadWeight", "totalPermittedWeight",
    "totalTechnicallyPermittedWeight", "axleWeight", "numberOfAxles", "numberOfTires"
  ];
  const summary = {};
  for (const key of allowed) {
    if (profile[key] !== undefined && ["string", "number", "boolean"].includes(typeof profile[key])) {
      summary[key] = profile[key];
    }
  }
  return Object.keys(summary).length ? summary : { availableFields: Object.keys(profile).slice(0, 40) };
}

export async function GET(request) {
  const expectedToken = process.env.PTV_CATALOG_PROBE_TOKEN;
  const suppliedToken = new URL(request.url).searchParams.get("token");
  if (!tokenMatches(expectedToken, suppliedToken)) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  }

  const apiKey = process.env.PTV_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "ptv_key_not_configured" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const response = await fetch("https://api.myptv.com/data/v1/vehicle-profiles/predefined", {
      method: "GET",
      headers: { ApiKey: apiKey, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(12000)
    });
    const body = await response.text();
    if (!response.ok) {
      return NextResponse.json({
        ok: false,
        error: "ptv_api_error",
        status: response.status,
        responsePreview: body.slice(0, 1200)
      }, { status: 502, headers: { "Cache-Control": "no-store" } });
    }

    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_json_from_ptv" }, { status: 502, headers: { "Cache-Control": "no-store" } });
    }

    const arrays = [];
    const inspect = (value, prefix = "") => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return;
      for (const [key, item] of Object.entries(value)) {
        if (Array.isArray(item)) {
          arrays.push({
            path: prefix ? prefix + "." + key : key,
            count: item.length,
            samples: item.slice(0, 100).map(summarizeProfile).filter(Boolean)
          });
        } else if (item && typeof item === "object") {
          inspect(item, prefix ? prefix + "." + key : key);
        }
      }
    };
    inspect(payload);

    return NextResponse.json({
      ok: true,
      httpStatus: response.status,
      topLevelKeys: Object.keys(payload || {}),
      arrays
    }, { status: 200, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error?.name === "TimeoutError" ? "ptv_request_timeout" : "ptv_request_failed"
    }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
