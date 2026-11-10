import test from "node:test";
import assert from "node:assert/strict";
import { readBoundedBody } from "../../lib/read-bounded-body.mjs";

function streamOf(chunks) {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
      controller.close();
    }
  });
}

test("reads a body that is exactly at the byte limit", async () => {
  const result = await readBoundedBody(streamOf(["1234"]), 4);
  assert.deepEqual(result, { ok: true, text: "1234" });
});

test("rejects a body that exceeds the byte limit across multiple chunks", async () => {
  const result = await readBoundedBody(streamOf(["123", "45"]), 4);
  assert.deepEqual(result, { ok: false, reason: "too_large" });
});

test("measures UTF-8 bytes rather than JavaScript characters", async () => {
  const result = await readBoundedBody(streamOf(["א"]), 1);
  assert.deepEqual(result, { ok: false, reason: "too_large" });
});

test("rejects malformed UTF-8 instead of silently replacing bytes", async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([0xc3, 0x28]));
      controller.close();
    }
  });
  const result = await readBoundedBody(stream, 8);
  assert.deepEqual(result, { ok: false, reason: "invalid_utf8" });
});

test("accepts an absent body as an empty string", async () => {
  const result = await readBoundedBody(null, 16);
  assert.deepEqual(result, { ok: true, text: "" });
});
