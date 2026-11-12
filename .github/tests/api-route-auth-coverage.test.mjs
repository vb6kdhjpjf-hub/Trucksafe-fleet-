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
    } else if (/^route\\.(?:js|mjs|ts|tsx)$/.test(entry.name)) {
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
    const importsFleetGate = /from\\s+["'][^"']*lib\\/fleet-api-access\\.mjs["']/.test(source);
    const invokesFleetGate = /\\bresolveFleetApiAccess\\s*\\(/.test(source);
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
