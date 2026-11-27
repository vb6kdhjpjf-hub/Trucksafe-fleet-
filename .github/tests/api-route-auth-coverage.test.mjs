import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import test from "node:test";

async function collectRouteFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const found = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...await collectRouteFiles(path));
    } else if (/^route\.(?:js|mjs|ts|tsx)$/.test(entry.name)) {
      found.push(path);
    }
  }
  return found;
}

test("every API route explicitly resolves authenticated fleet membership", async () => {
  const routeFiles = (await collectRouteFiles("app/api")).sort();
  assert.ok(routeFiles.length > 0, "API route discovery must not silently return an empty set");

  const failures = [];
  for (const path of routeFiles) {
    const source = await readFile(path, "utf8");
    const importsFleetGate = /from\s+["'][^"']*lib\/fleet-api-access\.mjs["']/.test(source);
    const invokesFleetGate = /\bresolveFleetApiAccess\s*\(/.test(source);
    if (!importsFleetGate || !invokesFleetGate) {
      failures.push(relative(process.cwd(), path));
    }
  }

  assert.deepEqual(
    failures,
    [],
    "Every API route must use resolveFleetApiAccess. If a future route is intentionally public, add an explicit reviewed exemption with a documented reason."
  );
});

test("truck routing API validates a bounded JSON body and a fleet-scoped saved vehicle", async () => {
  const source = await readFile("app/api/truck-route/route.js", "utf8");
  assert.match(source, /content-type[^\n]*application\/json|content-type[^\n]*includes\(["']application\/json["']\)/i);
  assert.match(source, /readJsonBodyLimited\(request,\s*16000\)/);
  assert.match(source, /\.eq\(["']fleet_id["'],\s*membership\.fleet_id\)/);
  assert.match(source, /\.eq\(["']id["'],\s*vehicleId\)/);
  assert.match(source, /Cache-Control["']:\s*["']no-store/);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|service_role/i);
});

test("paid PTV diagnostic endpoints require owner or fleet-manager role before provider requests", async () => {
  for (const path of ["app/api/ptv-profile-check/route.js", "app/api/ptv-routing-check/route.js"]) {
    const source = await readFile(path, "utf8");
    assert.match(source, /resolveFleetApiAccess\(db,\s*token,\s*\{\s*allowedRoles:\s*\["owner",\s*"fleet_manager"\]\s*\}\)/);
    assert.match(source, /checkTruckRouteQuota\(db\)/);
    assert.match(source, /Cache-Control["']:\s*["']no-store/);
    assert.match(source, /export async function GET\(\)[\s\S]*?405/);
    assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|service_role/i);
    const gateIndex = source.indexOf("resolveFleetApiAccess(db, token");
    const providerIndex = source.indexOf("await fetch(");
    assert.ok(gateIndex >= 0 && providerIndex > gateIndex, path + " must authorize before calling the paid provider");
  }
});
