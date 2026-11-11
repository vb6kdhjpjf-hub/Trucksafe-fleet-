import { createClient } from "@supabase/supabase-js";
import { buildPTVPredefinedProfilesRequest, getPTVTruckProfileCandidates } from "../../../lib/ptv-vehicle-profiles.mjs";
import { resolveAuthenticatedFleetMembership } from "../../../lib/authenticated-fleet-membership.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const response = (body, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store, max-age=0" } });

export async function GET() {
  return response({ ok: false, reason: "method_not_allowed" }, 405);
}

export async function POST(request) {
  try {
    const authorization = request.headers.get("authorization") || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token || token.length > 8192) {
      return response({ ok: false, reason: "authentication_required" }, 401);
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !publishableKey) {
      return response({ ok: false, reason: "database_not_configured" }, 503);
    }

    const db = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    const { data: access, error: accessError } = await resolveAuthenticatedFleetMembership(db, token);
    if (accessError?.code === "INVALID_SESSION" || accessError?.code === "AUTH_REQUIRED") {
      return response({ ok: false, reason: "invalid_session" }, 401);
    }
    if (accessError || !access) {
      return response({ ok: false, reason: "fleet_membership_required" }, 403);
    }
    const { membership } = access;
    if (!["owner", "fleet_manager"].includes(membership.role)) {
      return response({ ok: false, reason: "fleet_manager_required" }, 403);
    }

    const apiKey = process.env.PTV_API_KEY;
    if (typeof apiKey !== "string" || !apiKey.trim()) {
      return response({ ok: false, reason: "ptv_key_not_configured" }, 503);
    }

    const requestConfig = buildPTVPredefinedProfilesRequest(apiKey);
    const upstream = await fetch(requestConfig.url, {
      method: "GET",
      headers: requestConfig.headers,
      cache: "no-store",
      signal: AbortSignal.timeout(12000)
    });
    if (!upstream.ok) {
      const requestedAt = new Date().toISOString();
      const upstreamBody = await upstream.text().catch(() => "");
      let parsedError = null;
      try { parsedError = JSON.parse(upstreamBody); } catch {}
      const headerTraceId = upstream.headers.get("x-trace-id") || upstream.headers.get("trace-id");
      const traceId = typeof headerTraceId === "string" && headerTraceId.length <= 200
        ? headerTraceId
        : typeof parsedError?.traceId === "string" && parsedError.traceId.length <= 200
          ? parsedError.traceId
          : typeof parsedError?.error?.traceId === "string" && parsedError.error.traceId.length <= 200
            ? parsedError.error.traceId
            : null;
      return response({
        ok: false,
        reason: upstream.status === 401 || upstream.status === 403
          ? "ptv_authentication_rejected"
          : "ptv_data_api_unavailable",
        upstreamStatus: upstream.status,
        traceId,
        requestedAt
      }, 502);
    }

    const payload = await upstream.json().catch(() => null);
    const candidates = getPTVTruckProfileCandidates(payload);
    if (!payload || !Array.isArray(payload.profiles)) {
      return response({ ok: false, reason: "ptv_profile_catalog_malformed" }, 502);
    }

    return response({
      ok: true,
      profileCount: payload.profiles.length,
      truckCandidateCount: candidates.length,
      truckProfiles: candidates.map(profile => ({
        name: profile.name,
        region: profile.region,
        description: profile.description,
        vehicle: {
          height: Number.isFinite(profile.vehicle.height) ? profile.vehicle.height : null,
          width: Number.isFinite(profile.vehicle.width) ? profile.vehicle.width : null,
          length: Number.isFinite(profile.vehicle.length) ? profile.vehicle.length : null,
          totalPermittedWeight: Number.isFinite(profile.vehicle.totalPermittedWeight) ? profile.vehicle.totalPermittedWeight : null,
          totalTechnicallyPermittedWeight: Number.isFinite(profile.vehicle.totalTechnicallyPermittedWeight) ? profile.vehicle.totalTechnicallyPermittedWeight : null,
          numberOfAxles: Number.isFinite(profile.vehicle.numberOfAxles) ? profile.vehicle.numberOfAxles : null,
          numberOfTrailers: Number.isFinite(profile.vehicle.numberOfTrailers) ? profile.vehicle.numberOfTrailers : null,
          axleWeight: Number.isFinite(profile.vehicle.axleWeight) ? profile.vehicle.axleWeight : null
        }
      }))
    });
  } catch (error) {
    return response({
      ok: false,
      reason: error?.name === "TimeoutError" || error?.name === "AbortError"
        ? "ptv_request_timeout"
        : "ptv_request_failed"
    }, 502);
  }
}
