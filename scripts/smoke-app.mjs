import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const port = Number(process.env.TRUCKSAFE_SMOKE_PORT || 3187);
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      HERE_API_KEY: "",
      PTV_API_KEY: "",
      TRUCK_ROUTING_PROVIDER: "disabled",
      TRUCK_RESTRICTION_COVERAGE_APPROVED: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  }
);

let serverOutput = "";
server.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
server.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error("Next.js server exited before becoming ready:\n" + serverOutput);
    }
    try {
      const response = await fetch(baseUrl + "/");
      if (response.ok) return;
    } catch {}
    await sleep(500);
  }
  throw new Error("Next.js server did not become ready:\n" + serverOutput);
}

async function check(name, path, init, expectedStatus) {
  const response = await fetch(baseUrl + path, init);
  assert.equal(response.status, expectedStatus, name + " returned unexpected HTTP status");
  return response;
}

try {
  await waitForServer();

  const home = await check("dashboard shell", "/", undefined, 200);
  const html = await home.text();
  assert.match(html, /TruckSafe|משאיות|צי/i, "dashboard shell did not render expected app content");

  const readiness = await check("truck route readiness", "/api/truck-route", undefined, 200);
  const readinessBody = await readiness.json();
  assert.equal(readinessBody.configured, false, "truck routing must remain disabled in smoke environment");
  assert.match(readiness.headers.get("cache-control") || "", /no-store/, "readiness response must not be cached");

  const jsonHeaders = { "content-type": "application/json" };
  const methodNotAllowed = await check("PTV GET method gate", "/api/ptv-routing-check", undefined, 405);
  assert.match(methodNotAllowed.headers.get("cache-control") || "", /no-store/, "PTV response must not be cached");
  await check("PTV profile GET method gate", "/api/ptv-profile-check", undefined, 405);
  await check("truck route authentication gate", "/api/truck-route", {
    method: "POST", headers: jsonHeaders, body: "{}",
  }, 401);
  await check("PTV routing authentication gate", "/api/ptv-routing-check", {
    method: "POST", headers: jsonHeaders, body: "{}",
  }, 401);
  await check("PTV profile authentication gate", "/api/ptv-profile-check", {
    method: "POST", headers: jsonHeaders, body: "{}",
  }, 401);
  await check("truck route content-type gate", "/api/truck-route", {
    method: "POST", body: "{}",
  }, 415);
  const authFailure = await check("truck route missing bearer token", "/api/truck-route", {
    method: "POST", headers: jsonHeaders, body: "{}",
  }, 401);
  assert.match(authFailure.headers.get("cache-control") || "", /no-store/, "authentication failure must not be cached");

  // Concurrent smoke traffic exercises the live Next.js HTTP server without
  // credentials, database access, or external routing-provider calls.
  const requests = Array.from({ length: 20 }, (_, index) => {
    if (index % 4 === 0) {
      return check("concurrent readiness " + index, "/api/truck-route", undefined, 200);
    }
    if (index % 4 === 1) {
      return check("concurrent truck auth " + index, "/api/truck-route", {
        method: "POST", headers: jsonHeaders, body: "{}",
      }, 401);
    }
    if (index % 4 === 2) {
      return check("concurrent PTV auth " + index, "/api/ptv-routing-check", {
        method: "POST", headers: jsonHeaders, body: "{}",
      }, 401);
    }
    return check("concurrent profile auth " + index, "/api/ptv-profile-check", {
      method: "POST", headers: jsonHeaders, body: "{}",
    }, 401);
  });
  const results = await Promise.all(requests);
  assert.equal(results.length, 20);
  console.log("PASS: dashboard HTTP shell returns 200");
  console.log("PASS: truck routing remains disabled without explicit safety approval");
  console.log("PASS: unauthenticated route and PTV APIs fail closed");
  console.log("PASS: API methods are constrained and responses are not cached");
  console.log("PASS: 20 concurrent API smoke requests returned their expected status");
} finally {
  server.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    sleep(3000),
  ]);
  if (server.exitCode === null) server.kill("SIGKILL");
}
