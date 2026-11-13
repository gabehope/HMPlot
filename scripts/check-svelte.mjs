// Run from a consumer app: node /path/to/HMPlot/scripts/check-svelte.mjs --url http://127.0.0.1:5173
// The test-only app entry explicitly exposes window.inspectPlot = () => inspect().
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at < 0 ? fallback : process.argv[at + 1];
};
if (process.argv.includes("--help")) {
  console.log(
    "Run from the consumer application: node /path/to/HMPlot/scripts/check-svelte.mjs --url URL [--out artifacts/svelte-check] [--tsconfig tsconfig.json] [--ready-selector SELECTOR] [--interactions MODULE]\nThe test entry must explicitly install window.inspectPlot. The optional interactions module exports an async default function ({page, out}) returning {status: 'pass'|'fail'|'unknown', ...evidence}.",
  );
  process.exit(0);
}
const url = arg("url");
if (!url)
  throw Error("check-svelte: pass --url for the running test application.");
const out = resolve(arg("out", "artifacts/svelte-check"));
await mkdir(out, { recursive: true });
const require = createRequire(resolve("package.json"));
const staticReport = { passed: false, output: "" };
try {
  const result = await promisify(execFile)(
    process.execPath,
    [
      require.resolve("svelte-check/bin/svelte-check"),
      "--tsconfig",
      resolve(arg("tsconfig", "tsconfig.json")),
      "--output",
      "machine-verbose",
    ],
    { maxBuffer: 10 * 1024 * 1024 },
  );
  staticReport.passed = true;
  staticReport.output = result.stdout;
} catch (error) {
  staticReport.output = `${error.stdout ?? ""}\n${error.stderr ?? error.message}`;
}
await writeFile(
  resolve(out, "static.json"),
  JSON.stringify(staticReport, null, 2),
);
if (!staticReport.passed) {
  process.exitCode = 1;
} else {
  const browser = await chromium.launch({
    channel: "chrome",
    args: ["--enable-unsafe-webgpu"],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 2,
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url);
    if (arg("ready-selector"))
      await page
        .locator(arg("ready-selector"))
        .waitFor({ state: "visible", timeout: 30000 });
    await page.waitForFunction(() => typeof window.inspectPlot === "function");
    const report = await page.evaluate(() => window.inspectPlot());
    await page.screenshot({
      path: resolve(out, "initial.png"),
      fullPage: true,
    });
    let interactions = {
      status: "unknown",
      reason: "No --interactions module was supplied.",
    };
    const module = arg("interactions");
    if (module)
      interactions = await (
        await import(pathToFileURL(resolve(module)).href)
      ).default({ page, out });
    const final = await page.evaluate(() => window.inspectPlot());
    await page.screenshot({ path: resolve(out, "final.png"), fullPage: true });
    await writeFile(
      resolve(out, "report.json"),
      JSON.stringify({ report, final, errors, interactions }, null, 2),
    );
    if (
      !report.ready ||
      !final.ready ||
      errors.length ||
      interactions.status === "fail"
    )
      process.exitCode = 1;
  } finally {
    await browser.close();
  }
}
