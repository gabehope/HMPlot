import { test, expect } from "./fixtures.js";
import { installGpuCounters, gpuCounters, countersDelta } from "./gpu-counters.js";

// TODO 17.4: Labels and Points3D keep their compiled material across option changes that do not
// change it: an opacity below 1 (the blend decision stays), and a Label's align (a uniform).
let problems;
test.beforeEach(async ({ page }) => {
  problems = [];
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error") problems.push(`console: ${message.text()}`); });
  await page.addInitScript(installGpuCounters);
  await page.goto("/test/label-options");
  await page.waitForFunction(() => window.labelOptions?.marks?.labels?.getMark?.() && window.labelOptions.marks.points?.getMark?.() && window.labelOptions.marks.text);
  await page.evaluate(() => window.labelOptions.settle());
  await page.waitForTimeout(300);
  // Count each mark's build() calls on the instance (refreshBlend calls this.build()).
  await page.evaluate(() => {
    window.__builds = {};
    for (const [name, handle] of Object.entries(window.labelOptions.marks)) {
      const mark = handle.getMark?.();
      if (!mark?.build) continue;
      const build = mark.build;
      window.__builds[name] = 0;
      mark.build = function (...args) { window.__builds[name]++; return build.apply(this, args); };
    }
  });
});
test.afterEach(() => expect(problems).toEqual([]));

const apply = (page, values) => page.evaluate(async (v) => {
  window.labelOptions.set(v);
  await new Promise((resolve) => setTimeout(resolve, 50));
  await window.labelOptions.settle();
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}, values);
const builds = (page) => page.evaluate(() => ({ ...window.__builds }));
/** Pixels of a plot's PNG export, as RGBA bytes. */
const pixels = (page, name) => page.evaluate(async (name) => {
  const bitmap = await createImageBitmap(await window.labelOptions.plots[name].exportPNG());
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), context = canvas.getContext("2d");
  context.drawImage(bitmap, 0, 0); bitmap.close();
  return Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data);
}, name);
const changed = (a, b) => { let count = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 24) count++; return count; };

test("an opacity change below 1 rebuilds no Label and no Points3D, and compiles nothing", async ({ page }) => {
  const before = await gpuCounters(page), start = await builds(page);
  await apply(page, { opacity: 0.8 });
  await apply(page, { opacity: 0.6 });
  const work = await countersDelta(page, before, await gpuCounters(page)), end = await builds(page);
  expect(end, JSON.stringify({ start, end })).toEqual(start);
  expect(work.render, JSON.stringify(work)).toBe(0);
});

test("align moves Text without a rebuild", async ({ page }) => {
  const centered = await pixels(page, "labels"), start = await builds(page);
  await apply(page, { align: "left" });
  const left = await pixels(page, "labels");
  await apply(page, { align: "right" });
  const right = await pixels(page, "labels");
  expect(await builds(page)).toEqual(start);
  expect(changed(centered, left)).toBeGreaterThan(200);
  expect(changed(left, right)).toBeGreaterThan(200);
  await apply(page, { align: "center" });
  expect(changed(centered, await pixels(page, "labels"))).toBe(0);
});

test("moving Text retains its glyph fields while changed content updates the rendered labels", async ({ page }) => {
  const initial = await pixels(page, "labels");
  await page.evaluate(() => {
    const mark = window.labelOptions.marks.labels.getLegendSource().guideMark();
    window.__textPayload = [mark.fields.get("textCode").lastRequest.data, mark.fields.get("textWidth").lastRequest.data];
  });
  let before = await gpuCounters(page);
  await apply(page, { labelOffset: 0.1 });
  let work = await countersDelta(page, before, await gpuCounters(page));
  expect(work.render, JSON.stringify(work)).toBe(0);
  expect(await page.evaluate(() => {
    const mark = window.labelOptions.marks.labels.getLegendSource().guideMark();
    return ["textCode", "textWidth"].map((key, i) => mark.fields.get(key).lastRequest.data === window.__textPayload[i]);
  })).toEqual([true, true]);
  const shifted = await pixels(page, "labels");
  expect(changed(initial, shifted)).toBeGreaterThan(200);
  before = await gpuCounters(page);
  await apply(page, { labelNames: Array.from({ length: 12 }, (_, i) => i ? `label ${i}` : "Changed label") });
  work = await countersDelta(page, before, await gpuCounters(page));
  expect(work.render, JSON.stringify(work)).toBe(0);
  expect(changed(shifted, await pixels(page, "labels"))).toBeGreaterThan(20);
  // Fresh export targets have their own pipelines; the update counts above exclude exports.
  // This mixed fixture's Text3D title uses a separate hybrid-export raster pass.
  const visible = await page.evaluate(async () => {
    const mark = window.labelOptions.marks.labels.getLegendSource().guideMark();
    const { blob } = await window.labelOptions.plots.labels.exportSVG({ mode: "auto" });
    return { codeChanged: mark.fields.get("textCode").lastRequest.data !== window.__textPayload[0],
      svg: await blob.text() };
  });
  expect(visible.codeChanged).toBe(true);
  expect(visible.svg).toContain("Changed label");
});

// Exports render on a transparent background, so the blend mode shows in the material, not
// in exported pixels. (Before 17.4 a Label rebuilt on `blend` and kept normal blending.)
test("blend composites Labels", async ({ page }) => {
  const state = () => page.evaluate(() => { const m = window.labelOptions.marks.labels.getMark().material; return [m.blending, m.transparent]; });
  expect(await state()).toEqual([1, true]);
  await apply(page, { blend: "additive" });
  expect(await state()).toEqual([2, true]);
  await apply(page, { blend: "normal" });
  expect(await state()).toEqual([1, true]);
});

test("a spherical Text3D moves and resizes without compiling (17.4)", async ({ page }) => {
  await apply(page, { textPosition: [40, 10, 0], textSize: 7 });
  const before = await gpuCounters(page);
  await apply(page, { textPosition: [-60, 35, 0] });
  await apply(page, { textSize: 9 });
  const work = await countersDelta(page, before, await gpuCounters(page));
  expect(work.render, JSON.stringify(work)).toBe(0);
});

test("a flat Text3D's new content swaps geometry without compiling (17.4)", async ({ page }) => {
  await apply(page, { title: "Labels, warm" });
  const warm = await pixels(page, "labels");
  const before = await gpuCounters(page);
  await apply(page, { title: "Other words entirely" });
  await apply(page, { title: "x" });
  const work = await countersDelta(page, before, await gpuCounters(page));
  expect(work.render, JSON.stringify(work)).toBe(0);
  expect(changed(warm, await pixels(page, "labels"))).toBeGreaterThan(10);
});
