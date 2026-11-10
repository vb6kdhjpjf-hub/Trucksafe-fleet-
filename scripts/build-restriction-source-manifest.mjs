import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { verifyHumanReviewEvent } from "./verify-restriction-source-review.mjs";

const sha256 = value => createHash("sha256").update(value).digest("hex");
const isHash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

async function readBounded(file, maxBytes = 5 * 1024 * 1024) {
  const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > maxBytes) throw new Error("Input must be a regular file within the size limit");
    const bytes = await handle.readFile();
    if (bytes.byteLength > maxBytes) throw new Error("Input exceeds the size limit");
    return bytes;
  } finally { await handle.close(); }
}

function parseJson(bytes, label) {
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new Error(label + " is not valid UTF-8 JSON"); }
}

export function verifyRestrictionSourceManifest(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest) ||
      manifest.schema_version !== 1 || manifest.approved_for_routing !== false ||
      !Array.isArray(manifest.candidates) || !Array.isArray(manifest.orphaned_events) ||
      !isHash(manifest.manifest_sha256)) {
    throw new Error("Manifest schema is malformed or does not explicitly remain unapproved");
  }
  const { manifest_sha256: supplied, ...body } = manifest;
  if (sha256(JSON.stringify(body)) !== supplied) throw new Error("Manifest integrity hash mismatch");
  if (manifest.candidates.some(item => !item || typeof item !== "object" ||
      !isHash(item.candidate_payload_sha256) ||
      !["assessment_missing", "awaiting_review", "reviewed", "repeated_review", "review_integrity_failed", "stale_review"].includes(item.status) ||
      item.approved_for_routing !== false || !Array.isArray(item.reviews))) {
    throw new Error("Manifest candidate entry is malformed");
  }
  return { valid: true, candidate_count: manifest.candidates.length, orphaned_event_count: manifest.orphaned_events.length, approved_for_routing: false };
}

