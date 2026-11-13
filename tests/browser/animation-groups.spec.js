import { test, expect } from "./fixtures.js";

test.describe("scoped group correspondence", () => {
// Set the viewport before page creation; resizing about:blank can stall in Chrome.
test.use({ viewport: { width: 1000, height: 800 } });
test("scoped groups match marks and expression rows while sibling overrides and Data keys stay separate", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => { errors.push(error.message); console.error(error.message); });
  await page.goto("/test/animation-groups");
  await page.waitForFunction(() => window.animationGroups && [...document.querySelectorAll(".canvas")].every((canvas) => canvas.getAttribute("aria-busy") === "false"));
  const result = await page.evaluate(async () => {
    const f = window.animationGroups;
    await f.plot.whenSettled();
    await f.plot.setAnimationTime(0);
    for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame);
    await f.year(1);
    await f.plot.setAnimationTime(500);
    const half = await f.read();
    await f.group("country");
    const reset = await f.read();
    await f.rootGroup("slot");
    const rootReset = await f.read();
    await f.plot.setAnimationTime(750);
    const afterReset = await f.read();
    await f.year(0);
    await f.plot.setAnimationTime(1250);
    const nextHalf = await f.read();
    const svg = await (await f.plot.exportSVG()).blob.text();
    return { half, reset, rootReset, afterReset, nextHalf, svg };
  });
  const near = (rows, expected) => { expect(rows).toHaveLength(expected.length); rows.forEach((x, i) => expect(x).toBeCloseTo(expected[i], 2)); };
  near(result.half.animated, [20, 10]);
  near(result.half.calculated, [20, 10]);
  near(result.half.overridden, [15, 15]);
  near(result.half.fallback, [30, 20]);
  near(result.reset.overridden, [30, 20]);
  near(result.reset.animated, [20, 10]);
  near(result.rootReset.animated, [30, 20]);
  near(result.rootReset.calculated, [30, 20]);
  near(result.afterReset.animated, [30, 20]);
  near(result.nextHalf.animated, [15, 15]);
  near(result.nextHalf.calculated, [15, 15]);
  expect(result.svg).toContain("<circle");
  expect(errors).toEqual([]);
});

});

test("duplicate animation groups report an error only when the unfiltered snapshot is tweened", async ({ page }) => {
  await page.goto("/test/animation-groups");
  await page.waitForFunction(() => window.animationGroups && [...document.querySelectorAll(".canvas")].every((canvas) => canvas.getAttribute("aria-busy") === "false"));
  await page.evaluate(async () => {
    const f = window.animationGroups;
    await f.plot.whenSettled();
    await f.plot.setAnimationTime(0);
    await f.year(null).catch(() => {});
  });
  await expect.poll(() => page.evaluate(() => JSON.stringify(window.animationGroups.plot.listDiagnostics()))).toContain("unique within each tweened snapshot");
  const rows = await page.evaluate(() => window.animationGroups.read());
  expect(rows.animated).toEqual([0, 10]);
});


test("live grouped mark and Calculate tweens complete frames and reach their drawn targets", { tag: ["@gpu", "@timing"] }, async ({ page }) => {
  await page.goto("/test/animation-groups");
  await page.waitForFunction(() => window.animationGroups && [...document.querySelectorAll(".canvas")].every(canvas => canvas.getAttribute("aria-busy") === "false"));
  const before = await page.evaluate(async () => {
    const f = window.animationGroups;
    await f.plot.whenSettled();
    await f.year(1);
    return f.plot.getDiagnostics().completedFrame;
  });
  await expect.poll(() => page.evaluate(() => window.animationGroups.plot.getDiagnostics().completedFrame).then(frame => frame - before)).toBeGreaterThan(5);
  await expect.poll(() => page.evaluate(async () => (await window.animationGroups.read()).animated)).toEqual([30, 20]);
  expect((await page.evaluate(() => window.animationGroups.read())).calculated).toEqual([30, 20]);
  const svg = await page.evaluate(async () => (await (await window.animationGroups.plot.exportSVG()).blob.text()));
  expect(svg).toContain("<circle");
});


test("Tree inputs inherit Plot groups through graph tables and reset with changed node keys", async ({ page }) => {
  await page.goto("/test/animation-groups");
  await page.waitForFunction(() => window.animationGroups?.treePlot && [...document.querySelectorAll(".canvas")].every(canvas => canvas.getAttribute("aria-busy") === "false"));
  const result = await page.evaluate(async () => {
    const f = window.animationGroups;
    await f.treePlot.whenSettled();
    await f.treePlot.setAnimationTime(0);
    await f.tree(1);
    await f.treePlot.setAnimationTime(500);
    const half = await f.readTree();
    await f.treeGroup("id");
    const reset = await f.readTree();
    const svg = await (await f.treePlot.exportSVG()).blob.text();
    return { half, reset, svg };
  });
  expect(result.half).toEqual([1, 7, 5]);
  expect(result.reset).toEqual([1, 9, 7]);
  expect(result.svg.match(/<circle\b/g)).toHaveLength(3);
});
