import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readFile, realpath, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { validateCandidateRestrictionEnvelope } from "../lib/restriction-source-envelope.mjs";

export const MAX_SOURCE_BYTES = 5 * 1024 * 1024;

const required = ["source-id", "publisher", "dataset-name", "dataset-version", "licence-reference", "input", "quarantine-dir"];

export function parseArgs(argv) {
  const values = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const key = token.slice(2);
    if (!token.startsWith("--") || !required.includes(key) || Object.hasOwn(values, key)) {
      throw new Error(`Invalid or duplicate argument: ${token}`);
    }
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${token}`);
    values[key] = value;
    i += 1;
  }
  const missing = required.filter(key => !values[key]);
  if (missing.length) throw new Error(`Missing required arguments: ${missing.map(key => `--${key}`).join(", ")}`);
  return values;
}

async function readBoundedInput(input) {
  const handle = await open(input, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new Error("Input must be a regular file");
    if (info.size > MAX_SOURCE_BYTES) throw new Error("Input exceeds the 5 MiB safety limit");
    const raw = await handle.readFile();
    if (raw.byteLength > MAX_SOURCE_BYTES) throw new Error("Input exceeds the 5 MiB safety limit");
    return raw.toString("utf8");
  } finally {
    await handle.close();
  }
}

export async function stageCandidate({ input, quarantineDir, source, retrievedAt = new Date().toISOString() }) {
  for (const key of ["source_id", "publisher", "dataset_name", "dataset_version", "licence_reference"]) {
    if (typeof source?.[key] !== "string" || !source[key].trim()) throw new Error(`Missing source metadata: ${key}`);
  }

  const rawPayload = await readBoundedInput(input);
  let payload;
  try { payload = JSON.parse(rawPayload); } catch { throw new Error("Input is not valid JSON"); }
  if (payload === null || typeof payload !== "object") throw new Error("Payload must be a JSON object or array");

  const envelope = {
    schema_version: "1.0",
    source,
    retrieved_at: retrievedAt,
    payload,
    payload_sha256: createHash("sha256").update(rawPayload, "utf8").digest("hex"),
    review: { status: "unreviewed", approved_for_routing: false }
  };
  const validation = validateCandidateRestrictionEnvelope(envelope, rawPayload);
  if (!validation.valid) throw new Error(`Candidate validation failed: ${validation.errors.join("; ")}`);

  const requestedDir = path.resolve(quarantineDir);
  const dirInfo = await lstat(requestedDir);
  if (!dirInfo.isDirectory() || dirInfo.isSymbolicLink()) {
    throw new Error("Quarantine path must be an existing, non-symlink directory");
  }
  const dir = await realpath(requestedDir);
  const output = path.join(dir, `candidate-${envelope.payload_sha256}.json`);
  if (path.dirname(output) !== dir) throw new Error("Unsafe quarantine output path");

  const handle = await open(output, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(envelope, null, 2)}\\n`, "utf8");
    await handle.sync();
  } catch (error) {
    await handle.close();
    await rm(output, { force: true }).catch(() => {});
    throw error;
  }
  await handle.close();
  return output;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const output = await stageCandidate({
    input: args.input,
    quarantineDir: args["quarantine-dir"],
    source: {
      source_id: args["source-id"],
      publisher: args.publisher,
      dataset_name: args["dataset-name"],
      dataset_version: args["dataset-version"],
      licence_reference: args["licence-reference"]
    }
  });
  process.stdout.write(`Staged unapproved candidate: ${output}\\n`);
  process.stdout.write("Routing approval remains false; this tool does not import into any database.\\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    process.stderr.write(`Staging failed: ${error.message}\\n`);
    process.exitCode = 1;
  });
}
