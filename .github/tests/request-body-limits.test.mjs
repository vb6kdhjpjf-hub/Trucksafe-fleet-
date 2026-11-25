import test from "node:test";
import assert from "node:assert/strict";
import { readJsonBodyLimited } from "../../lib/request-body-limits.mjs";

test("reads a valid JSON request within the byte limit", async () => {
  const request = new Request("https://example.invalid", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ origin: "Migdal", destination: "Tiberias" })
  });
  const result = await readJsonBodyLimited(request, 1000);
  assert.deepEqual(result, {
    ok: true,
    value: { origin: "Migdal", destination: "Tiberias" }
  });
});

test("rejects a declared content length above the limit before reading", async () => {
  const request = new Request("https://example.invalid", {
    method: "POST",
    headers: { "content-length": "100" },
    body: "{}"
  });
  const result = await readJsonBodyLimited(request, 10);
  assert.deepEqual(result, { ok: false, status: 413, error: "body_too_large" });
});

test("rejects an oversized streamed body even when content length is absent", async () => {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"payload":"1234567890"}'));
      controller.close();
    }
  });
  const request = new Request("https://example.invalid", {
    method: "POST",
    body,
    duplex: "half"
  });
  const result = await readJsonBodyLimited(request, 10);
  assert.deepEqual(result, { ok: false, status: 413, error: "body_too_large" });
});

test("rejects malformed JSON with a client error", async () => {
  const request = new Request("https://example.invalid", { method: "POST", body: "{" });
  const result = await readJsonBodyLimited(request, 100);
  assert.deepEqual(result, { ok: false, status: 400, error: "invalid_json" });
});

test("rejects invalid UTF-8 rather than silently replacing bytes", async () => {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([0xc3, 0x28]));
      controller.close();
    }
  });
  const request = new Request("https://example.invalid", {
    method: "POST",
    body,
    duplex: "half"
  });
  const result = await readJsonBodyLimited(request, 100);
  assert.deepEqual(result, { ok: false, status: 400, error: "invalid_json" });
});