export async function buildRestrictionSourceManifest({ quarantineDir, outputDir = quarantineDir, createdAt = new Date().toISOString() }) {
  if (typeof createdAt !== "string" || !Number.isFinite(Date.parse(createdAt)) ||
      !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$/.test(createdAt)) {
    throw new Error("createdAt must be ISO 8601 with an explicit timezone");
  }
  const requestedDir = path.resolve(quarantineDir);
  const dirInfo = await lstat(requestedDir);
  if (!dirInfo.isDirectory() || dirInfo.isSymbolicLink()) throw new Error("Quarantine path must be an existing, non-symlink directory");
  const dir = await realpath(requestedDir);
  const targetInfo = await lstat(path.resolve(outputDir));
  if (!targetInfo.isDirectory() || targetInfo.isSymbolicLink()) throw new Error("Output path must be an existing, non-symlink directory");
  const targetDir = await realpath(path.resolve(outputDir));

  const names = await readdir(dir);
  const candidateNames = names.filter(name => /^candidate-[a-f0-9]{64}\.json$/.test(name)).sort();
  const reviewDir = path.join(dir, "reviews");
  let reviewNames = [];
  try {
    const info = await lstat(reviewDir);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Reviews path must be a non-symlink directory");
    reviewNames = (await readdir(reviewDir)).filter(name => /^review-[a-f0-9]{64}\.json$/.test(name)).sort();
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const eventRecords = [];
  for (const name of reviewNames) {
    const file = path.join(reviewDir, name);
    const event = parseJson(await readBounded(file, 1024 * 1024), "Review event");
    eventRecords.push({ name, file, event });
  }

  const candidates = [];
  const seenEventNames = new Set();
  for (const name of candidateNames) {
    const candidateFile = path.join(dir, name);
    const candidateBytes = await readBounded(candidateFile);
    const candidate = parseJson(candidateBytes, "Candidate");
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate) ||
        !isHash(candidate.payload_sha256) || name !== "candidate-" + candidate.payload_sha256 + ".json" ||
        candidate.review?.approved_for_routing !== false) {
      throw new Error("Candidate filename, payload hash, or unapproved state is invalid: " + name);
    }
    const assessmentName = "candidate-" + candidate.payload_sha256 + ".assessment.json";
    const assessmentFile = path.join(dir, assessmentName);
    let assessmentExists = false;
    try {
      const info = await lstat(assessmentFile);
      if (!info.isFile() || info.isSymbolicLink()) throw new Error("Assessment path must be a regular, non-symlink file");
      assessmentExists = true;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    const related = eventRecords.filter(record => record.event?.candidate_payload_sha256 === candidate.payload_sha256);
    const reviews = [];
    let staleReview = false;
    if (assessmentExists) {
      for (const record of related) {
        seenEventNames.add(record.name);
        try {
          const result = await verifyHumanReviewEvent({ candidateFile, assessmentReportFile: assessmentFile, eventFile: record.file });
          reviews.push({ event_file: "reviews/" + record.name, valid: true, decision: result.decision, reviewer: result.reviewer, reviewed_at: record.event.reviewed_at, event_sha256: result.event_sha256, assessment_report_sha256: result.assessment_report_sha256 });
        } catch (error) {
          const message = String(error.message).slice(0, 500);
          if (/assessment report hash|source provenance does not match|candidate payload hash/i.test(message)) staleReview = true;
          reviews.push({ event_file: "reviews/" + record.name, valid: false, stale: staleReview, error: message });
        }
      }
    } else {
      for (const record of related) {
        seenEventNames.add(record.name);
        reviews.push({ event_file: "reviews/" + record.name, valid: false, error: "Assessment report is missing; review cannot be verified" });
      }
    }
    const validReviews = reviews.filter(review => review.valid);
    const invalidReviews = reviews.some(review => !review.valid);
    let status = "awaiting_review";
    if (!assessmentExists) status = "assessment_missing";
    else if (staleReview) status = "stale_review";
    else if (invalidReviews) status = "review_integrity_failed";
    else if (validReviews.length > 1) status = "repeated_review";
    else if (validReviews.length === 1) status = "reviewed";
    candidates.push({
      source_id: typeof candidate.source?.source_id === "string" ? candidate.source.source_id : null,
      dataset_name: typeof candidate.source?.dataset_name === "string" ? candidate.source.dataset_name : null,
      dataset_version: typeof candidate.source?.dataset_version === "string" ? candidate.source.dataset_version : null,
      retrieved_at: typeof candidate.retrieved_at === "string" ? candidate.retrieved_at : null,
      candidate_file: name,
      candidate_payload_sha256: candidate.payload_sha256,
      assessment_file: assessmentExists ? assessmentName : null,
      status,
      reviews,
      approved_for_routing: false
    });
  }

  const orphanedEvents = eventRecords.filter(record => !seenEventNames.has(record.name)).map(record => ({
    event_file: "reviews/" + record.name,
    candidate_payload_sha256: isHash(record.event?.candidate_payload_sha256) ? record.event.candidate_payload_sha256 : null,
    status: "orphaned_or_unmatched"
  }));
  const body = {
    schema_version: 1,
    created_at: createdAt,
    candidate_count: candidates.length,
    orphaned_event_count: orphanedEvents.length,
    candidates,
    orphaned_events: orphanedEvents,
    approved_for_routing: false
  };
  const manifest = { ...body, manifest_sha256: sha256(JSON.stringify(body)) };
  verifyRestrictionSourceManifest(manifest);
  const output = path.join(targetDir, "restriction-source-manifest-" + manifest.manifest_sha256 + ".json");
  const handle = await open(output, "wx", 0o600);
  try { await handle.writeFile(JSON.stringify(manifest, null, 2) + "\n", "utf8"); await handle.sync(); }
  catch (error) { await handle.close().catch(() => {}); throw error; }
  await handle.close();
  return { output, manifest };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--quarantine-dir") {
    throw new Error("Usage: node scripts/build-restriction-source-manifest.mjs --quarantine-dir DIR");
  }
  const result = await buildRestrictionSourceManifest({ quarantineDir: args[1] });
  process.stdout.write("Immutable source-history manifest created: " + result.output + "\n");
  process.stdout.write("Candidates: " + result.manifest.candidate_count + "; orphaned events: " + result.manifest.orphaned_event_count + "\n");
  process.stdout.write("This is an offline audit index only; routing approval remains false.\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error => {
  process.stderr.write("Manifest build failed: " + error.message + "\n");
  process.exitCode = 1;
});
