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
  ".github/tests/cross-fleet-preflight-detects-anomalies.sql",
  ".github/tests/query-plan-performance-e2e.sql",
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
    if (file === ".github/tests/cross-fleet-preflight-detects-anomalies.sql") {
      const resultList = Array.isArray(results) ? results : [results];
      const preflight = resultList.find((result) =>
        result.fields?.some((field) => field.name === "relationship")
      );
      if (!preflight) {
        throw new Error("Anomaly preflight diagnostic did not return its expected result set");
      }
      if (
        preflight.rows.length !== 1 ||
        preflight.rows[0].relationship !== "tasks.assigned_driver_id"
      ) {
        throw new Error(
          `Expected exactly one tasks.assigned_driver_id anomaly; received ${preflight.rows.length} finding(s)`
        );
      }
      console.log("PASS: preflight detects the synthetic cross-fleet task-driver anomaly");
    }
    if (file === ".github/tests/query-plan-performance-e2e.sql") {
      const resultList = Array.isArray(results) ? results : [results];
      const plans = resultList.filter((result) =>
        result.fields?.some((field) => field.name === "QUERY PLAN")
      );
      if (plans.length !== 2) {
        throw new Error("Expected 2 EXPLAIN plans; received " + plans.length);
      }
      const expectedIndexes = [
        "idx_trucksafe_perf_tasks_fleet_status",
        "idx_trucksafe_perf_locations_trip_recorded",
      ];
      for (let index = 0; index < plans.length; index += 1) {
        const rawPlan = plans[index].rows[0]?.["QUERY PLAN"];
        const document = Array.isArray(rawPlan) ? rawPlan[0] : rawPlan;
        const indexNames = [];
        const visit = (node) => {
          if (!node || typeof node !== "object") return;
          if (node["Index Name"]) indexNames.push(node["Index Name"]);
          for (const child of node.Plans ?? []) visit(child);
        };
        visit(document?.Plan);
        if (!indexNames.includes(expectedIndexes[index])) {
          throw new Error("Expected query plan to use " + expectedIndexes[index] +
            "; found: " + (indexNames.join(", ") || "no index"));
        }
        if (document?.Plan?.["Actual Rows"] !== 100) {
          throw new Error("Expected 100 returned rows for " + expectedIndexes[index] +
            "; received " + document?.Plan?.["Actual Rows"]);
        }
        if (!Number.isFinite(document?.["Execution Time"])) {
          throw new Error("Missing execution time for " + expectedIndexes[index]);
        }
        console.log("PASS: " + expectedIndexes[index] + " used; 100 rows returned in " +
          document["Execution Time"].toFixed(3) + " ms");
      }
    }
    console.log(`PASS: ${file}`);
  }
} catch (error) {
  console.error("Database integration test failed:", error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
