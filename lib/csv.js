// CSV formula-injection protection for values exported to spreadsheet applications.
export function csvCell(value) {
  let text = String(value ?? "");
  const formulaLike = typeof value === "string" && /^[\\x00-\\x20]*[=+\\-@]/.test(text);
  if (formulaLike) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

export function csvDocument(rows) {
  return "\\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\\r\\n");
}
