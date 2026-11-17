export function isValidIsraelGpsPoint(point, now = Date.now()) {
  if (!point || typeof point !== "object" || !Number.isFinite(now)) return false;
  const latitude = Number(point.latitude);
  const longitude = Number(point.longitude);
  const recordedAt = Date.parse(point.recorded_at);
  return Number.isFinite(latitude) && latitude >= 29 && latitude <= 34
    && Number.isFinite(longitude) && longitude >= 34 && longitude <= 36
    && Number.isFinite(recordedAt) && recordedAt <= now + 30_000;
}

export function pruneInactiveTripHistory(historyByTrip, activeTripIds) {
  if (!(historyByTrip instanceof Map) || !(activeTripIds instanceof Set)) return 0;
  let removed = 0;
  for (const tripId of historyByTrip.keys()) {
    if (!activeTripIds.has(tripId)) {
      historyByTrip.delete(tripId);
      removed += 1;
    }
  }
  return removed;
}
