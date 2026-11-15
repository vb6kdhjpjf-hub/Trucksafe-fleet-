import test from "node:test";
import assert from "node:assert/strict";
import { parseEnterpriseCsv } from "../../lib/enterprise-import-csv.mjs";
import { suggestImportColumnMappings, validateEnterpriseImportRows } from "../../lib/enterprise-import-mapping.mjs";
import { flagExistingEnterpriseIdentityConflicts, normalizeEnterpriseIdentity } from "../../lib/enterprise-import-conflicts.mjs";

function validate(csv, entityType) {
  const parsed = parseEnterpriseCsv(csv);
  const mapping = suggestImportColumnMappings(parsed.headers, entityType);
  return validateEnterpriseImportRows(parsed, entityType, mapping);
}

test("normalizes identifiers consistently across punctuation, whitespace and Unicode", () => {
  assert.equal(normalizeEnterpriseIdentity(" 123-45-678 "), "12345678");
  assert.equal(normalizeEnterpriseIdentity("אב-123"), "אב123");
});

test("flags vehicle registration already present in the same fleet", () => {
  const result = validate("registration_number,make\n123-45-678,Volvo\n7654321,MAN", "vehicles");
  const checked = flagExistingEnterpriseIdentityConflicts(result, "vehicles", ["12345678"]);
  assert.equal(checked.summary.ready, 1);
  assert.equal(checked.summary.review, 1);
  assert.ok(checked.rows[0].warnings.some(warning => warning.code === "duplicate_identity_in_fleet"));
  assert.equal(checked.rows[1].warnings.some(warning => warning.code === "duplicate_identity_in_fleet"), false);
});

test("flags driver license collision but does not use names or phone numbers as identity", () => {
  const result = validate("full_name,phone,license_number\nDana,0501234567,AB-123\nDana,0501234567,CD-456", "drivers");
  const checked = flagExistingEnterpriseIdentityConflicts(result, "drivers", ["AB123"]);
  assert.equal(checked.summary.review, 1);
  assert.equal(checked.summary.ready, 1);
  assert.ok(checked.rows[0].warnings.some(warning => warning.code === "duplicate_identity_in_fleet"));
});

test("keeps original validation immutable and leaves rows unchanged when no collision exists", () => {
  const result = validate("registration_number\n1234567", "vehicles");
  const checked = flagExistingEnterpriseIdentityConflicts(result, "vehicles", ["7654321"]);
  assert.notEqual(checked, result);
  assert.deepEqual(checked, result);
  assert.equal(result.summary.ready, 1);
  assert.equal(result.rows[0].warnings.length, 0);
});

test("does not turn a row with existing validation errors into a review-ready row", () => {
  const result = validate("registration_number,year\n1234567,1800", "vehicles");
  const checked = flagExistingEnterpriseIdentityConflicts(result, "vehicles", ["1234567"]);
  assert.equal(checked.rows[0].disposition, "rejected");
  assert.ok(checked.rows[0].warnings.some(warning => warning.code === "duplicate_identity_in_fleet"));
  assert.equal(checked.summary.rejected, 1);
});
