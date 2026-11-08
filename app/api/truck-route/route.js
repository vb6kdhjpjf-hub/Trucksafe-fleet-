import { getTruckRoutingConfig } from "../../../lib/truck-routing-config.mjs";
import { getSavedTruckRoutingProfile } from "../../../lib/truck-routing-profile.mjs";
import { evaluateFleetRestrictions, decodeFlexiblePolyline, hasBlockingHereNotice } from "../../../lib/road-restriction-geometry.mjs";
import { buildHereTruckVehicleParams } from "../../../lib/here-truck-parameters.mjs";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const response = (body, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store, max-age=0" } });

const numberInRange = (value, min, max) =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

async function geocode(address, apiKey) {
  const url = new URL("https://geocode.search.hereapi.com/v1/geocode");
  url.search = new URLSearchParams({
    q: address,
    in: "countryCode:ISR",
    lang: "he-IL",
    limit: "1",
    apiKey
  }).toString();

  const result = await fetch(url, { signal: AbortSignal.timeout(12000), cache: "no-store" });
  if (!result.ok) {
    throw new Error(`geocoding_unavailable_http_${result.status}`);
  }
  const data = await result.json();
  const place = data.items?.[0];
  if (!place?.position || place.address?.countryCode !== "ISR") return null;
  if (!numberInRange(place.position.lat, 29, 34) || !numberInRange(place.position.lng, 34, 36)) return null;
  return {
    lat: place.position.lat,
    lng: place.position.lng,
    label: place.address?.label || address
  };
}

export async function GET() {
  return response({ configured: getTruckRoutingConfig().configured });
}

export async function POST(request) {
  let stage = "request_start";
  try {
    if (!request.headers.get("content-type")?.includes("application/json")) {
      return response({ error: "יש לשלוח בקשה בפורמט JSON." }, 415);
    }
    stage = "read_authorization";
    const authorization = request.headers.get("authorization") || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token || token.length > 8192) return response({ error: "נדרשת התחברות מחדש למערכת." }, 401);

    stage = "read_supabase_config";
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !publishableKey) return response({ error: "חיבור מסד הנתונים אינו מוגדר." }, 503);

    const db = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    stage = "validate_user_session";
    const { data: authData, error: authError } = await db.auth.getUser(token);
    if (authError || !authData?.user) return response({ error: "החיבור אינו תקף. יש להתחבר מחדש." }, 401);

    stage = "read_request_body";
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > 16000) {
      return response({ error: "הבקשה גדולה מדי." }, 413);
    }
    let raw;
    try {
      raw = JSON.parse(rawBody);
    } catch {
      return response({ error: "נתוני הבקשה אינם JSON תקין." }, 400);
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return response({ error: "נתוני הנסיעה אינם תקינים." }, 400);
    }
    const originText = typeof raw.origin === "string" ? raw.origin.trim() : "";
    const originCoordinates = raw.originCoordinates;
    const hasOriginCoordinates = originCoordinates &&
      numberInRange(originCoordinates.lat, 29, 34) &&
      numberInRange(originCoordinates.lng, 34, 36);
    const usesCoordinates = originCoordinates !== null && originCoordinates !== undefined;
    const destinationText = typeof raw.destination === "string" ? raw.destination.trim() : "";
    if (!originText || !destinationText || originText.length > 180 || destinationText.length > 180) {
      return response({ error: "יש להזין מוצא ויעד בישראל, עד 180 תווים לכל כתובת." }, 400);
    }
    if (usesCoordinates && !hasOriginCoordinates) {
      return response({ error: "המיקום הנוכחי אינו תקין או נמצא מחוץ לישראל. אפשר להזין מוצא ידני." }, 400);
    }

    const vehicleId = typeof raw.vehicleId === "string" ? raw.vehicleId : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(vehicleId)) {
      return response({ error: "יש לבחור רכב שמור מהצי לפני חישוב מסלול." }, 400);
    }

    stage = "load_saved_vehicle_profile";
    const { data: vehicle, error: vehicleError } = await db
      .from("vehicles")
      .select("id,fleet_id,is_demo,routing_vehicle_type,height_cm,width_cm,length_cm,gross_weight_kg,axle_count,trailer_count,weight_per_axle_kg")
      .eq("id", vehicleId)
      .eq("is_demo", false)
      .maybeSingle();
    if (vehicleError || !vehicle) {
      return response({ error: "הרכב לא נמצא בצי שלך או שאין לך הרשאה להשתמש בו." }, 403);
    }

    stage = "check_fleet_membership";
    const { data: membership, error: membershipError } = await db
      .from("fleet_members")
      .select("fleet_id")
      .eq("user_id", authData.user.id)
      .eq("fleet_id", vehicle.fleet_id)
      .maybeSingle();
    if (membershipError || !membership) {
      return response({ error: "אין לחשבון הרשאה לתכנון מסלולים עבור הרכב שנבחר." }, 403);
    }

    const profile = getSavedTruckRoutingProfile(vehicle);
    if (!profile) {
      return response({ error: "חסרים נתוני רכב תקינים בפרופיל השמור. יש לעדכן מידות, משקל כולל, מספר סרנים ועומס בפועל על הסרן הכבד ביותר לפי רישיון הרכב, מסמכי היצרן או שקילה מאומתת לפני חישוב מסלול." }, 422);
    }

    const currentWeightKg = Number(raw.currentWeightKg);
    if (!numberInRange(currentWeightKg, 1000, 100000) || currentWeightKg > profile.grossWeightKg) {
      return response({ error: "המשקל בפועל חייב להיות תקין וקטן או שווה למשקל הכולל המותר בפרופיל הרכב." }, 400);
    }


    stage = "read_fleet_road_restrictions";
    const { data: fleetRestrictions, error: restrictionsError, count: restrictionsCount } = await db
      .from("road_restrictions")
      .select("id,road_name,restriction_type,max_height_m,max_weight_t,max_width_m,max_length_m,valid_from,valid_until,active_from,active_until,is_active,latitude,longitude,radius_m,source_url,verification_status,verified_at,verified_by,source_last_checked_at,verification_note", { count: "exact" })
      .eq("fleet_id", vehicle.fleet_id)
      .eq("is_active", true)
      .limit(500);
    if (restrictionsError || (restrictionsCount ?? 0) > 500) {
      return response({ error: "לא ניתן לבדוק את כל מגבלות הדרך של הצי. לא הוצג מסלול כדי למנוע הסתמכות על בדיקה חלקית." }, 503);
    }

    stage = "read_routing_config";
    const routing = getTruckRoutingConfig();
    const apiKey = routing.apiKey;
    if (!apiKey) return response({ error: "מנוע ניתוב המשאיות מושבת או לא הוגדר במלואו. אין להשתמש במסלול עד להשלמת אישור הספק, הגדרה ובדיקות בטיחות." }, 503);

    stage = "geocode_addresses";
    const [origin, destination] = await Promise.all([
      hasOriginCoordinates
        ? Promise.resolve({ lat: originCoordinates.lat, lng: originCoordinates.lng, label: "המיקום הנוכחי" })
        : geocode(originText, apiKey),
      geocode(destinationText, apiKey)
    ]);
    if (!origin || !destination) {
      return response({ error: "לא הצלחתי לזהות אחת הכתובות בישראל. נסה כתובת מדויקת יותר או הוסף עיר." }, 422);
    }

    const url = new URL("https://router.hereapi.com/v8/routes");
    const departureAt = new Date();
    const params = {
      ...buildHereTruckVehicleParams(profile, currentWeightKg),
      transportMode: "truck",
      origin: `${origin.lat},${origin.lng}`,
      destination: `${destination.lat},${destination.lng}`,
      departureTime: departureAt.toISOString(),
      return: "polyline,summary,actions,instructions,potentialTimeDependentViolations",
      lang: "he-IL",
      "avoid[features]": "dirtRoad,uTurns",
      apiKey
    };
    url.search = new URLSearchParams(params).toString();

    stage = "call_here_truck_router";
    const routeResponse = await fetch(url, { signal: AbortSignal.timeout(15000), cache: "no-store" });
    stage = "parse_here_route_response";
    const routeData = await routeResponse.json().catch(() => null);
    if (!routeResponse.ok) return response({ error: "ספק הניווט לא הצליח לחשב מסלול. בדוק את פרטי הרכב ונסה שוב." }, 502);

    const route = routeData?.routes?.[0];
    if (!route?.sections?.length) return response({ error: "לא נמצא מסלול למשאית לפי הנתונים שהוזנו. אין להחליף למסלול רכב פרטי." }, 422);
    try {
      if (route.sections.some(section => typeof section.polyline !== "string" || !section.polyline)) {
        throw new Error("Missing route geometry");
      }
      for (const section of route.sections) {
        const coordinates = decodeFlexiblePolyline(section.polyline);
        if (coordinates.length < 2) throw new Error("Incomplete route geometry");
      }
    } catch {
      return response({ error: "נתוני הגיאומטריה של המסלול אינם תקינים. המסלול נחסם ולא יוצג לנהג." }, 502);
    }

    const notices = [...(route.notices || []), ...route.sections.flatMap(section => section.notices || [])].map(notice => ({
      code: String(notice.code || "notice").slice(0, 100),
      severity: String(notice.severity || "info").slice(0, 30),
      title: String(notice.title || notice.code || "הודעת ניווט").slice(0, 240)
    }));
    const actions = route.sections.flatMap(section => (section.actions || [])
      .filter(action => typeof action.instruction === "string" && action.instruction.trim())
      .map(action => ({
        instruction: action.instruction.slice(0, 300),
        length: Number.isFinite(action.length) ? action.length : null,
        duration: Number.isFinite(action.duration) ? action.duration : null
      })));
    const critical = notices.some(notice => notice.severity.toLowerCase() === "critical");
    const blockingProviderNotice = notices.some(hasBlockingHereNotice);
    if (blockingProviderNotice) {
      return response({
        error: "ספק הניווט דיווח על הפרת מגבלת משאית קריטית במסלול. המסלול נחסם ולא יוצג לנהג.",
        criticalNotices: notices
      }, 422);
    }
    const restrictionCheck = evaluateFleetRestrictions({
      sections: route.sections,
      restrictions: fleetRestrictions || [],
      vehicle: profile,
      currentWeightKg,
      now: departureAt
    });
    if (restrictionCheck.unresolved.length > 0) {
      return response({
        error: "לא ניתן לאמת את כל מגבלות הדרך הרלוונטיות למסלול. המסלול לא יוצג עד להשלמת בדיקת המידע.",
        unresolvedRestrictions: restrictionCheck.unresolved.map(item => ({
          roadName: item.roadName,
          reason: item.reason
        }))
      }, 409);
    }
    if (restrictionCheck.conflicts.length > 0) {
      return response({
        error: "המסלול חוצה מגבלת דרך מאומתת שאינה מתאימה לרכב. לא הוצג מסלול לנסיעה.",
        restrictionConflicts: restrictionCheck.conflicts.map(item => ({
          roadName: item.roadName,
          restrictionType: item.restrictionType
        }))
      }, 422);
    }
    const distance = route.sections.reduce((sum, section) => sum + (Number(section.summary?.length) || 0), 0);
    const duration = route.sections.reduce((sum, section) => sum + (Number(section.summary?.duration) || 0), 0);

    return response({
      origin: origin.label,
      destination: destination.label,
      distanceMeters: distance,
      durationSeconds: duration,
      hasCriticalNotices: critical,
      restrictionValidation: {
        manualRestrictionsValidated: restrictionCheck.validated,
        unresolvedNearbyRestrictions: restrictionCheck.unresolved.length,
        officialNationalRestrictionsIntegrated: false
      },
      notices,
      actions,
      sections: route.sections.map(section => ({ polyline: section.polyline || "" }))
    });
  } catch (error) {
    // Do not log raw exception messages: provider/network errors can contain full
    // request URLs, and HERE URLs include the server-side API key in the query.
    console.error("Truck route API failure", { stage, name: String(error?.name || "Error").slice(0, 80) });
    const message = error?.name === "TimeoutError"
      ? "שירות הניווט לא הגיב בזמן. בדוק חיבור ונסה שוב."
      : "אירעה תקלה זמנית בחישוב המסלול. נסה שוב בעוד רגע.";
    return response({ error: message }, 500);
  }
}
