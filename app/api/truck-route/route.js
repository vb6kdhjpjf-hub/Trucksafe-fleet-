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

export async function GET() {\n  return response({ configured: Boolean(process.env.HERE_API_KEY) });\n}\n\nexport async function POST(request) {
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
    const { data: authData, error: authError } = await db.auth.getUser(token);
    if (authError || !authData?.user) return response({ error: "החיבור אינו תקף. יש להתחבר מחדש." }, 401);

    const { data: membership, error: membershipError } = await db
      .from("fleet_members")
      .select("fleet_id")
      .eq("user_id", authData.user.id)
      .limit(1)
      .maybeSingle();
    if (membershipError || !membership) return response({ error: "אין לחשבון הרשאה לתכנון מסלולים בצי." }, 403);

    const apiKey = process.env.HERE_API_KEY;
    if (!apiKey) return response({ error: "שירות ניווט המשאיות עדיין לא חובר. נדרש להגדיר HERE_API_KEY ב-Vercel." }, 503);

    const raw = await request.json();
    const originText = typeof raw.origin === "string" ? raw.origin.trim() : "";
    const destinationText = typeof raw.destination === "string" ? raw.destination.trim() : "";
    if (!originText || !destinationText || originText.length > 180 || destinationText.length > 180) {
      return response({ error: "יש להזין מוצא ויעד בישראל, עד 180 תווים לכל כתובת." }, 400);
    }

    const heightCm = Number(raw.heightCm);
    const widthCm = Number(raw.widthCm);
    const lengthCm = Number(raw.lengthCm);
    const grossWeightKg = Number(raw.grossWeightKg);
    const currentWeightKg = Number(raw.currentWeightKg);
    const weightPerAxleKg = raw.weightPerAxleKg === "" || raw.weightPerAxleKg == null ? null : Number(raw.weightPerAxleKg);

    if (!numberInRange(heightCm, 100, 600) ||
        !numberInRange(widthCm, 100, 350) ||
        !numberInRange(lengthCm, 200, 3000) ||
        !numberInRange(grossWeightKg, 1000, 100000) ||
        !numberInRange(currentWeightKg, 1000, 100000) ||
        currentWeightKg > grossWeightKg ||
        (weightPerAxleKg !== null && !numberInRange(weightPerAxleKg, 500, 30000))) {
      return response({ error: "יש לבדוק את מידות המשאית והמשקלים. המשקל בפועל חייב להיות קטן או שווה למשקל הכולל המותר." }, 400);
    }

    const [origin, destination] = await Promise.all([
      geocode(originText, apiKey),
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
      lang: "he-IL",
      "avoid[features]": "dirtRoad,uTurns",
      "vehicle[height]": String(Math.round(heightCm)),
      "vehicle[width]": String(Math.round(widthCm)),
      "vehicle[length]": String(Math.round(lengthCm)),
      "vehicle[grossWeight]": String(Math.round(grossWeightKg)),
      "vehicle[currentWeight]": String(Math.round(currentWeightKg)),
      apiKey
    };
    if (weightPerAxleKg !== null) params["vehicle[weightPerAxle]"] = String(Math.round(weightPerAxleKg));
    url.search = new URLSearchParams(params).toString();

    const routeResponse = await fetch(url, { signal: AbortSignal.timeout(15000), cache: "no-store" });
    const routeData = await routeResponse.json().catch(() => null);
    if (!routeResponse.ok) return response({ error: "ספק הניווט לא הצליח לחשב מסלול. בדוק את פרטי הרכב ונסה שוב." }, 502);

    const route = routeData?.routes?.[0];
    if (!route?.sections?.length) return response({ error: "לא נמצא מסלול למשאית לפי הנתונים שהוזנו. אין להחליף למסלול רכב פרטי." }, 422);

    const notices = route.sections.flatMap(section => (section.notices || []).map(notice => ({
      code: String(notice.code || "notice").slice(0, 100),
      severity: String(notice.severity || "info").slice(0, 30),
      title: String(notice.title || notice.code || "הודעת ניווט").slice(0, 240)
    })));
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
