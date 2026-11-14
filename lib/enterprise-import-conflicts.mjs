const IDENTITY_FIELDS = Object.freeze({
  drivers: "license_number",
  vehicles: "registration_number"
});

export function normalizeEnterpriseIdentity(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9\u0590-\u05ff]/gu, "");
}

export function flagExistingEnterpriseIdentityConflicts(validation, entityType, existingValues) {
  const identityField = IDENTITY_FIELDS[entityType];
  if (!validation?.ok || !identityField || !Array.isArray(existingValues)) return validation;

  const existing = new Set(existingValues.map(normalizeEnterpriseIdentity).filter(Boolean));
  if (!existing.size) return validation;

  const rows = validation.rows.map(row => {
    const key = normalizeEnterpriseIdentity(row.data?.[identityField]);
    if (!key || !existing.has(key)) return row;
    const warnings = row.warnings.some(warning => warning.code === "duplicate_identity_in_fleet")
      ? row.warnings
      : [...row.warnings, { field: identityField, code: "duplicate_identity_in_fleet" }];
    return { ...row, warnings, disposition: row.errors.length ? "rejected" : "review" };
  });

  return {
    ...validation,
    rows,
    summary: {
      total: rows.length,
      ready: rows.filter(row => row.disposition === "ready").length,
      review: rows.filter(row => row.disposition === "review").length,
      rejected: rows.filter(row => row.disposition === "rejected").length
    }
  };
}
