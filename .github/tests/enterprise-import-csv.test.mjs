import test from "node:test";
import assert from "node:assert/strict";
import { parseEnterpriseCsv } from "../../lib/enterprise-import-csv.mjs";
test("parses quoted commas, escaped quotes and CRLF", () => {
  const r = parseEnterpriseCsv('name,notes\r\n"ACME, Israel","said ""hello"""\r\n');
  assert.equal(r.ok, true); assert.deepEqual(r.rows[0].values, ["ACME, Israel", 'said "hello"']);
});
test("detects semicolon and tab delimiters", () => {
  assert.equal(parseEnterpriseCsv("שם;טלפון\nדנה;0501").delimiter, ";");
  assert.equal(parseEnterpriseCsv("name\tphone\nDana\t0501").delimiter, "\t");
});
test("strips BOM and trims headers", () => assert.deepEqual(parseEnterpriseCsv("\uFEFF Name , Phone \nDana,0501").headers, ["Name", "Phone"]));
test("rejects duplicate normalized or blank headers", () => {
  assert.equal(parseEnterpriseCsv("Email,email\na,b").error, "duplicate_headers");
  assert.equal(parseEnterpriseCsv("name,,phone\na,b,c").error, "empty_header");
});
test("reports row shape errors and source line numbers", () => {
  const r = parseEnterpriseCsv("name,phone\nDana,0501\nNoam\nAvi,0502");
  assert.equal(r.summary.acceptedShape, 2); assert.equal(r.summary.rejectedShape, 1);
  assert.equal(r.rows[1].rowNumber, 3); assert.equal(r.rows[1].error, "column_count_mismatch");
});
test("preserves embedded newlines in quoted cells", () => {
  const r = parseEnterpriseCsv('name,notes\nDana,"first line\nsecond line"\n');
  assert.equal(r.rows[0].values[1], "first line\nsecond line");
});
test("rejects malformed quoting", () => {
  assert.equal(parseEnterpriseCsv('name,notes\nDana,"oops').error, "unterminated_quote");
  assert.equal(parseEnterpriseCsv('name,notes\nDana,"ok"x').error, "unexpected_character_after_quote");
});
test("enforces byte, row, column and field limits", () => {
  assert.equal(parseEnterpriseCsv("a\nx", { maxBytes: 1 }).error, "file_too_large");
  assert.equal(parseEnterpriseCsv("a\n1\n2", { maxRows: 1 }).error, "too_many_rows");
  assert.equal(parseEnterpriseCsv("a,b\n1,2", { maxColumns: 1 }).error, "too_many_columns");
  assert.equal(parseEnterpriseCsv("a\n1234", { maxFieldLength: 3 }).error, "field_too_long");
});
test("keeps formula-looking cells as inert text", () => {
  const r = parseEnterpriseCsv('name,note\nDana,=HYPERLINK("https://example.invalid")');
  assert.equal(r.rows[0].values[1], '=HYPERLINK("https://example.invalid")');
});
test("ignores blank lines and rejects empty or unsupported input", () => {
  assert.equal(parseEnterpriseCsv("  ").error, "empty_file");
  assert.equal(parseEnterpriseCsv("a|b\n1|2", { delimiter: "|" }).error, "unsupported_delimiter");
  assert.equal(parseEnterpriseCsv("a,b\n\n1,2").rows.length, 1);
});
