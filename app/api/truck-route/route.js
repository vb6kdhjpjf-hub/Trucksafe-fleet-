import { createClient } from "@supabase/supabase-js";
import { selectSafeTruckRoute } from "../../../lib/road-restriction-geometry.mjs";
import { isTruckRouteConfigured } from "../../../lib/truck-route-readiness.mjs";
import { getSavedTruckRoutingProfile } from "../../../lib/truck-routing-profile.mjs";
import { assessVehicleSpecialRouting } from "../../../lib/vehicle-capabilities.mjs";
import { validateTruckTripWeights } from "../../../lib/truck-trip-weight.mjs";
import { checkTruckRouteQuota } from "../../../lib/truck-route-quota.mjs";
import { readJsonBodyLimited } from "../../../lib/request-body-limits.mjs";
import { resolveFleetApiAccess } from "../../../lib/fleet-api-access.mjs";
import { loadFleetRoadRestrictions } from "../../../lib/fleet-road-restrictions.mjs";
import { summarizeRejectedRouteCandidates } from "../../../lib/truck-route-rejection.mjs";

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
  if (!result.ok) throw new Error("geocoding_unavailable");
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
  const configured = isTruckRouteConfigured({
    provider: process.env.TRUCK_ROUTING_PROVIDER,
    apiKey: process.env.HERE_API_KEY,
    restrictionCoverageApproved: process.env.TRUCK_RESTRICTION_COVERAGE_APPROVED
  });
  return response({ configured });
}

