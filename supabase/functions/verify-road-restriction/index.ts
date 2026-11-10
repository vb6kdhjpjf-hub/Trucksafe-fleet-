import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") || "")) return json({ error: "Content type must be application/json" }, 415);

  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token || token.length > 8192) return json({ error: "Authentication required" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const reviewerIds = (Deno.env.get("TRUCK_RESTRICTION_REVIEWER_IDS") || "")
    .split(",").map(value => value.trim()).filter(Boolean);
  const allowedHosts = (Deno.env.get("TRUCK_RESTRICTION_ALLOWED_SOURCE_HOSTS") || "")
    .split(",").map(value => value.trim().toLowerCase()).filter(Boolean);

  if (!supabaseUrl || !anonKey || !serviceRoleKey || reviewerIds.length === 0 || allowedHosts.length === 0) {
    return json({ error: "Restriction review is not configured" }, 503);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user || !reviewerIds.includes(authData.user.id)) {
    return json({ error: "Not authorized to verify road restrictions" }, 403);
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > 8192) return json({ error: "Request too large" }, 413);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 8192) return json({ error: "Request too large" }, 413);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "JSON body must be an object" }, 400);

  const restrictionId = typeof body.restrictionId === "string" ? body.restrictionId : "";
  const reviewNote = typeof body.reviewNote === "string" ? body.reviewNote.trim() : "";
  const sourceChecked = body.sourceChecked === true;
  const fieldsChecked = body.fieldsChecked === true;
  if (!uuidPattern.test(restrictionId) || reviewNote.length < 20 || reviewNote.length > 1000 ||
      !sourceChecked || !fieldsChecked) {
    return json({ error: "Restriction ID, review note and explicit source/field checks are required" }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: row, error: readError } = await admin
    .from("road_restrictions")
    .select("id,fleet_id,road_name,restriction_type,max_height_m,max_weight_t,max_width_m,max_length_m,valid_from,valid_until,active_from,active_until,is_active,latitude,longitude,radius_m,source_url,verification_status")
    .eq("id", restrictionId)
    .maybeSingle();
  if (readError || !row) return json({ error: "Restriction not found" }, 404);
  if (row.verification_status === "verified") return json({ error: "Restriction is already verified; use a controlled re-review process" }, 409);
  if (!row.is_active || row.latitude == null || row.longitude == null ||
      row.latitude < 29 || row.latitude > 34 || row.longitude < 34 || row.longitude > 36 ||
      !Number.isInteger(row.radius_m) || row.radius_m < 10 || row.radius_m > 1000) {
    return json({ error: "Restriction is missing an active, valid Israeli location" }, 422);
  }

  let source: URL;
  try {
    source = new URL(row.source_url || "");
  } catch {
    return json({ error: "A valid HTTPS source URL is required" }, 422);
  }
  if (source.protocol !== "https:" || source.username || source.password || source.port || !allowedHosts.includes(source.hostname.toLowerCase())) {
    return json({ error: "Source host is not in the trusted allowlist" }, 422);
  }

  const requiredLimit: Record<string, keyof typeof row> = {
    height: "max_height_m", weight: "max_weight_t", width: "max_width_m", length: "max_length_m"
  };
  const limitField = requiredLimit[row.restriction_type];
  if (limitField && !(typeof row[limitField] === "number" && Number.isFinite(row[limitField]) && row[limitField] > 0)) {
    return json({ error: "The numeric restriction limit is missing or invalid" }, 422);
  }
  if (row.restriction_type === "time_window" && (!row.valid_from || !row.valid_until)) {
    return json({ error: "Both start and end times are required" }, 422);
  }
  if (!["closed", "height", "weight", "width", "length", "time_window"].includes(row.restriction_type)) {
    return json({ error: "This restriction type requires a separate specialist review" }, 422);
  }

  // Compare every safety-relevant field in the UPDATE itself. This makes approval
  // conditional on the exact snapshot reviewed above and closes the read/update race.
  const snapshotFields = [
    "fleet_id", "road_name", "restriction_type", "max_height_m", "max_weight_t",
    "max_width_m", "max_length_m", "valid_from", "valid_until", "active_from",
    "active_until", "is_active", "latitude", "longitude", "radius_m", "source_url"
  ] as const;
  const checkedAt = new Date().toISOString();
  let updateQuery = admin
    .from("road_restrictions")
    .update({
      verification_status: "verified",
      verified_at: checkedAt,
      verified_by: authData.user.id,
      source_last_checked_at: checkedAt,
      verification_note: reviewNote
    })
    .eq("id", restrictionId)
    .eq("verification_status", "unverified");

  for (const field of snapshotFields) {
    const value = row[field];
    updateQuery = value === null
      ? updateQuery.is(field, null)
      : updateQuery.eq(field, value);
  }

  const { data: updated, error: updateError } = await updateQuery.select("id").maybeSingle();
  if (updateError) return json({ error: "Verification update failed" }, 500);
  if (!updated) return json({ error: "Restriction changed during review; refresh and review the current data again" }, 409);

  return json({ verified: true, restrictionId, verifiedAt: checkedAt });
});
