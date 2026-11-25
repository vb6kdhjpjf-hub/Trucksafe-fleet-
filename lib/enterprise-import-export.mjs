const FORMULA_PREFIX = /^[\s\u0000-\u001f]*[=+\-@]/u;
const LEADING_CONTROL = /^[\t\r\n]/u;

export function escapeEnterpriseCsvCell(value) {
  let text = String(value ?? "");
  if (FORMULA_PREFIX.test(text) || LEADING_CONTROL.test(text)) text = "'" + text;
  if (/[",\r\n]/u.test(text)) return '"' + text.replace(/"/gu, '""') + '"';
  return text;
}

export function serializeEnterpriseCsv(rows, { includeBom = true } = {}) {
  if (!Array.isArray(rows)) throw new TypeError("CSV rows must be an array");
  const lines = rows.map((row) => {
    if (!Array.isArray(row)) throw new TypeError("Each CSV row must be an array");
    return row.map(escapeEnterpriseCsvCell).join(",");
  });
  return (includeBom ? "\uFEFF" : "") + lines.join("\r\n");
}
