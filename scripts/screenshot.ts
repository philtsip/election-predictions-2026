/**
 * Capture desktop + mobile screenshots of the running dev server.
 * Usage: bun scripts/screenshot.ts [baseUrl]
 * Requires the dev server running (it provides the /api/kalshi proxy).
 */
import { chromium } from "playwright";
import * as path from "node:path";

const BASE = process.argv[2] ?? "http://localhost:5179";
const OUT = path.resolve("scripts/outputs/shots");

async function shot(
  name: string,
  width: number,
  height: number,
  fullPage: boolean
) {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 2,
  });
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60_000 });
  // Give React Query a beat to resolve the per-race odds fetches.
  await page.waitForTimeout(6000);
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage });
  console.log("wrote", file);
  await browser.close();
}

await shot("desktop", 1280, 900, true);
await shot("mobile", 390, 844, true);
console.log("done");
