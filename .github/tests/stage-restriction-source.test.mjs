import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { MAX_SOURCE_BYTES, stageCandidate } from "../../scripts/stage-restriction-source.mjs";

const source = {
  source_id: "synthetic-source",
  publisher: "Synthetic test publisher",
  dataset_name: "Synthetic road restrictions",
  dataset_version: "fixture-v1",
  licence_reference: "synthetic-only; no external data rights implied"
};

async function fixture(t, raw = '{"id":"bridge-test","clearance_m":4.2}') {
  const root = await mkdtemp(path.join(os.tmpdir(), "trucksafe-stage-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const input = path.join(root, "source.json");
  const quarantineDir = path.join(root, "quarantine");
  await mkdir(quarantineDir);
  await writeFile(input, raw, "utf8");
  return { root, input, quarantineDir };
}

test("stages a valid payload only as an unapproved candidate", async t => {
  const paths = await fixture(t);
  const output = await stageCandidate({ ...paths, source, retrievedAt: "2026-11-10T12:00:00Z" });
  const envelope = JSON.parse(await readFile(output, "utf8"));
  assert.equal(envelope.review.status, "unreviewed");
  assert.equal(envelope.review.approved_for_routing, false);
  assert.equal(envelope.payload.id, "bridge-test");
  assert.match(envelope.payload_sha256, /^[a-f0-9]{64}$/);
});

test("does not overwrite an existing quarantined candidate", async t => {
  const paths = await fixture(t);
  await stageCandidate({ ...paths, source, retrievedAt: "2026-11-10T12:00:00Z" });
  await assert.rejects(stageCandidate({ ...paths, source, retrievedAt: "2026-11-10T12:00:00Z" }), { code: "EEXIST" });
});

test("rejects invalid JSON and primitive payloads", async t => {
  const invalid = await fixture(t, "{bad");
  await assert.rejects(stageCandidate({ ...invalid, source }), /not valid JSON/);
  const primitive = await fixture(t, '"not an object"');
  await assert.rejects(stageCandidate({ ...primitive, source }), /object or array/);
});

test("requires licence and publisher metadata", async t => {
  const paths = await fixture(t);
  await assert.rejects(stageCandidate({ ...paths, source: { ...source, licence_reference: "" } }), /licence_reference/);
});

test("rejects timezone-ambiguous retrieval timestamps", async t => {
  const paths = await fixture(t);
  await assert.rejects(stageCandidate({ ...paths, source, retrievedAt: "2026-11-10T12:00:00" }), /validation failed/);
});

test("rejects an oversized source before parsing it", async t => {
  const paths = await fixture(t);
  await writeFile(paths.input, Buffer.alloc(MAX_SOURCE_BYTES + 1, 0x20));
  await assert.rejects(stageCandidate({ ...paths, source }), /5 MiB safety limit/);
});

test("requires an existing quarantine directory", async t => {
  const paths = await fixture(t);
  await rm(paths.quarantineDir, { recursive: true });
  await assert.rejects(stageCandidate({ ...paths, quarantineDir: paths.quarantineDir, source }), { code: "ENOENT" });
});

test("rejects a symlink used as the quarantine directory", async t => {
  const paths = await fixture(t);
  const realDir = path.join(paths.root, "real-quarantine");
  await mkdir(realDir);
  const linkDir = path.join(paths.root, "quarantine-link");
  await symlink(realDir, linkDir);
  await assert.rejects(stageCandidate({ ...paths, quarantineDir: linkDir, source }), /non-symlink directory/);
});

test("rejects a symlink used as the input file", async t => {
  const paths = await fixture(t);
  const linkInput = path.join(paths.root, "source-link.json");
  await symlink(paths.input, linkInput);
  await assert.rejects(stageCandidate({ ...paths, input: linkInput, source }), { code: "ELOOP" });
});
