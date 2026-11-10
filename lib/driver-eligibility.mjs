/**
 * UI eligibility guard for assigning a driver to a vehicle.
 * Requires active status and a real, non-expired ISO calendar date.
 * This is not a substitute for checking the physical licence class or
 * server/database enforcement; unknown expiry is treated as ineligible.
 */
export function isDriverEligibleForVehicleAssignment(driver, now = new Date()) {
  if (!driver || driver.status !== "active") return false;
  const value = driver.license_expires_at;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return false;
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  return parsed.getTime() >= today.getTime();
}
