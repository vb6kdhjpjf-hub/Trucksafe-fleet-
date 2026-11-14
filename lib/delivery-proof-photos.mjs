const MAX_PHOTOS = 8;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_PHOTO_BYTES = 40 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export function validateDeliveryPhotoFiles(files) {
  if (!Array.isArray(files)) return "invalid_selection";
  if (files.length > MAX_PHOTOS) return "too_many";
  if (files.some(file => !file || !ALLOWED_PHOTO_TYPES.has(file.type) ||
    !Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_PHOTO_BYTES)) {
    return "invalid_file";
  }
  if (files.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_PHOTO_BYTES) {
    return "total_too_large";
  }
  return null;
}

export function findDeliveryPhotoEntry(entries, file) {
  if (!Array.isArray(entries) || !file) return undefined;
  return entries.find(entry => entry.file === file);
}

/**
 * Storage list entries for folders have no id or metadata. Only confirm an
 * ambiguous upload when the exact file exists and its stored size and MIME
 * type match the payload we attempted to upload.
 */
export function isMatchingDeliveryProofObject(item, expectedSize, expectedContentType) {
  if (!item || item.id == null || !item.metadata) return false;
  if (!Number.isFinite(expectedSize) || expectedSize <= 0) return false;
  return Number(item.metadata.size) === expectedSize &&
    item.metadata.mimetype === expectedContentType;
}
