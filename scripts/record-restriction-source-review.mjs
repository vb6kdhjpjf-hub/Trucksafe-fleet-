import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const sha256 = value => createHash("sha256").update(value).digest("hex");
const isHash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

async function readBytes(file) {
  const handle = await open(file, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > 1024 * 1024) throw new Error("Input must be a regular file no larger than 1 MiB");
    return await handle.readFile();
  } finally { await handle.close(); }
}

export async function createHumanReviewEvent({ candidateFile, assessmentReportFile, outputDir, reviewer, decision, notes = "", reviewedAt = new Date().toISOString() }) {
  if (typeof reviewer !== "string" || !reviewer.trim() || reviewer.length > 200) throw new Error("A non-empty reviewer identifier (max 200 characters) is required");
  if (!["accepted_for_pilot", "rejected", "needs_more_evidence"].includes(decision)) throw new Error("Unsupported human review decision");
  if (typeof notes !== "string" || notes.length > 4000) throw new Error("Notes must be text up to 4000 characters");
  if (typeof reviewedAt !== "string" || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$/.test(reviewedAt) || !Number.isFinite(Date.parse(reviewedAt))) throw new Error("Review timestamp must be valid ISO 8601 with an explicit timezone");

  const candidate = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await readBytes(candidateFile)));
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate) || !isHash(candidate.payload_sha256) || candidate.review?.approved_for_routing !== false) throw new Error("Candidate must be a valid, explicitly unapproved envelope");
  const source = candidate.source;
  const sourceFields = ["source_id", "publisher", "dataset_name", "dataset_version", "licence_reference"];
  if (!source || typeof source !== "object" || Array.isArray(source) || sourceFields.some(key => typeof source[key] !== "string" || !source[key].trim() || source[key].length > 1000) ||
      typeof candidate.schema_version !== "string" || typeof candidate.retrieved_at !== "string" ||
      !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$/.test(candidate.retrieved_at) || !Number.isFinite(Date.parse(candidate.retrieved_at))) {
    throw new Error("Candidate source provenance metadata is incomplete or invalid");
  }
  const reportBytes = await readBytes(assessmentReportFile);
  const report = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(reportBytes));
  if (!report || typeof report !== "object" || Array.isArray(report) || report.approved_for_routing !== false ||
      typeof report.valid !== "boolean" || !report.dimensions || typeof report.dimensions !== "object" || Array.isArray(report.dimensions)) {
    throw new Error("Assessment report is malformed or not explicitly unapproved");
  }
  if (Object.hasOwn(report, "reviewer") || Object.hasOwn(report, "decision")) throw new Error("Assessment report must not contain review-event fields");
  const evidenceRefs = Object.values(report.dimensions).flatMap(item => Array.isArray(item?.evidence_refs) ? item.evidence_refs : []);
  const event = {
    schema_version: 1,
    candidate_schema_version: candidate.schema_version,
    source_id: source.source_id,
    publisher: source.publisher,
    dataset_name: source.dataset_name,
    dataset_version: source.dataset_version,
    licence_reference: source.licence_reference,
    retrieved_at: candidate.retrieved_at,
    candidate_payload_sha256: candidate.payload_sha256,
    assessment_report_sha256: sha256(reportBytes),
    reviewer: reviewer.trim(),
    reviewed_at: reviewedAt,
    decision,
    notes,
    evidence_refs: [...new Set(evidenceRefs)]
  };
  const canonical = JSON.stringify(event);
  const completeEvent = { ...event, event_sha256: sha256(canonical) };
  const requestedDir = path.resolve(outputDir);
  const info = await lstat(requestedDir);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Output path must be an existing, non-symlink directory");
  const dir = await realpath(requestedDir);
  const reviewsDir = path.join(dir, "reviews");
  await lstat(reviewsDir).catch(async error => { if (error.code !== "ENOENT") throw error; const { mkdir } = await import("node:fs/promises"); await mkdir(reviewsDir, { mode: 0o700 }); });
  const reviewInfo = await lstat(reviewsDir);
  if (!reviewInfo.isDirectory() || reviewInfo.isSymbolicLink()) throw new Error("Reviews path must be a non-symlink directory");
  const output = path.join(await realpath(reviewsDir), "review-" + completeEvent.event_sha256 + ".json");
  const handle = await open(output, "wx", 0o600);
  try { await handle.writeFile(JSON.stringify(completeEvent, null, 2) + "\n", "utf8"); await handle.sync(); }
  catch (error) { await handle.close().catch(() => {}); throw error; }
  await handle.close();
  return { output, event: completeEvent };
}

async function main() {
  const args = process.argv.slice(2);
  const values = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!args[i]?.startsWith("--") || !args[i + 1] || values[args[i].slice(2)] !== undefined) throw new Error("Invalid or duplicate arguments");
    values[args[i].slice(2)] = args[i + 1];
  }
  const allowed = ["candidate", "assessment-report", "output-dir", "reviewer", "decision", "notes", "reviewed-at"];
  if (Object.keys(values).some(key => !allowed.includes(key)) || !["candidate", "assessment-report", "output-dir", "reviewer", "decision"].every(key => values[key])) {
    throw new Error("Usage: node scripts/record-restriction-source-review.mjs --candidate FILE --assessment-report FILE --output-dir DIR --reviewer ID --decision accepted_for_pilot|rejected|needs_more_evidence [--notes TEXT] [--reviewed-at ISO_TIMESTAMP]");
  }
  const result = await createHumanReviewEvent({ candidateFile: values.candidate, assessmentReportFile: values["assessment-report"], outputDir: values["output-dir"], reviewer: values.reviewer, decision: values.decision, notes: values.notes ?? "", reviewedAt: values["reviewed-at"] ?? new Date().toISOString() });
  process.stdout.write("Human review event created: " + result.output + "\n");
  process.stdout.write("This records a human decision only; routing approval remains false.\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error => { process.stderr.write("Review event failed: " + error.message + "\n"); process.exitCode = 1; });
