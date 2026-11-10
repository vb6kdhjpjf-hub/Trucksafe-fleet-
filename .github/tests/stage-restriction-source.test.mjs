import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { stageCandidate } from "../../scripts/stage-restriction-source.mjs";

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
  return { input, quarantineDir };
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
