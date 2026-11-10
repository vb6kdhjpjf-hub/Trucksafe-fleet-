import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import path from "node:path";
import { hashRestrictionPayload } from "../lib/restriction-source-envelope.mjs";
import { pathToFileURL } from "node:url";

const sha256 = value => createHash("sha256").update(value).digest("hex");
const isHash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const decisions = new Set(["accepted_for_pilot", "rejected", "needs_more_evidence"]);
const eventKeys = ["schema_version", "candidate_schema_version", "source_id", "publisher", "dataset_name", "dataset_version", "licence_reference", "retrieved_at", "candidate_payload_sha256", "assessment_report_sha256", "reviewer", "reviewed_at", "decision", "notes", "evidence_refs", "event_sha256"];

async function readBytes(file) {
  const handle = await open(path.resolve(file), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > 1024 * 1024) throw new Error("Input must be a regular file no larger than 1 MiB");
    return await handle.readFile();
  } finally { await handle.close(); }
}
function parse(bytes, label) {
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new Error(label + " is not valid UTF-8 JSON"); }
}

export async function verifyHumanReviewEvent({ candidateFile, assessmentReportFile, eventFile }) {
  const [candidateBytes, reportBytes, eventBytes] = await Promise.all([readBytes(candidateFile), readBytes(assessmentReportFile), readBytes(eventFile)]);
  const candidate = parse(candidateBytes, "Candidate");
  const report = parse(reportBytes, "Assessment report");
  const event = parse(eventBytes, "Review event");

  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate) || !isHash(candidate.payload_sha256) || candidate.review?.approved_for_routing !== false) {
    throw new Error("Candidate is malformed or not explicitly unapproved");
  }
  if (hashRestrictionPayload(candidate.payload) !== candidate.payload_sha256) throw new Error("Candidate payload hash does not match stored payload");
  if (!report || typeof report !== "object" || Array.isArray(report) || report.approved_for_routing !== false || typeof report.valid !== "boolean" || !report.dimensions || typeof report.dimensions !== "object" || Array.isArray(report.dimensions)) {
    throw new Error("Assessment report is malformed or not explicitly unapproved");
  }
  if (!event || typeof event !== "object" || Array.isArray(event) || Object.keys(event).length !== eventKeys.length || eventKeys.some(key => !Object.hasOwn(event, key))) {
    throw new Error("Review event has missing or unexpected fields");
  }
  if (event.schema_version !== 1 || typeof event.candidate_schema_version !== "string" ||
      ["source_id", "publisher", "dataset_name", "dataset_version", "licence_reference"].some(key => typeof event[key] !== "string" || !event[key].trim() || event[key].length > 1000) ||
      typeof event.retrieved_at !== "string" || !Number.isFinite(Date.parse(event.retrieved_at)) ||
      !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$/.test(event.retrieved_at) ||
      !isHash(event.candidate_payload_sha256) || !isHash(event.assessment_report_sha256) || !isHash(event.event_sha256)) {
    throw new Error("Review event schema or hash fields are invalid");
  }
  if (typeof event.reviewer !== "string" || !event.reviewer.trim() || event.reviewer.length > 200 ||
      !decisions.has(event.decision) || typeof event.notes !== "string" || event.notes.length > 4000 ||
      !Array.isArray(event.evidence_refs) || event.evidence_refs.some(ref => typeof ref !== "string" || !ref.trim() || ref.length > 1000)) {
    throw new Error("Review event fields are invalid");
  }
  if (typeof event.reviewed_at !== "string" || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$/.test(event.reviewed_at) || !Number.isFinite(Date.parse(event.reviewed_at))) {
    throw new Error("Review timestamp must be valid ISO 8601 with an explicit timezone");
  }
  if (event.candidate_payload_sha256 !== candidate.payload_sha256) throw new Error("Candidate payload hash does not match review event");
  const source = candidate.source;
  if (!source || event.candidate_schema_version !== candidate.schema_version ||
      ["source_id", "publisher", "dataset_name", "dataset_version", "licence_reference"].some(key => event[key] !== source[key]) ||
      event.retrieved_at !== candidate.retrieved_at) {
    throw new Error("Candidate source provenance does not match review event");
  }
  if (event.assessment_report_sha256 !== sha256(reportBytes)) throw new Error("Assessment report hash does not match review event");
  const { event_sha256: suppliedHash, ...eventBody } = event;
  if (suppliedHash !== sha256(JSON.stringify(eventBody))) throw new Error("Review event integrity hash mismatch");
  if (Object.hasOwn(event, "approved_for_routing")) throw new Error("Review event must never contain routing approval");
  return { valid: true, decision: event.decision, reviewer: event.reviewer, source_id: event.source_id, dataset_version: event.dataset_version, retrieved_at: event.retrieved_at, candidate_payload_sha256: event.candidate_payload_sha256, assessment_report_sha256: event.assessment_report_sha256, event_sha256: event.event_sha256, approved_for_routing: false };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 6 || args[0] !== "--candidate" || args[2] !== "--assessment-report" || args[4] !== "--event") {
    throw new Error("Usage: node scripts/verify-restriction-source-review.mjs --candidate FILE --assessment-report FILE --event FILE");
  }
  const result = await verifyHumanReviewEvent({ candidateFile: args[1], assessmentReportFile: args[3], eventFile: args[5] });
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error => { process.stderr.write("Review verification failed: " + error.message + "\n"); process.exitCode = 1; });
