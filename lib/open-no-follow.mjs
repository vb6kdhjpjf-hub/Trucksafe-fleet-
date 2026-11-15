import { constants } from "node:fs";
import { open } from "node:fs/promises";

/**
 * Open an existing input file without following a final-component symlink.
 * Fail closed on platforms that do not expose O_NOFOLLOW rather than silently
 * weakening the input-path guarantee.
 */
export async function openNoFollow(file, flags = constants.O_RDONLY) {
  if (!Number.isInteger(constants.O_NOFOLLOW) || constants.O_NOFOLLOW === 0) {
    throw new Error("Secure file reads require operating-system O_NOFOLLOW support");
  }
  return open(file, flags | constants.O_NOFOLLOW);
}
