import test from "node:test";
import assert from "node:assert/strict";
import { csvCell, csvDocument } from "../../lib/csv.mjs";

test("CSV cells neutralize formula-like text", () => {
  assert.equal(csvCell("=HYPERLINK(\"https://example.invalid\")"), "\"'=HYPERLINK(\"\"https://example.invalid\"\")\"");
  assert.equal(csvCell("  @SUM(1,2)"), "\"'  @SUM(1,2)\"");
  assert.equal(csvCell("+cmd|calc"), '"' + "'" + '+cmd|calc' + '"');
});

test("CSV cells preserve normal text, quotes and numeric values", () => {
  assert.equal(csvCell('Truck "A"'), '"Truck ""A"""');
  assert.equal(csvCell(-12), '"-12"');
  assert.equal(csvCell("normal text"), '"normal text"');
});

test("CSV document uses UTF-8 BOM and CRLF row separators", () => {
  const csv = csvDocument([["name", "value"], ["=1+1", "ok"]]);
  assert.ok(csv.startsWith(String.fromCharCode(0xFEFF)));
  assert.equal(csv.split(String.fromCharCode(13, 10)).length, 2);
  assert.ok(csv.includes("\"'=1+1\""));
});
