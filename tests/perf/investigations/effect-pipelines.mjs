// Pipelines and shader modules each presentation effect builds (TODO 138.0's baseline, 138.1's
// check): on the solar-system example at a device pixel ratio of 2, paused, each effect is turned
// off and on twice; the counts are what each switch creates once the next frame lands, and what a
// PNG export creates with every effect on. Run against a fresh dev server (AGENTS.md); compare a
// change's numbers with the baseline's on the same machine.
//
//   BENCH_URL=http://127.0.0.1:5173 CHROME=/path/to/chrome node tests/perf/investigations/effect-pipelines.mjs
//   (CHROME unset: the installed Chrome; SWIFTSHADER=1 adds the software WebGPU flags;
//   PNG_OUT=<folder> saves the PNG exports with every effect on and with none, to compare)
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { swiftShaderArgs } from "../../../playwright.swiftshader.config.js";

const url = process.env.BENCH_URL ?? "http://127.0.0.1:5173";
const args = ["--enable-unsafe-webgpu", ...(process.env.SWIFTSHADER ? swiftShaderArgs : [])];
const browser = await chromium.launch(
  process.env.CHROME ? { executablePath: process.env.CHROME, args } : { channel: "chrome", args },
);
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 2 });
await page.goto(`${url}/examples/solar-system`);
await page.waitForFunction(() => window.__examples?.plot?.whenSettled, null, { timeout: 120000 });
await page.waitForFunction(() =>
  [...document.querySelectorAll(".canvas")].every((canvas) => canvas.getAttribute("aria-busy") === "false"), null, { timeout: 120000 });
await page.evaluate(() => window.__examples.plot.getDiagnostics({ enabled: true }));
await page.getByRole("button", { name: "Pause Date" }).click();

const gpu = () => page.evaluate(() => {
  const d = window.__examples.plot.getDiagnostics();
  return { frame: d.completedFrame, pipelines: d.instrumentation.gpu.pipelines, shaderModules: d.instrumentation.gpu.shaderModules };
});
/** What `action` creates, counted once a frame lands and the plot settles. */
async function count(action, { frame = true } = {}) {
  const before = await gpu();
  await action();
  if (frame) await page.waitForFunction((frame) => window.__examples.plot.getDiagnostics().completedFrame > frame, before.frame, { timeout: 60000 });
  await page.evaluate(() => window.__examples.plot.whenSettled());
  await page.waitForTimeout(500);
  const after = await gpu();
  return `${after.pipelines - before.pipelines} pipelines, ${after.shaderModules - before.shaderModules} modules`;
}
const fog = async (on) => {
  await page.evaluate(() => window.__examples.plot.openSettings());
  const dialog = page.getByRole("dialog", { name: /^Settings/ });
  const box = dialog.getByRole("checkbox", { name: "3D fog" });
  // Its group opens once and stays open.
  await dialog.getByText("View", { exact: true }).waitFor();
  if (!(await box.isVisible())) await dialog.getByText("View", { exact: true }).click();
  if (on) await box.check(); else await box.uncheck();
  await page.evaluate(() => window.__examples.plot.closeSettings());
};
const switches = {
  glow: (on) => (on ? page.getByLabel("Glow").check() : page.getByLabel("Glow").uncheck()),
  sky: (on) => (on ? page.getByLabel("Stars").check() : page.getByLabel("Stars").uncheck()),
  fog,
};
const results = {};
for (const [name, toggle] of Object.entries(switches)) {
  // Fog starts off; the glow and the stars start on.
  const on = name !== "fog";
  const steps = on ? [false, true, false, true] : [true, false, true, false];
  results[name] = [];
  for (const step of steps) results[name].push(`${step ? "on" : "off"}: ${await count(() => toggle(step))}`);
}
await fog(true);
results["PNG export, every effect on"] = [await count(() => page.evaluate(() => window.__examples.plot.exportPNG()), { frame: false })];
results["PNG export again"] = [await count(() => page.evaluate(() => window.__examples.plot.exportPNG()), { frame: false })];
const png = async (name) => {
  const base64 = await page.evaluate(async () => {
    const bytes = new Uint8Array(await (await window.__examples.plot.exportPNG()).arrayBuffer());
    let text = "";
    for (const byte of bytes) text += String.fromCharCode(byte);
    return btoa(text);
  });
  writeFileSync(join(process.env.PNG_OUT, `${name}.png`), Buffer.from(base64, "base64"));
};
if (process.env.PNG_OUT) {
  mkdirSync(process.env.PNG_OUT, { recursive: true });
  await png("every-effect");
  await fog(false);
  await switches.glow(false);
  await switches.sky(false);
  await png("no-effect");
}
results.error = await page.evaluate(() => window.__examples.plot.getRenderError());
console.log(JSON.stringify(results, null, 2));
await browser.close();
