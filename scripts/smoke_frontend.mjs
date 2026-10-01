import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout } from "node:timers/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const keys = [
  "AUTH0_DOMAIN",
  "AUTH0_AUDIENCE",
  "AUTH0_CLIENT_ID",
  "AUTH0_CLIENT_SECRET",
  "AUTH0_SECRET",
  "APP_BASE_URL",
  "BACKEND_URL",
];

async function check(configured, port) {
  const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1" };
  for (const key of keys) env[key] = "";
  if (configured)
    Object.assign(env, {
      AUTH0_DOMAIN: "fixture.auth0.invalid",
      AUTH0_AUDIENCE: "https://fixture.invalid/api",
      AUTH0_CLIENT_ID: "fixture-client",
      AUTH0_CLIENT_SECRET: "fixture-secret-not-a-real-credential",
      AUTH0_SECRET: "1".repeat(64),
      APP_BASE_URL: `http://127.0.0.1:${port}`,
      BACKEND_URL: "http://127.0.0.1:1",
    });
  const child = spawn(
    process.execPath,
    [
      path.join(root, "frontend/node_modules/next/dist/bin/next"),
      "start",
      "-p",
      String(port),
      "--hostname",
      "127.0.0.1",
    ],
    { cwd: path.join(root, "frontend"), env, stdio: "ignore" },
  );
  const base = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(base)).ok) {
          ready = true;
          break;
        }
      } catch {}
      await setTimeout(100);
    }
    assert(ready, "Production server must become ready");
    const home = await fetch(base);
    const html = await home.text();
    assert(
      html.includes(
        configured
          ? "Sign in to your workspace"
          : "Authentication setup needed",
      ),
    );
    assert(!html.includes("fixture-secret-not-a-real-credential"));
    const workspace = await fetch(base + "/workspace", { redirect: "manual" });
    assert.equal(workspace.status, 307);
    const location = workspace.headers.get("location");
    assert(configured ? location.includes("/auth/login") : location === "/");
    const api = await fetch(base + "/api/backend/me");
    assert.equal(api.status, configured ? 401 : 503);
    assert.equal(api.headers.get("cache-control"), "no-store");
    const arbitrary = await fetch(
      base + "/api/backend/https%3A%2F%2Fevil.invalid",
    );
    assert.equal(arbitrary.status, 404);
    console.log(
      `PASS: ${configured ? "signed-out" : "unconfigured"} page, protected redirect, API gate, response secrecy`,
    );
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
  }
}

await check(false, 3333);
await check(true, 3334);
