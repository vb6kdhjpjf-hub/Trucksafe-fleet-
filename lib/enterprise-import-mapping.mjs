const DATASETS = {
  drivers: {
    fields: {
      full_name: { aliases: ["full_name", "name", "driver", "driver_name", "שם מלא", "שם נהג", "נהג"], required: true, type: "text" },
      phone: { aliases: ["phone", "mobile", "cellphone", "טלפון", "נייד"], type: "text" },
      license_number: { aliases: ["license_number", "license", "driver_license", "מספר רישיון", "מס רישיון נהיגה"], type: "text" },
      license_class: { aliases: ["license_class", "license_type", "דרגת רישיון", "סוג רישיון"], type: "text" },
      license_expires_at: { aliases: ["license_expires_at", "license_expiry", "license_expiration", "תוקף רישיון", "תאריך תפוגת רישיון"], type: "date" },
      status: { aliases: ["status", "driver_status", "סטטוס נהג"], type: "driver_status", default: "active" }
    }
  },
  vehicles: {
    fields: {
      registration_number: { aliases: ["registration_number", "registration", "plate", "license_plate", "מספר רכב", "מספר רישוי", "רישוי"], required: true, type: "text" },
      make: { aliases: ["make", "manufacturer", "יצרן"], type: "text" },
      model: { aliases: ["model", "דגם"], type: "text" },
      year: { aliases: ["year", "model_year", "שנת ייצור", "שנה"], type: "integer", min: 1950, max: 2100 },
      vehicle_type: { aliases: ["vehicle_type", "type", "סוג רכב"], type: "text" },
      capacity_kg: { aliases: ["capacity_kg", "capacity", "payload_kg", "קיבולת קג", "מטען מותר קג"], type: "number", min: 0 },
      status: { aliases: ["status", "vehicle_status", "סטטוס רכב"], type: "vehicle_status", default: "available" },
      odometer_km: { aliases: ["odometer_km", "odometer", "mileage", "קילומטראז", "מד אוץ"], type: "number", min: 0 },
      next_service_at: { aliases: ["next_service_at", "next_service", "טיפול הבא"], type: "date" },
      test_due_at: { aliases: ["test_due_at", "annual_test", "mot_due", "טסט"], type: "date" },
      insurance_due_at: { aliases: ["insurance_due_at", "insurance_expiry", "ביטוח בתוקף עד"], type: "date" },
      registration_due_at: { aliases: ["registration_due_at", "registration_expiry", "רישיון רכב בתוקף עד"], type: "date" },
      notes: { aliases: ["notes", "comments", "הערות"], type: "text" },
      height_cm: { aliases: ["height_cm", "height", "גובה סמ", "גובה"], type: "safety_number", min: 100, max: 600 },
      width_cm: { aliases: ["width_cm", "width", "רוחב סמ", "רוחב"], type: "safety_number", min: 100, max: 350 },
      length_cm: { aliases: ["length_cm", "length", "אורך סמ", "אורך"], type: "safety_number", min: 200, max: 3000 },
      gross_weight_kg: { aliases: ["gross_weight_kg", "gross_weight", "gvw", "משקל כולל קג", "משקל כולל"], type: "safety_number", min: 1000, max: 100000 },
      empty_weight_kg: { aliases: ["empty_weight_kg", "tare_weight", "empty_weight", "משקל עצמי קג", "משקל עצמי"], type: "safety_number", min: 500, max: 100000 },
      axle_count: { aliases: ["axle_count", "axles", "מספר סרנים", "סרנים"], type: "safety_integer", min: 2, max: 12 },
      trailer_count: { aliases: ["trailer_count", "trailers", "מספר נגררים", "נגררים"], type: "safety_integer", min: 0, max: 3 },
      weight_per_axle_kg: { aliases: ["weight_per_axle_kg", "axle_weight_kg", "משקל לסרן קג", "משקל לסרן"], type: "safety_number", min: 500, max: 30000 }
    }
  }
};

const normalizeHeader = value => String(value ?? "")
  .normalize("NFKC")
  .trim()
  .toLocaleLowerCase()
  .replace(/[\s_\-./()]+/g, "");

const cleanText = value => {
  const text = String(value ?? "").trim();
  return text || null;
};

function parseIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return value;
}

function parseNumber(value, integer = false) {
  const text = String(value ?? "").trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) return null;
  const number = Number(text);
  if (!Number.isFinite(number) || (integer && !Number.isInteger(number))) return null;
  return number;
}

function normalizeField(value, spec) {
  if (spec.type === "text") return { value: cleanText(value) };
  if (spec.type === "date") {
    const text = cleanText(value);
    if (!text) return { value: null };
    const parsed = parseIsoDate(text);
    return parsed ? { value: parsed } : { error: "date_requires_iso_yyyy_mm_dd" };
  }
  if (spec.type === "driver_status" || spec.type === "vehicle_status") {
    const text = cleanText(value);
    if (!text) return { value: spec.default };
    const allowed = spec.type === "driver_status"
      ? ["active", "off_duty", "suspended"]
      : ["available", "inactive", "maintenance"];
    return allowed.includes(text.toLowerCase())
      ? { value: text.toLowerCase() }
      : { error: "status_requires_manual_mapping" };
  }
  if (spec.type === "number" || spec.type === "integer" || spec.type === "safety_number" || spec.type === "safety_integer") {
    const text = cleanText(value);
    if (!text) return { value: null };
    const integer = spec.type === "integer" || spec.type === "safety_integer";
    const number = parseNumber(text, integer);
    if (number === null) return { error: "invalid_numeric_format" };
    if ((spec.min !== undefined && number < spec.min) || (spec.max !== undefined && number > spec.max)) {
      return { error: "numeric_value_out_of_range" };
    }
    return { value: number, safetyCritical: spec.type.startsWith("safety_") };
  }
  return { error: "unsupported_field_type" };
}

