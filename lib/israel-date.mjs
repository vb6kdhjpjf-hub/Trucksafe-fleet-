function parseIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  if (date.toISOString().slice(0, 10) !== value) return null;
  return date;
}

export function getIsraelCalendarDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return values.year + "-" + values.month + "-" + values.day;
}

export function addIsraelCalendarDays(isoDate, days) {
  const parsed = parseIsoDate(isoDate);
  if (!parsed || !Number.isInteger(days)) throw new RangeError("A valid ISO date and integer day offset are required");
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export function differenceInCalendarDays(laterDate, earlierDate) {
  const later = parseIsoDate(laterDate);
  const earlier = parseIsoDate(earlierDate);
  if (!later || !earlier) throw new RangeError("Two valid ISO calendar dates are required");
  return Math.round((later.getTime() - earlier.getTime()) / 86400000);
}
