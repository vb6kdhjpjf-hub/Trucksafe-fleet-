import test from "node:test";
import assert from "node:assert/strict";
import { parseEnterpriseCsv } from "../../lib/enterprise-import-csv.mjs";

test("parses quoted commas, escaped quotes and CRLF records", () => {
  const result = parseEnterpriseCsv('name,notes\\r\\n"ACME, Israel","said ""hello"""\\r\\n');
  assert.equal(result.ok, true);
  assert.deepEqual(result.rows[0].values, ["ACME, Israel", 'said "hello"']);
});

test("detects semicolon and tab delimiters", () => {
  assert.equal(parseEnterpriseCsv("שם;טלפון\\nדנה;0501").delimiter, ";");
  assert.equal(parseEnterpriseCsv("name\\tphone\\nDana\\t0501").delimiter, "\\t");
});

test("strips UTF-8 BOM and trims header names", () => {
  const result = parseEnterpriseCsv("\\uFEFF Name , Phone \\nDana,0501");
  assert.deepEqual(result.headers, ["Name", "Phone"]);
});

test("rejects duplicate headers after normalization", () => {
  const result = parseEnterpriseCsv("Email,email\\na,b");
  assert.deepEqual(result, { ok: false, error: "duplicate_headers" });
});

test("rejects blank and duplicate header cells", () => {
  assert.equal(parseEnterpriseCsv("name,,phone\\na,b,c").error, "empty_header");
});

test("returns row-level shape errors without discarding valid rows", () => {
  const result = parseEnterpriseCsv("name,phone\\nDana,0501\\nNoam\\nAvi,0502");
  assert.equal(result.summary.acceptedShape, 2);
  assert.equal(result.summary.rejectedShape, 1);
  assert.equal(result.rows[1].rowNumber, 3);
  assert.equal(result.rows[1].error, "column_count_mismatch");
});

test("preserves embedded newlines in quoted values", () => {
  const result = parseEnterpriseCsv('name,notes\\nDana,"first line\\nsecond line"\\n');
  assert.equal(result.rows[0].values[1], "first line\\nsecond line");
});

test("rejects unterminated quotes and invalid characters after a quote", () => {
  assert.equal(parseEnterpriseCsv('name,notes\\nDana,"oops').error, "unterminated_quote");
  assert.equal(parseEnterpriseCsv('name,notes\\nDana,"ok"x').error, "unexpected_character_after_quote");
});

test("enforces byte, row, column and field limits", () => {
  assert.equal(parseEnterpriseCsv("a\\nx", { maxBytes: 1 }).error, "file_too_large");
  assert.equal(parseEnterpriseCsv("a\\n1\\n2", { maxRows: 1 }).error, "too_many_rows");
  assert.equal(parseEnterpriseCsv("a,b\\n1,2", { maxColumns: 1 }).error, "too_many_columns");
  assert.equal(parseEnterpriseCsv("a\\n1234", { maxFieldLength: 3 }).error, "field_too_long");
});

test("treats formula-looking cells as inert text", () => {
  const result = parseEnterpriseCsv("name,note\\nDana,=HYPERLINK(\"https://example.invalid\")");
  assert.equal(result.rows[0].values[1], '=HYPERLINK("https://example.invalid")');
});

test("ignores blank lines and rejects empty files or unsupported delimiters", () => {
  assert.equal(parseEnterpriseCsv("  ").error, "empty_file");
  assert.equal(parseEnterpriseCsv("a|b\\n1|2", { delimiter: "|" }).error, "unsupported_delimiter");
  assert.equal(parseEnterpriseCsv("a,b\\n\\n1,2").rows.length, 1);
});