export function suggestImportColumnMappings(headers, entityType) {
  const dataset = DATASETS[entityType];
  if (!dataset || !Array.isArray(headers)) return { ok: false, error: "unsupported_import_type" };
  const aliases = new Map();
  for (const [field, spec] of Object.entries(dataset.fields)) {
    for (const alias of new Set([field, ...spec.aliases])) {
      const key = normalizeHeader(alias);
      const matches = aliases.get(key) || [];
      matches.push(field);
      aliases.set(key, matches);
    }
  }
  const candidates = Object.fromEntries(Object.keys(dataset.fields).map(field => [field, []]));
  const unmappedHeaders = [];
  headers.forEach((header, sourceIndex) => {
    const matches = aliases.get(normalizeHeader(header)) || [];
    if (matches.length !== 1) { if (!matches.length) unmappedHeaders.push(header); return; }
    candidates[matches[0]].push({ sourceHeader: header, sourceIndex });
  });
  const fields = {};
  const ambiguousFields = [];
  for (const [field, matches] of Object.entries(candidates)) {
    if (matches.length === 1) fields[field] = matches[0];
    else if (matches.length > 1) ambiguousFields.push({ field, candidates: matches });
  }
  const missingRequiredFields = Object.entries(dataset.fields)
    .filter(([field, spec]) => spec.required && !fields[field])
    .map(([field]) => field);
  return { ok: true, entityType, fields, ambiguousFields, missingRequiredFields, unmappedHeaders };
}

export function validateEnterpriseImportRows(parsed, entityType, mappings) {
  const dataset = DATASETS[entityType];
  if (!dataset) return { ok: false, error: "unsupported_import_type" };
  if (!parsed?.ok || !Array.isArray(parsed.headers) || !Array.isArray(parsed.rows)) {
    return { ok: false, error: "invalid_parsed_file" };
  }
  const fields = mappings?.fields || mappings;
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return { ok: false, error: "invalid_mapping" };
  const selected = Object.entries(fields).filter(([field, source]) => source != null && source !== "");
  if (selected.some(([field]) => !Object.hasOwn(dataset.fields, field))) return { ok: false, error: "unsupported_mapped_field" };

  const resolved = {};
  const usedIndexes = new Set();
  for (const [field, source] of selected) {
    const index = typeof source === "number" ? source : typeof source === "string" ? parsed.headers.indexOf(source) : Number.isInteger(source?.sourceIndex) ? source.sourceIndex : parsed.headers.indexOf(source?.sourceHeader);
    if (!Number.isInteger(index) || index < 0 || index >= parsed.headers.length) return { ok: false, error: "mapping_source_not_found" };
    if (usedIndexes.has(index)) return { ok: false, error: "mapping_source_reused" };
    usedIndexes.add(index);
    resolved[field] = index;
  }
  const missingRequiredFields = Object.entries(dataset.fields)
    .filter(([field, spec]) => spec.required && resolved[field] === undefined)
    .map(([field]) => field);
  if (missingRequiredFields.length) return { ok: false, error: "required_mapping_missing", missingRequiredFields };

  const rows = parsed.rows.map(row => {
    const data = {};
    const errors = [];
    const warnings = [];
    if (row.error) errors.push(row.error);
    for (const [field, spec] of Object.entries(dataset.fields)) {
      const index = resolved[field];
      const raw = index === undefined ? "" : row.values[index];
      const result = normalizeField(raw, spec);
      if (result.error) errors.push({ field, code: result.error });
      else if (result.value !== null && result.value !== undefined) data[field] = result.value;
      if (result.safetyCritical && result.value !== null) warnings.push({ field, code: "safety_document_review_required" });
      if (spec.required && !result.value) errors.push({ field, code: "required_value_missing" });
    }
    return { rowNumber: row.rowNumber, data, errors, warnings, disposition: errors.length ? "rejected" : warnings.length ? "review" : "ready" };
  });

  const identityField = entityType === "drivers" ? "license_number" : "registration_number";
  const occurrences = new Map();
  for (const row of rows) {
    const value = row.data[identityField];
    if (!value) continue;
    const key = String(value).normalize("NFKC").toLocaleLowerCase().replace(/[^a-z0-9\u0590-\u05ff]/g, "");
    if (!key) continue;
    const list = occurrences.get(key) || [];
    list.push(row);
    occurrences.set(key, list);
  }
  for (const duplicateRows of occurrences.values()) {
    if (duplicateRows.length < 2) continue;
    for (const row of duplicateRows) {
      row.warnings.push({ field: identityField, code: "duplicate_identity_in_file" });
      if (row.disposition === "ready") row.disposition = "review";
    }
  }

  return {
    ok: true,
    entityType,
    rows,
    summary: {
      total: rows.length,
      ready: rows.filter(row => row.disposition === "ready").length,
      review: rows.filter(row => row.disposition === "review").length,
      rejected: rows.filter(row => row.disposition === "rejected").length
    }
  };
}
