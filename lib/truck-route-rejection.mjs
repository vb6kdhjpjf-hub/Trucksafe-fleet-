const REASON_LABELS = Object.freeze({
  unresolved_fleet_restrictions: "פרטי מגבלות הדרך במסלול אינם מלאים או שאינם מאומתים",
  fleet_restriction_conflict: "המסלול מתנגש עם מגבלת דרך של הצי",
  provider_restriction_notice: "ספק הניווט סימן במסלול מגבלה קריטית",
  missing_route_sections: "ספק הניווט לא החזיר גאומטריית מסלול מלאה",
  invalid_route_geometry: "נתוני תוואי המסלול אינם תקינים",
  invalid_route_summary: "נתוני אורך או משך המסלול אינם תקינים"
});

const UNRESOLVED_LABELS = Object.freeze({
  height_clearance_evidence_incomplete: "גובה המעבר אינו מאומת לפי מדידה מלאה לכל נתיב",
  restriction_type_requires_manual_review: "סוג המגבלה דורש בדיקה ידנית",
  missing_or_invalid_restriction_limit: "חסר ערך מגבלה תקין",
  incomplete_time_window: "חלון שעות ההגבלה אינו מלא",
  missing_or_invalid_location_or_route_geometry: "מיקום המגבלה או תוואי המסלול אינם מדויקים מספיק",
  schedule_or_route_duration_cannot_be_evaluated_safely: "לא ניתן לאמת את שעות ההגבלה לאורך הנסיעה"
});

const boundedText = (value, max = 120) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;

export function summarizeRejectedRouteCandidates(rejected) {
  if (!Array.isArray(rejected)) return [];
  return rejected.slice(0, 5).map(candidate => ({
    reason: boundedText(candidate?.reason, 100) || "route_candidate_rejected",
    conflicts: (Array.isArray(candidate?.restrictionCheck?.conflicts)
      ? candidate.restrictionCheck.conflicts : []).slice(0, 5).map(item => ({
        roadName: boundedText(item?.roadName),
        restrictionType: boundedText(item?.restrictionType, 40)
      })),
    unresolved: (Array.isArray(candidate?.restrictionCheck?.unresolved)
      ? candidate.restrictionCheck.unresolved : []).slice(0, 5).map(item => ({
        roadName: boundedText(item?.roadName),
        reason: boundedText(item?.reason, 100) || "manual_review_required"
      }))
  }));
}

export function formatRejectedRouteMessages(candidates) {
  if (!Array.isArray(candidates)) return [];
  return candidates.slice(0, 5).flatMap(candidate => [
    REASON_LABELS[candidate?.reason] || "חלופת מסלול נדחתה בבדיקת בטיחות",
    ...(Array.isArray(candidate?.conflicts) ? candidate.conflicts : []).map(item =>
      (boundedText(item?.roadName) ? boundedText(item.roadName) + " — " : "") +
      "התנגשות עם מגבלת דרך"),
    ...(Array.isArray(candidate?.unresolved) ? candidate.unresolved : []).map(item =>
      (boundedText(item?.roadName) ? boundedText(item.roadName) + " — " : "") +
      (UNRESOLVED_LABELS[item?.reason] || "נדרש אימות של נתוני המגבלה"))
  ]).slice(0, 12);
}
