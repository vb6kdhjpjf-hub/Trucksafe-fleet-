import test from "node:test";
import assert from "node:assert/strict";
import { parseEnterpriseCsv } from "../../lib/enterprise-import-csv.mjs";
import { suggestImportColumnMappings, validateEnterpriseImportRows } from "../../lib/enterprise-import-mapping.mjs";

test("suggests Hebrew driver mappings and required name", () => {
  const result = suggestImportColumnMappings(["שם מלא", "טלפון", "תוקף רישיון"], "drivers");
  assert.equal(result.ok, true);
  assert.equal(result.fields.full_name.sourceIndex, 0);
  assert.equal(result.fields.phone.sourceIndex, 1);
  assert.equal(result.fields.license_expires_at.sourceIndex, 2);
  assert.deepEqual(result.missingRequiredFields, []);
});

test("reports missing required mappings and ambiguous source columns", () => {
  const result = suggestImportColumnMappings(["שם נהג", "שם מלא"], "drivers");
  assert.equal(result.missingRequiredFields.includes("full_name"), true);
  assert.equal(result.ambiguousFields.some(x => x.field === "full_name"), true);
});

test("normalizes valid driver rows and rejects non-ISO dates", () => {
  const parsed = parseEnterpriseCsv("שם מלא,טלפון,תוקף רישיון\nדנה כהן,0501234567,2027-05-31\nאורי,0502222222,31/05/2027");
  const mapping = suggestImportColumnMappings(parsed.headers, "drivers");
  const result = validateEnterpriseImportRows(parsed, "drivers", mapping);
  assert.equal(result.ok, true);
  assert.equal(result.summary.ready, 1);
  assert.equal(result.summary.rejected, 1);
  assert.equal(result.rows[0].data.full_name, "דנה כהן");
  assert.equal(result.rows[0].data.phone, "0501234567");
  assert.equal(result.rows[1].errors[0].code, "date_requires_iso_yyyy_mm_dd");
});

test("maps vehicle fields but flags imported safety specifications for document review", () => {
  const parsed = parseEnterpriseCsv("מספר רישוי,יצרן,דגם,גובה סמ,משקל כולל קג\n1234567,Volvo,FH,390,40000");
  const mapping = suggestImportColumnMappings(parsed.headers, "vehicles");
  const result = validateEnterpriseImportRows(parsed, "vehicles", mapping);
  assert.equal(result.ok, true);
  assert.equal(result.summary.review, 1);
  assert.equal(result.rows[0].data.registration_number, "1234567");
  assert.equal(result.rows[0].data.height_cm, 390);
  assert.ok(result.rows[0].warnings.some(x => x.code === "safety_document_review_required"));
});

test("detects duplicate fleet identity values within the uploaded file", () => {
  const parsed = parseEnterpriseCsv("registration_number,make\n123-45-678,Volvo\n12345678,MAN");
  const mapping = suggestImportColumnMappings(parsed.headers, "vehicles");
  const result = validateEnterpriseImportRows(parsed, "vehicles", mapping);
  assert.equal(result.ok, true);
  assert.equal(result.summary.review, 2);
  assert.ok(result.rows.every(row => row.warnings.some(x => x.code === "duplicate_identity_in_file")));
});

test("never maps user IDs, fleet IDs, verification flags or document paths", () => {
  const result = suggestImportColumnMappings(["user_id", "fleet_id", "registration_verified_by", "registration_document_path", "id"], "vehicles");
  assert.deepEqual(result.fields, {});
  assert.deepEqual(result.missingRequiredFields, ["registration_number"]);
});

test("rejects reused source columns and unsupported targets", () => {
  const parsed = parseEnterpriseCsv("name,phone\nDana,0501");
  assert.equal(validateEnterpriseImportRows(parsed, "drivers", { full_name: 0, phone: 0 }).error, "mapping_source_reused");
  assert.equal(validateEnterpriseImportRows(parsed, "drivers", { full_name: 0, user_id: 1 }).error, "unsupported_mapped_field");
});

test("rejects numeric values with ambiguous locale formatting and invalid ranges", () => {
  const parsed = parseEnterpriseCsv("registration_number,year,capacity_kg\n123,2027,1,500");
  const mapping = suggestImportColumnMappings(parsed.headers, "vehicles");
  const result = validateEnterpriseImportRows(parsed, "vehicles", mapping);
  assert.equal(result.ok, true);
  assert.equal(result.summary.rejected, 1);
  assert.ok(result.rows[0].errors.some(x => x.code === "column_count_mismatch"));
});

test("canonical field names are indexed once and map to source indexes", () => {
  const result = suggestImportColumnMappings(["registration_number", "make"], "vehicles");
  assert.equal(result.fields.registration_number.sourceIndex, 0);
  assert.deepEqual(result.ambiguousFields, []);
  const parsed = parseEnterpriseCsv("registration_number,make\n1234567,Volvo");
  const validated = validateEnterpriseImportRows(parsed, "vehicles", result);
  assert.equal(validated.ok, true);
  assert.equal(validated.rows[0].data.registration_number, "1234567");
});
