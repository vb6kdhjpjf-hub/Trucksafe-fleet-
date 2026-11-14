import { createClient } from "@supabase/supabase-js";
import { buildPTVRoutingProbeRequest, assessPTVRoutingProbeResponse } from "../../../lib/ptv-routing-probe.mjs";
import { resolveFleetApiAccess } from "../../../lib/fleet-api-access.mjs";
import { checkTruckRouteQuota } from "../../../lib/truck-route-quota.mjs";

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
    const gate = await resolveFleetApiAccess(db, token, { allowedRoles: ["owner", "fleet_manager"] });
    if (gate.status === 401) return response({ ok: false, reason: gate.reason }, 401);
    if (gate.status === 403) return response({ ok: false, reason: gate.reason }, 403);
    const { membership } = gate.data;

    const apiKey = process.env.PTV_API_KEY;
    if (typeof apiKey !== "string" || !apiKey.trim()) {
      return response({ ok: false, reason: "ptv_key_not_configured" }, 503);
    }

    // Diagnostic requests also call paid provider APIs; share the authenticated
    // per-user quota and fail closed if its database-backed guard is unavailable.
    const quota = await checkTruckRouteQuota(db);
    if (!quota.allowed) {
      return response({
        ok: false,
        reason: quota.reason === "quota_exceeded" ? "provider_request_quota_exceeded" : "provider_request_quota_unavailable"
      }, quota.status);
    }

    const probe = buildPTVRoutingProbeRequest(apiKey);
    const upstream = await fetch(probe.url, {
      method: probe.method,
      headers: probe.headers,
      cache: "no-store",
      signal: AbortSignal.timeout(12000)
    });
    if (!upstream.ok) {
      const traceId = upstream.headers.get("x-trace-id") || upstream.headers.get("trace-id");
      return response({
        ok: false,
        reason: upstream.status === 401 || upstream.status === 403
          ? "ptv_routing_auth_rejected"
          : "ptv_routing_unavailable",
        upstreamStatus: upstream.status,
        traceId: typeof traceId === "string" && traceId.length <= 200 ? traceId : null,
        requestedAt: new Date().toISOString()
      }, 502);
    }

    const payload = await upstream.json().catch(() => null);
    const assessment = assessPTVRoutingProbeResponse(payload);
    if (!assessment.valid) {
      return response({
        ok: false,
        reason: assessment.reason,
        requestedAt: new Date().toISOString()
      }, 502);
    }

    return response({
      ok: true,
      apiConnected: true,
      probeType: "fixed_israel_a_to_b_connectivity_only",
      routeFound: assessment.routeFound,
      providerReportedViolation: assessment.providerReportedViolation,
      distanceMeters: assessment.distanceMeters,
      durationSeconds: assessment.durationSeconds,
      requestedAt: new Date().toISOString(),
      safetyNotice: "This fixed-point connectivity probe uses no truck profile, does not validate Israeli truck restrictions, and is not a route for driving."
    });
  } catch (error) {
    return response({
      ok: false,
      reason: error?.name === "TimeoutError" || error?.name === "AbortError"
        ? "ptv_routing_timeout"
        : "ptv_routing_request_failed"
    }, 502);
  }
}
