import { test, expect } from "./fixtures.js";
import { installGpuCounters, gpuCounters, countersDelta } from "./gpu-counters.js";

// TODO 17.5: option changes rebuild a mark only when they change its shader graph, and several
// changes from one scale update rebuild it once.
let problems;
test.beforeEach(async ({ page }) => {
  problems = [];
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error") problems.push(`console: ${message.text()}`); });
  await page.addInitScript(installGpuCounters);
  await page.goto("/test/rebuilds");
  await page.waitForFunction(() => ["points", "line", "surface"].every((name) => window.rebuilds?.marks?.[name]?.getMark?.()));
  await page.evaluate(() => window.rebuilds.settle());
  await page.waitForTimeout(300);
  // Count each mark's build() calls on the instance.
  await page.evaluate(() => {
    window.__builds = {};
    for (const [name, handle] of Object.entries(window.rebuilds.marks)) {
      const mark = handle.getMark(), build = mark.build;
      window.__builds[name] = 0;
      mark.build = function (...args) { window.__builds[name]++; return build.apply(this, args); };
    }
  });
});
test.afterEach(() => expect(problems).toEqual([]));

/** Run `change` in the page, let it settle, and return the builds per mark it caused. */
const builds = (page, change) => page.evaluate(async (source) => {
  const before = { ...window.__builds };
  // `fillScale(mark)`: the fill scale in the mark's accepted binding.
  new Function("marks", "fillScale", source)(window.rebuilds.marks, (mark) => mark.view.marks.of(mark).scales.fill);
  await new Promise((resolve) => setTimeout(resolve, 50));
  await window.rebuilds.settle();
  return Object.fromEntries(Object.entries(window.__builds).map(([name, count]) => [name, count - before[name]]));
}, change.toString().replace(/^\(?marks\)?\s*=>\s*\{?|\}?$/g, ""));

test("scale domain, transform and quantize updates rebuild nothing and compile nothing once warm", async ({ page }) => {
  expect(await builds(page, (marks) => { fillScale(marks.points.getMark()).normalization.update({ domain: [1, 80] }); }))
    .toEqual({ points: 0, line: 0, surface: 0 });
  const before = await gpuCounters(page);
  expect(await builds(page, (marks) => {
    const scale = fillScale(marks.points.getMark());
    scale.normalization.update({ transform: "sqrt" });
    scale.update({ quantize: true, levels: 5 });
  })).toEqual({ points: 0, line: 0, surface: 0 });
  expect(await builds(page, (marks) => { fillScale(marks.points.getMark()).normalization.update({ transform: "log" }); }))
    .toEqual({ points: 0, line: 0, surface: 0 });
  const work = await countersDelta(page, before, await gpuCounters(page));
  expect(work.render, JSON.stringify(work)).toBe(0);
});

test("a transform or quantize change reaches the pixels", async ({ page }) => {
  const image = () => page.evaluate(async () => {
    const bitmap = await createImageBitmap(await window.rebuilds.plots.flat.exportPNG());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0); bitmap.close();
    return Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data);
  });
  const changed = (a, b) => { let count = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 24) count++; return count; };
  const linear = await image();
  await builds(page, (marks) => { fillScale(marks.points.getMark()).normalization.update({ transform: "log" }); });
  const log = await image();
  expect(changed(linear, log)).toBeGreaterThan(50);
  await builds(page, (marks) => { fillScale(marks.points.getMark()).update({ quantize: true, levels: 3 }); });
  expect(changed(log, await image())).toBeGreaterThan(50);
  await builds(page, (marks) => {
    const scale = fillScale(marks.points.getMark());
    scale.update({ quantize: false });
    scale.normalization.update({ transform: "linear" });
  });
  expect(changed(linear, await image())).toBe(0);
});

test("curveAlpha rebuilds no Line", async ({ page }) => {
  expect((await builds(page, (marks) => { marks.line.getMark().options.set("curveAlpha", 0.2); })).line).toBe(0);
});

test("a Surface option that is a uniform rebuilds nothing and compiles nothing", async ({ page }) => {
  await builds(page, (marks) => { marks.surface.getMark().options.set("opacity", 0.8); });
  const before = await gpuCounters(page);
  expect((await builds(page, (marks) => { marks.surface.getMark().options.set("opacity", 0.7); })).surface).toBe(0);
  const work = await countersDelta(page, before, await gpuCounters(page));
  expect(work.render, JSON.stringify(work)).toBe(0);
});

test("a Surface option that changes its graph rebuilds once", async ({ page }) => {
  expect((await builds(page, (marks) => { marks.surface.getMark().options.set("lit", true); })).surface).toBe(1);
});
