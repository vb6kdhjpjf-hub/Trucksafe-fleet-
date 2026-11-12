import test from "node:test";
import assert from "node:assert/strict";
import { escapeEnterpriseCsvCell, serializeEnterpriseCsv } from "../../lib/enterprise-import-export.mjs";

test("quotes commas, quotes and line breaks using RFC-style CSV escaping", () => {
  assert.equal(escapeEnterpriseCsvCell('ACME, "North"'), '"ACME, ""North"""');
  assert.equal(escapeEnterpriseCsvCell("line 1\\nline 2"), '"line 1\\nline 2"');
});

test("neutralizes spreadsheet formula prefixes including leading whitespace", () => {
  for (const value of ["=1+1", "+SUM(A1:A2)", "-1+2", "@SUM(A1)", "  =HYPERLINK(\"https://example.invalid\")"]) {
    assert.equal(escapeEnterpriseCsvCell(value).startsWith("'"), true, value);
  }
});

test("neutralizes leading tab, carriage return and newline controls", () => {
  for (const value of ["\\t=1+1", "\\r=1+1", "\\n=1+1"]) {
    assert.equal(escapeEnterpriseCsvCell(value).startsWith("'"), true);
  }
});

test("serializes report rows with UTF-8 BOM and CRLF by default", () => {
  assert.equal(serializeEnterpriseCsv([["name", "value"], ["Dana", "safe"]]), "\\uFEFFname,value\\r\\nDana,safe");
});

test("supports BOM-free output and normalizes nullish values to empty cells", () => {
  assert.equal(serializeEnterpriseCsv([["name", "note"], ["Dana", null]], { includeBom: false }), "name,note\\r\\nDana,");
});

test("rejects invalid row containers", () => {
  assert.throws(() => serializeEnterpriseCsv("not rows"), TypeError);
  assert.throws(() => serializeEnterpriseCsv([["ok"], "bad row"]), TypeError);
});
