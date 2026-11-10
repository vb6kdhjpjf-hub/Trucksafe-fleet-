export function buildPreTripChecklist(items, answers, defectDetails = "") {
  if (!Array.isArray(items) || items.length !== 7 || !answers || typeof answers !== "object") {
    return { valid: false, message: "מבנה בדיקת הבטיחות אינו תקין." };
  }

  const complete = items.every((_, index) => typeof answers[index] === "boolean");
  if (!complete) {
    return { valid: false, message: "יש לבחור תקין או לא תקין בכל שבעת סעיפי הבדיקה." };
  }

  const hasDefects = items.some((_, index) => answers[index] === false);
  const note = String(defectDetails ?? "").trim();
  if (hasDefects && (note.length < 5 || note.length > 1000)) {
    return { valid: false, message: "כאשר נמצא ליקוי, יש לפרט אותו ב-5 עד 1000 תווים." };
  }

  const checklist = Object.fromEntries(items.map((item, index) => [item, answers[index]]));
  if (hasDefects) checklist._defect_details = note;

  return { valid: true, hasDefects, checklist };
}
