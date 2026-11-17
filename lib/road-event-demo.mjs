const MINUTE = 60_000;

export function getDemoRoadEvents(now = Date.now()) {
  const timestamp = new Date(now).toISOString();
  return [
    {
      event_id: "demo-road-event-001",
      event_type: "road_hazard",
      state: "verified",
      verification_state: "authoritative",
      severity: "high",
      confidence: 0.98,
      latitude: 32.8234,
      longitude: 35.5031,
      observed_at: timestamp,
      expires_at: new Date(now + 45 * MINUTE).toISOString(),
      driver_message: "דוגמה בלבד: מפגע בכביש. יש להאט ולנהוג בזהירות.",
      source_label: "מקור רשמי (הדגמה)"
    },
    {
      event_id: "demo-road-event-002",
      event_type: "lane_closure",
      state: "corroborating",
      verification_state: "corroborated",
      severity: "medium",
      confidence: 0.72,
      latitude: 32.7902,
      longitude: 35.5304,
      observed_at: timestamp,
      expires_at: new Date(now + 20 * MINUTE).toISOString(),
      driver_message: "דוגמה בלבד: נתיב חסום זמנית. יש לציית לתמרורים.",
      source_label: "דיווח נהגים (לא מאומת)"
    },
    {
      event_id: "demo-road-event-003",
      event_type: "weather_hazard",
      state: "expired",
      verification_state: "unverified",
      severity: "low",
      confidence: 0.3,
      latitude: 32.75,
      longitude: 35.48,
      observed_at: timestamp,
      expires_at: new Date(now - MINUTE).toISOString(),
      driver_message: "אירוע שפג תוקפו ואסור להצגה.",
      source_label: "דוגמה שפג תוקפה"
    }
  ];
}

export function getVisibleDemoRoadEvents(events, now = Date.now()) {
  return (Array.isArray(events) ? events : []).filter(event => {
    if (!event || !["verified", "corroborating"].includes(event.state)) return false;
    const expiry = Date.parse(event.expires_at);
    const latitude = Number(event.latitude);
    const longitude = Number(event.longitude);
    return Number.isFinite(expiry) && expiry > now
      && Number.isFinite(latitude) && latitude >= 29 && latitude <= 34
      && Number.isFinite(longitude) && longitude >= 34 && longitude <= 36
      && typeof event.driver_message === "string" && event.driver_message.length > 0;
  });
}
