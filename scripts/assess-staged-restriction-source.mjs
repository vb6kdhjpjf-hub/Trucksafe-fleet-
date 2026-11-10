import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { assessRestrictionSource } from "../lib/restriction-source-assessment.mjs";

async function readJson(file) {
  const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > 1024 * 1024) throw new Error("Input must be a regular file no larger than 1 MiB");
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await handle.readFile()));
  } finally { await handle.close(); }
}

export async function createAssessmentReport({ candidateFile, assessmentFile, outputDir }) {
  const candidate = await readJson(candidateFile);
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate) ||
      typeof candidate.payload_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(candidate.payload_sha256) ||
      !candidate.review || candidate.review.approved_for_routing !== false) {
    throw new Error("Candidate envelope is malformed or not explicitly unapproved");
  }
  const assessment = await readJson(assessmentFile);
  const report = assessRestrictionSource(assessment);
  const requestedDir = path.resolve(outputDir);
  const info = await lstat(requestedDir);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Output path must be an existing, non-symlink directory");
  const dir = await realpath(requestedDir);
  const output = path.join(dir, "candidate-" + candidate.payload_sha256 + ".assessment.json");
  const handle = await open(output, "wx", 0o600);
  try { await handle.writeFile(JSON.stringify(report, null, 2) + "\n", "utf8"); await handle.sync(); }
  catch (error) { await handle.close().catch(() => {}); throw error; }
  await handle.close();
  return { output, report };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 6 || args[0] !== "--candidate" || args[2] !== "--assessment" || args[4] !== "--output-dir") {
    throw new Error("Usage: node scripts/assess-staged-restriction-source.mjs --candidate FILE --assessment FILE --output-dir DIR");
  }
  const result = await createAssessmentReport({ candidateFile: args[1], assessmentFile: args[3], outputDir: args[5] });
  process.stdout.write("Assessment report created: " + result.output + "\n");
  process.stdout.write("Evidence dossier complete: " + result.report.evidence_dossier_complete + "\n");
  process.stdout.write("Routing approval remains false. Human review is still required.\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { process.stderr.write("Assessment failed: " + error.message + "\n"); process.exitCode = 1; });
}
