const DEFAULT_LIMITS = Object.freeze({ maxBytes: 20 * 1024 * 1024, maxRows: 100_000, maxColumns: 100, maxFieldLength: 10_000 });
function detectDelimiter(text) {
  const counts = new Map([[",", 0], [";", 0], ["\t", 0]]);
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') { if (quoted && text[i + 1] === '"') { i += 1; continue; } quoted = !quoted; }
    else if (!quoted && counts.has(char)) counts.set(char, counts.get(char) + 1);
    else if (!quoted && (char === "\r" || char === "\n")) break;
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0][0];
}
function parseRecords(text, delimiter, limits) {
  const records = []; let record = []; let field = ""; let quoted = false; let afterQuote = false;
  let physicalLine = 1; let recordLine = 1;
  const pushField = () => { if (field.length > limits.maxFieldLength) throw new Error("field_too_long"); record.push(field); if (record.length > limits.maxColumns) throw new Error("too_many_columns"); field = ""; afterQuote = false; };
  const pushRecord = () => { pushField(); records.push({ lineNumber: recordLine, values: record }); if (records.length > limits.maxRows + 1) throw new Error("too_many_rows"); record = []; recordLine = physicalLine; };
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') { if (text[i + 1] === '"') { field += '"'; i += 1; } else { quoted = false; afterQuote = true; } }
      else { field += char; if (char === "\n" || (char === "\r" && text[i + 1] !== "\n")) physicalLine += 1; }
      if (field.length > limits.maxFieldLength) throw new Error("field_too_long");
      continue;
    }
    if (afterQuote && char !== delimiter && char !== "\r" && char !== "\n") throw new Error("unexpected_character_after_quote");
    if (char === '"' && field.length === 0 && !afterQuote) quoted = true;
    else if (char === delimiter) pushField();
    else if (char === "\r" || char === "\n") { if (char === "\r" && text[i + 1] === "\n") i += 1; physicalLine += 1; pushRecord(); }
    else { field += char; if (field.length > limits.maxFieldLength) throw new Error("field_too_long"); }
  }
  if (quoted) throw new Error("unterminated_quote");
  if (field.length || record.length || afterQuote) pushRecord();
  return records;
}
export function parseEnterpriseCsv(input, options = {}) {
  if (typeof input !== "string") return { ok: false, error: "invalid_input" };
  const limits = { maxBytes: 20 * 1024 * 1024, maxRows: 100_000, maxColumns: 100, maxFieldLength: 10_000, ...options };
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  if (new TextEncoder().encode(text).byteLength > limits.maxBytes) return { ok: false, error: "file_too_large" };
  if (!text.trim()) return { ok: false, error: "empty_file" };
  const delimiter = options.delimiter || detectDelimiter(text);
  if (![",", ";", "\t"].includes(delimiter)) return { ok: false, error: "unsupported_delimiter" };
  try {
    const records = parseRecords(text, delimiter, limits);
    if (!records.length) return { ok: false, error: "empty_file" };
    const [headerRecord, ...dataRecords] = records;
    const headers = headerRecord.values.map(value => value.trim());
    if (!headers.length || headers.some(value => !value)) return { ok: false, error: "empty_header" };
    const normalized = headers.map(value => value.normalize("NFKC").trim().toLocaleLowerCase());
    if (new Set(normalized).size !== normalized.length) return { ok: false, error: "duplicate_headers" };
    const rows = [];
    for (const source of dataRecords) {
      if (source.values.every(value => value.trim() === "")) continue;
      rows.push({ rowNumber: source.lineNumber, values: source.values, error: source.values.length === headers.length ? null : "column_count_mismatch" });
    }
    return { ok: true, delimiter, headers, rows, summary: { sourceRows: dataRecords.length, acceptedShape: rows.filter(row => !row.error).length, rejectedShape: rows.filter(row => row.error).length } };
  } catch (error) { return { ok: false, error: error?.message || "csv_parse_failed" }; }
}
