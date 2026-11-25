import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

/**
 * Resolve a directory only when it is a real directory owned by the current
 * user and inaccessible to group/other users. This reduces accidental or
 * cross-user tampering; it does not eliminate parent-component TOCTOU races.
 */
export async function assertPrivateDirectory(requestedPath, label = "Directory") {
  const absolute = path.resolve(requestedPath);
  const info = await lstat(absolute);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error(label + " path must be an existing, non-symlink directory");
  }
  if ((info.mode & 0o077) !== 0) {
    throw new Error(label + " directory must have private permissions (0700)");
  }
  if (typeof process.getuid === "function" && info.uid !== process.getuid()) {
    throw new Error(label + " directory must be owned by the current user");
  }
  return realpath(absolute);
}