export async function POST(request) {
  try {
    if (!request.headers.get("content-type")?.includes("application/json")) {
      return response({ error: "יש לשלוח בקשה בפורמט JSON." }, 415);
    }
    const authorization = request.headers.get("authorization") || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token || token.length > 8192) return response({ error: "נדרשת התחברות מחדש למערכת." }, 401);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !publishableKey) return response({ error: "חיבור מסד הנתונים אינו מוגדר." }, 503);

    const db = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    const gate = await resolveFleetApiAccess(db, token);
    if (gate.status === 401) return response({ error: "החיבור אינו תקף. יש להתחבר מחדש." }, 401);
    if (gate.status === 403) return response({ error: "אין לחשבון הרשאה לצי יחיד ומאומת לתכנון מסלולים." }, 403);
    const { membership } = gate.data;

    if (process.env.TRUCK_RESTRICTION_COVERAGE_APPROVED !== "true") {
      return response({ error: "ניווט משאיות חסום עד לאימות כיסוי ארצי ועדכני של מגבלות הדרך. אין להסתמך על המאגר החלקי כמסלול בטוח." }, 503);
    }

    const apiKey = process.env.TRUCK_ROUTING_PROVIDER === "here" ? process.env.HERE_API_KEY : null;
    if (!apiKey) return response({ error: "מנוע ניתוב המשאיות עדיין לא הופעל. יש להשלים חיבור לספק מאושר ולבדוק אותו לפני שימוש." }, 503);

    const parsedBody = await readJsonBodyLimited(request, 16000);
    if (!parsedBody.ok) {
      return response({
        error: parsedBody.status === 413 ? "הבקשה גדולה מדי." : "גוף הבקשה אינו תקין."
      }, parsedBody.status);
    }
    const raw = parsedBody.value;
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
    if (!/^[0-9a-f-]{36}$/i.test(vehicleId)) {
      return response({ error: "יש לבחור רכב שמור מהצי לפני תכנון מסלול." }, 400);
    }

    const { data: savedVehicle, error: vehicleError } = await db
      .from("vehicles")
      .select("id,fleet_id,status,is_demo,registration_verification_status,registration_document_path,registration_verified_at,registration_verified_by,body_type,routing_vehicle_type,height_cm,width_cm,length_cm,gross_weight_kg,empty_weight_kg,axle_count,trailer_count,weight_per_axle_kg")
      .eq("id", vehicleId)
      .eq("fleet_id", membership.fleet_id)
      .maybeSingle();

    if (vehicleError || !savedVehicle) {
      return response({ error: "הרכב שנבחר אינו קיים בצי הפעיל או שאין הרשאה לצפות בו." }, 404);
    }
    if (!["available", "assigned"].includes(savedVehicle.status)) {
      return response({ error: "אפשר לתכנן מסלול רק לרכב זמין או משויך שאינו בטיפול או מושבת." }, 409);
    }

    let specialEquipment = null;
    const specialTypes = new Set(["articulated_crane","telescopic_crane","loader_crane","heavy_lift_crane","mobile_crane","aerial_platform","recovery_crane","concrete_pump","other_special","low_loader"]);
    if (specialTypes.has(savedVehicle.body_type)) {
      const { data, error } = await db.from("vehicle_special_equipment")
        .select("id,fleet_id,vehicle_id,travel_height_cm,travel_width_cm,travel_length_cm,working_height_cm,max_outreach_cm,max_lifting_capacity_kg,axle_configuration,lifting_chart_document_path,evidence_status,evidence_verified_at,evidence_verified_by")
        .eq("fleet_id",membership.fleet_id).eq("vehicle_id",vehicleId).maybeSingle();
      if(error||!data)return response({error:"חסר פרופיל ציוד מיוחד מאומת. אין לחשב מסלול למנוף או לרכב ייעודי עד להשלמת בדיקת הציוד."},409);
      specialEquipment=data;
    }
    const specialGate=assessVehicleSpecialRouting({vehicle:savedVehicle,equipment:specialEquipment});
    if(!specialGate.ready)return response({error:"פרטי המרכב או הציוד המיוחד אינם מאומתים. לא ניתן לחשב מסלול לרכב זה.",diagnosticCode:specialGate.reason},409);
    const vehicleProfile=getSavedTruckRoutingProfile(savedVehicle);
    if(!vehicleProfile)return response({error:"פרופיל הרכב השמור אינו מלא או מאומת, או שמדובר ברכב הדגמה. יש להשלים נתונים לפי רישיון הרכב."},409);
    if(specialGate.dimensions){vehicleProfile.heightCm=specialGate.dimensions.heightCm;vehicleProfile.widthCm=specialGate.dimensions.widthCm;vehicleProfile.lengthCm=specialGate.dimensions.lengthCm;}
    const { heightCm, widthCm, lengthCm, grossWeightKg, axleCount, trailerCount, vehicleType } = vehicleProfile;
    const currentWeightKg = Number(raw.currentWeightKg);
    const weightPerAxleKg = Number(raw.weightPerAxleKg);
    const emptyWeightKg = Number(savedVehicle.empty_weight_kg);
    const tripWeights = validateTruckTripWeights({
      currentWeightKg,
      weightPerAxleKg,
      emptyWeightKg,
      grossWeightKg
    });
    if (!tripWeights) {
      return response({
        error: "יש להזין משקל כולל בפועל ומשקל מדוד על הסרן העמוס ביותר. נתון הסרן חייב להתבסס על שקילה בפועל, להיות לפחות 500 ק״ג ולא לעלות על המשקל הכולל בפועל."
      }, 400);
    }

    // Enforce the per-user quota before any paid HERE geocoding or routing call.
    // If the quota service is unavailable, fail closed rather than spending provider credits.
    const quota = await checkTruckRouteQuota(db);
    if (!quota.allowed) {
      if (quota.reason === "quota_exceeded") {
        return response({ error: "הגעת למכסת תכנון המסלולים. אפשר לנסות שוב בעוד 10 דקות." }, 429);
      }
      return response({ error: "מנגנון הגבלת בקשות הניווט אינו זמין. לא ניתן לחשב מסלול כרגע." }, 503);
    }

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
    const params = {
      transportMode: "truck",
      origin: `${origin.lat},${origin.lng}`,
      destination: `${destination.lat},${destination.lng}`,
      departureTime: new Date().toISOString(),
      return: "polyline,summary,actions",
      alternatives: "2",
      lang: "he-IL",
      "avoid[features]": "dirtRoad,uTurns",
      "vehicle[height]": String(Math.round(heightCm)),
      "vehicle[width]": String(Math.round(widthCm)),
      "vehicle[length]": String(Math.round(lengthCm)),
      "vehicle[grossWeight]": String(Math.round(grossWeightKg)),
      "vehicle[currentWeight]": String(Math.round(currentWeightKg)),
      "vehicle[type]": vehicleType,
      "vehicle[axleCount]": String(axleCount),
      "vehicle[trailerCount]": String(trailerCount),
      apiKey
    };
    params["vehicle[weightPerAxle]"] = String(Math.round(tripWeights.weightPerAxleKg));
    url.search = new URLSearchParams(params).toString();

    const routeResponse = await fetch(url, { signal: AbortSignal.timeout(15000), cache: "no-store" });
    const routeData = await routeResponse.json().catch(() => null);
    if (!routeResponse.ok) return response({ error: "ספק הניווט לא הצליח לחשב מסלול. בדוק את פרטי הרכב ונסה שוב." }, 502);

    const routeCandidates = routeData?.routes;
    if (!Array.isArray(routeCandidates) || routeCandidates.length === 0) {
      return response({ error: "לא נמצא מסלול למשאית לפי הנתונים שהוזנו. אין להחליף למסלול רכב פרטי." }, 422);
    }

    // Load the current fleet restriction catalogue through the caller's RLS-scoped client.
    // A failed query must never be interpreted as an empty catalogue.
    const restrictionCatalog = await loadFleetRoadRestrictions(db, membership.fleet_id);
    if (!restrictionCatalog.ok) {
      return response({
        error: "לא ניתן לטעון ולאמת את כל מאגר מגבלות הדרך של הצי. המסלול לא אושר.",
        diagnosticCode: restrictionCatalog.reason
      }, 503);
    }
    const restrictions = restrictionCatalog.data;

    const selection = selectSafeTruckRoute({
      routes: routeCandidates,
      restrictions,
      restrictionCatalogLoaded: true,
      vehicle: { heightCm, widthCm, lengthCm },
      currentWeightKg,
      now: new Date()
    });
    if (!selection.route || !selection.restrictionCheck?.validated) {
      return response({
        error: "לא נמצא מסלול חלופי שניתן לאמת מול מגבלות הדרך הרשומות בצי. יש לבדוק את הפרטים לפני נסיעה.",
        restrictionValidation: {
          validated: false,
          rejectedCandidateCount: selection.rejected.length
        },
        rejectedCandidates: summarizeRejectedRouteCandidates(selection.rejected)
      }, 409);
    }

    const route = selection.route;
    const restrictionValidation = selection.restrictionCheck;
    const notices = selection.notices.map(notice => ({
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
    const distance = route.sections.reduce((sum, section) => sum + (Number(section.summary?.length) || 0), 0);
    const duration = route.sections.reduce((sum, section) => sum + (Number(section.summary?.duration) || 0), 0);

    return response({
      origin: origin.label,
      destination: destination.label,
      distanceMeters: distance,
      durationSeconds: duration,
      hasCriticalNotices: critical,
      restrictionValidation: {
        validated: true,
        scope: "fleet_catalogue_only",
        checkedRecords: restrictions.length
      },
      notices,
      actions,
      sections: route.sections.map(section => ({ polyline: section.polyline || "" }))
    });
  } catch (error) {
    const message = error?.name === "TimeoutError"
      ? "שירות הניווט לא הגיב בזמן. בדוק חיבור ונסה שוב."
      : "אירעה תקלה זמנית בחישוב המסלול. נסה שוב בעוד רגע.";
    return response({ error: message }, 500);
  }
}
