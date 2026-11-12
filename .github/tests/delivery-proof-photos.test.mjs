import test from "node:test";
import assert from "node:assert/strict";
import { validateDeliveryPhotoFiles, findDeliveryPhotoEntry } from "../../lib/delivery-proof-photos.mjs";

const photo = (name, size, type = "image/jpeg", lastModified = 1) =>
  ({ name, size, type, lastModified });

test("accepts up to eight supported photos within per-file and aggregate limits", () => {
  assert.equal(validateDeliveryPhotoFiles(Array.from({ length: 8 }, (_, i) => photo(`photo-${i}.jpg`, 5 * 1024 * 1024))), null);
});

test("rejects more than eight photos instead of silently dropping selected files", () => {
  assert.equal(validateDeliveryPhotoFiles(Array.from({ length: 9 }, (_, i) => photo(`photo-${i}.jpg`, 1))), "too_many");
});

test("rejects unsupported formats and files larger than ten megabytes", () => {
  assert.equal(validateDeliveryPhotoFiles([photo("script.svg", 1, "image/svg+xml")]), "invalid_file");
  assert.equal(validateDeliveryPhotoFiles([photo("large.jpg", 10 * 1024 * 1024 + 1)]), "invalid_file");
});

test("rejects aggregate photo payloads larger than forty megabytes", () => {
  assert.equal(validateDeliveryPhotoFiles(Array.from({ length: 8 }, (_, i) => photo(`photo-${i}.jpg`, 6 * 1024 * 1024))), "total_too_large");
});

test("does not reuse a storage path for different files with identical metadata", () => {
  const first = photo("camera.jpg", 1024, "image/jpeg", 100);
  const second = photo("camera.jpg", 1024, "image/jpeg", 100);
  const entry = { file: first, path: "fleet/shipment/stop/first.jpg" };
  assert.equal(findDeliveryPhotoEntry([entry], first), entry);
  assert.equal(findDeliveryPhotoEntry([entry], second), undefined);
});

test("rejects invalid selection containers and missing file metadata", () => {
  assert.equal(validateDeliveryPhotoFiles(null), "invalid_selection");
  assert.equal(validateDeliveryPhotoFiles([{}]), "invalid_file");
});
