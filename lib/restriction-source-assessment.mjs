const DIMENSIONS = Object.freeze([
  "authority",
  "geographic_coverage",
  "truck_constraints",
  "measurement_quality",
  "temporal_validity",
  "update_mechanism",
  "licensing",
  "reliability",
  "independent_validation"
]);

const STATUSES = new Set(["missing", "partial", "evidenced"]);
const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * Creates a conservative evidence-completeness report for a candidate source.
 * Evidence references are pointers for human review, not proof that claims are true.
 * This function never verifies source facts or approves routing.
 */
export function assessRestrictionSource(input) {
  const errors = [];
  if (!isRecord(input)) {
    return {
      valid: false,
      errors: ["assessment input must be an object"],
      dimensions: {},
      blocking_gaps: [...DIMENSIONS],
      evidence_dossier_complete: false,
      approved_for_routing: false
    };
  }

  for (const key of Object.keys(input)) {
    if (!DIMENSIONS.includes(key)) errors.push(`unsupported assessment dimension: ${key}`);
  }

  const dimensions = {};
  const blockingGaps = [];
  for (const name of DIMENSIONS) {
    const item = input[name];
    let status = "missing";
    let evidenceRefs = [];

    if (item === undefined) {
      // Omitted dimensions are explicitly treated as missing.
    } else if (!isRecord(item) || Object.keys(item).some(key => !["status", "evidence_refs"].includes(key))) {
      errors.push(`${name} must contain only status and evidence_refs`);
    } else {
      if (!STATUSES.has(item.status)) {
        errors.push(`${name}.status must be missing, partial, or evidenced`);
      } else {
        status = item.status;
      }
      if (item.evidence_refs !== undefined) {
        if (!Array.isArray(item.evidence_refs) || item.evidence_refs.some(ref => typeof ref !== "string" || ref.trim().length === 0 || ref.length > 1000)) {
          errors.push(`${name}.evidence_refs must be an array of non-empty references up to 1000 characters`);
        } else {
          evidenceRefs = [...new Set(item.evidence_refs)];
        }
      }
      if (status === "evidenced" && evidenceRefs.length === 0) {
        errors.push(`${name} cannot be evidenced without at least one evidence reference`);
        status = "partial";
      }
      if (status === "missing" && evidenceRefs.length > 0) {
        errors.push(`${name} marked missing cannot include evidence references`);
        status = "partial";
      }
    }

    dimensions[name] = { status, evidence_refs: evidenceRefs };
    if (status !== "evidenced") blockingGaps.push(name);
  }

  const valid = errors.length === 0;
  const complete = valid && blockingGaps.length === 0;
  return {
    valid,
    errors,
    dimensions,
    blocking_gaps: blockingGaps,
    evidence_dossier_complete: complete,
    // Completeness is not independent verification and never enables routing.
    approved_for_routing: false
  };
}

export const RESTRICTION_SOURCE_ASSESSMENT_DIMENSIONS = DIMENSIONS;
