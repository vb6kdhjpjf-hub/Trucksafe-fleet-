import { readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

const root = process.cwd();

async function expandIncludes(file, stack = []) {
  const absolute = path.resolve(root, file);
  if (stack.includes(absolute)) {
    throw new Error(`Circular SQL include: ${[...stack, absolute].join(" -> ")}`);
  }
  const source = await readFile(absolute, "utf8");
  const lines = source.split(/\r?\n/);
  const expanded = [];
  for (const line of lines) {
    const match = line.match(/^\s*\\ir\s+(.+?)\s*$/);
    if (match) {
      const includePath = path.resolve(path.dirname(absolute), match[1]);
      expanded.push(await expandIncludes(path.relative(root, includePath), [...stack, absolute]));
    } else {
      expanded.push(line);
    }
  }
  return expanded.join("\n");
}

const databaseUrl = process.env.SUPABASE_TEST_DB_URL;
if (!databaseUrl) throw new Error("SUPABASE_TEST_DB_URL is required");

const files = [
  ".github/tests/fk-index-migration-e2e.sql",
  ".github/tests/lifecycle-e2e.sql",
  ".github/tests/road-vehicle-security-e2e.sql",
  ".github/tests/route-quota-e2e.sql",
  ".github/tests/cross-fleet-integrity-e2e.sql",
];

const client = new Client({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
  query_timeout: 120000,
});

try {
  await client.connect();
  for (const file of files) {
    console.log(`Running rollback-only SQL test: ${file}`);
    const sql = await expandIncludes(file);
    const results = await client.query(sql);
    if (file === ".github/tests/cross-fleet-integrity-e2e.sql") {
      const resultList = Array.isArray(results) ? results : [results];
      const preflight = resultList.find((result) =>
        result.fields?.some((field) => field.name === "relationship")
      );
      if (!preflight) {
        throw new Error("Cross-fleet preflight diagnostic did not return its expected result set");
      }
      if (preflight.rows.length !== 0) {
        throw new Error(`Cross-fleet preflight found ${preflight.rows.length} unexpected violation(s)`);
      }
      console.log("PASS: populated synthetic fixture has zero cross-fleet preflight findings");
    }
    console.log(`PASS: ${file}`);
  }
} catch (error) {
  console.error("Database integration test failed:", error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
