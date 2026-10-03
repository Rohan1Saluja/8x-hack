// Real Next.js production page checks; no fetch or auth mocks.
// UI_CHECK_TOOLS points to temporary node_modules containing playwright.
import { createRequire } from "node:module";
import { resolve, join } from "node:path";
import { mkdirSync } from "node:fs";
const require = createRequire(
  join(resolve(process.env.UI_CHECK_TOOLS), "package.json"),
);
const { chromium } = require("playwright");
const baseURL = process.env.PUBLIC_TEST_URL || "http://localhost:3000";
const output = process.env.UI_SCREENSHOT_DIR || "/tmp/eightx-product-browser";
mkdirSync(output, { recursive: true });
import assert from "node:assert/strict";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BROWSER_EXECUTABLE,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(baseURL);
await page
  .getByRole("heading", { name: "Great conversations. Clear next moves." })
  .waitFor();
await page.screenshot({
  path: join(output, "landing-full.png"),
  fullPage: true,
});
await page.getByRole("link", { name: "View demo", exact: true }).click();
await page.getByRole("tab", { name: "Ask AI" }).click();
await page
  .getByRole("button", { name: "What did we decide? ↗", exact: true })
  .click();
await page.locator(".answer-card").waitFor();
assert.match(await page.locator(".answer-card").innerText(), /defer calendar/);
await page.locator(".answer-card .source-chip").click();
await page.locator("#demo-segment-2.segment-active").waitFor();
assert.equal(
  await page
    .getByRole("tab", { name: "Transcript", exact: true })
    .getAttribute("aria-selected"),
  "true",
);
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(baseURL);
assert.equal(
  await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  true,
);
await page.screenshot({
  path: join(output, "landing-mobile.png"),
  fullPage: true,
});
await page.getByRole("link", { name: "View demo", exact: true }).click();
await page.getByRole("tab", { name: "Ask AI" }).click();
await page
  .getByRole("button", {
    name: "Did we agree to public sharing? ↗",
    exact: true,
  })
  .click();
await page.locator(".answer-card").waitFor();
assert.match(
  await page.locator(".answer-card").innerText(),
  /No. External sharing remains undecided/,
);
await page.screenshot({
  path: join(output, "demo-mobile.png"),
  fullPage: true,
});
assert.equal(
  await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  true,
);
await page.locator(".answer-card .source-chip").click();
await page.locator("#demo-segment-5.segment-active").waitFor();
assert.deepEqual(errors, []);
console.log(
  "PASS: production landing and public demo; desktop/mobile; question → source; no page errors or horizontal overflow.",
);
await browser.close();
