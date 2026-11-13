import { test, expect } from "./fixtures.js";

const close = (actual, expected, tolerance = 1e-3) => {
  expect(actual.length).toBe(expected.length);
  actual.forEach((value, index) => expect(Math.abs(value - expected[index])).toBeLessThan(tolerance * Math.max(1, Math.abs(expected[index]))));
};

test("per-row transitions blend in scale space and retarget from the current value", async ({ page }) => {
  await page.goto("/test/animation-engine");
  await page.waitForFunction(() => window.animationEngine);
  const result = await page.evaluate(async () => (await import("/tests/browser/animation-fixtures.js")).rowTransitions());
  expect(result.error).toBeUndefined();
  close(result.half, result.expectedHalf);
  // Halfway from 1 to 100 on a log scale is 10 (quad-in at t = .5 is .25: 1 -> 100^.25).
  expect(Math.abs(result.expectedHalf[1] - 100 ** 0.25)).toBeLessThan(1e-3);
  close(result.retargeted, result.expectedRetarget);
  close(result.finished, result.expectedFinished);
});

async function open(page) {
  await page.goto("/test/animation-engine");
  await page.waitForFunction(() => window.animationEngine?.logPoints?.getMark?.()?.fields?.get("position")?.count === 3);
  await page.evaluate(async () => {
    const f = window.animationEngine;
    await Promise.all([f.logPlot, f.tweenPlot, f.orbitPlot, f.keyedPlot, f.rgbPlot].map((plot) => plot.whenSettled()));
  });
}
// Sample a mark's y values together with its transition progress until the transition ends.
const samples = (page, handle, trigger) => page.evaluate(async ({ handle, trigger }) => {
  const f = window.animationEngine;
  f[trigger]();
  const out = [];
  const started = performance.now();
  while (performance.now() - started < 4000) {
    const read = await f.readPosition(f[handle]);
    out.push({ progress: read.progress, y: read.rows.map((row) => row[1]), active: read.active });
    if (out.length > 3 && !read.active) break;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  return out;
}, { handle, trigger });
const midway = (list) => list.find((s) => s.progress !== null && s.progress > 0.35 && s.progress < 0.65);

test("animate() on a log axis passes through the geometric midpoint", { tag: ["@gpu", "@timing"] }, async ({ page }) => {
  await open(page);
  const list = await samples(page, "logPoints", "raiseLog");
  const sample = midway(list);
  expect(sample, JSON.stringify(list.slice(0, 6))).toBeTruthy();
  // 1 -> 100 in log space: y = 100^p, never the linear 1 + 99p.
  const expected = 100 ** sample.progress;
  for (const y of sample.y) {
    expect(Math.abs(y - expected) / expected).toBeLessThan(0.25);
    expect(y).toBeLessThan(1 + 99 * sample.progress - 10);
  }
  expect(list.at(-1).y).toEqual([100, 100, 100]);
});

test("a tween in a Calculate moves the column in raw units, in the pipeline (TODO 28)", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const f = window.animationEngine;
    const ys = async () => (await f.readPosition(f.tweenPoints)).rows.map((row) => row[1]);
    await f.tweenPlot.setAnimationTime(1000);
    f.raiseTween();
    await f.tweenPlot.whenSettled();
    const start = await ys();
    await f.tweenPlot.setAnimationTime(1750);
    const half = await ys();
    await f.tweenPlot.setAnimationTime(2500);
    return { start, half, end: await ys() };
  });
  // doubled = multiply(tween(v), 2): v goes 0 -> 10 linearly over 1.5 s from t = 1000, so doubled
  // is 10 at t = 1750 (the Calculate re-runs with the clock; the mark draws what it publishes).
  expect(result).toEqual({ start: [0, 0, 0], half: [10, 10, 10], end: [20, 20, 20] });
});

test("@time channels keep moving, never block settlement, and freeze for exports", async ({ page }) => {
  await open(page);
  const first = await page.evaluate(async () => (await window.animationEngine.readPosition(window.animationEngine.orbitPoints)).rows);
  await page.waitForTimeout(250);
  const second = await page.evaluate(async () => (await window.animationEngine.readPosition(window.animationEngine.orbitPoints)).rows);
  expect(second).not.toEqual(first);
  const settled = await page.evaluate(async () => {
    const started = performance.now();
    await window.animationEngine.orbitPlot.whenAnimationsFinished();
    return performance.now() - started;
  });
  expect(settled).toBeLessThan(3000);
  const frozen = await page.evaluate(async () => {
    const f = window.animationEngine;
    await f.orbitPlot.setAnimationTime(1000);
    const a = (await f.readPosition(f.orbitPoints)).rows;
    await new Promise((resolve) => setTimeout(resolve, 200));
    const b = (await f.readPosition(f.orbitPoints)).rows;
    await f.orbitPlot.setAnimationTime(1000 + Math.PI * 1000);
    const c = (await f.readPosition(f.orbitPoints)).rows;
    const png = await f.orbitPlot.exportPNG();
    return { a, b, c, png: png.size };
  });
  expect(frozen.b).toEqual(frozen.a);
  // x = r sin(t + i): at t = 1 s and t = 1 s + pi the x values are negated.
  frozen.a.forEach((row, i) => expect(Math.abs(row[0] + frozen.c[i][0])).toBeLessThan(1e-3));
  expect(frozen.png).toBeGreaterThan(0);
});

test("enter and exit values start new rows and retire departing rows at the given value", async ({ page }) => {
  await open(page);
  const list = await samples(page, "keyedPoints", "dropKeyed");
  // At progress 0 nothing has moved yet; take the first sample that is under way.
  const early = list.find((s) => s.progress !== null && s.progress > 0.02 && s.progress < 0.3);
  expect(early, JSON.stringify(list.slice(0, 6))).toBeTruthy();
  // Union order: a, c, d (entering, from 0 towards 5), then b (exiting, from 5 towards 10).
  expect(early.y.length).toBe(4);
  expect(early.y[2]).toBeLessThan(2.5);
  expect(early.y[3]).toBeGreaterThan(5);
  expect(early.y[3]).toBeLessThan(7.5);
  const final = await page.evaluate(async () => {
    const f = window.animationEngine;
    await f.keyedPlot.whenAnimationsFinished();
    await new Promise((resolve) => setTimeout(resolve, 100));
    return (await f.readPosition(f.keyedPoints)).rows.map((row) => row[1]);
  });
  expect(final).toEqual([5, 5, 5]);
});

// 7C A13: the spec is keyed by the channel (fill) while RGB rows live in categoryColor.
test("animate() on an RGB fill blends the colors over its own duration", async ({ page }) => {
  await open(page);
  const list = await page.evaluate(async () => {
    const f = window.animationEngine;
    f.blueRgb();
    const out = [];
    const started = performance.now();
    while (performance.now() - started < 4000) {
      const read = await f.readPosition(f.rgbPoints, "categoryColor");
      out.push({ progress: read.progress, rgb: read.rows, active: read.active });
      if (out.length > 3 && !read.active) break;
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    return out;
  });
  const sample = midway(list);
  expect(sample, JSON.stringify(list.slice(0, 6))).toBeTruthy();
  // Red to blue, linear in the stored (linear-light) components.
  for (const [r, g, b] of sample.rgb) {
    expect(Math.abs(r - (1 - sample.progress))).toBeLessThan(0.15);
    expect(g).toBeLessThan(0.05);
    expect(Math.abs(b - sample.progress)).toBeLessThan(0.15);
  }
  for (const row of list.at(-1).rgb) close(row, [0, 0, 1]);
});

test("RGB animation keeps its schedule through geometry updates and exports its current color", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const f = window.animationEngine, plot = f.rgbPlot;
    const snapshot = async time => {
      await plot.setAnimationTime(time); await plot.whenSettled();
      const rgb = (await f.readPosition(f.rgbPoints, "categoryColor")).rows;
      const { blob } = await plot.exportSVG({ mode: "vector" });
      const svg = new DOMParser().parseFromString(await blob.text(), "image/svg+xml");
      return { rgb, fills: [...svg.querySelectorAll("path[fill],circle[fill]")].map(node => node.getAttribute("fill")) };
    };
    await plot.setAnimationTime(1000);
    f.blueRgb(); await plot.whenSettled();
    const halfway = await snapshot(1750);
    f.moveRgb(); await plot.whenSettled();
    const afterGeometry = await snapshot(2125);
    f.redRgb(); await plot.whenSettled();
    const retargeted = await snapshot(2875), final = await snapshot(3625);
    return { halfway, afterGeometry, retargeted, final };
  });
  for (const [state, expected, color] of [[result.halfway, [0.5, 0, 0.5], "#bc00bc"],
    [result.afterGeometry, [0.25, 0, 0.75], "#8900e1"],
    [result.retargeted, [0.625, 0, 0.375], "#cf00a5"], [result.final, [1, 0, 0], "#ff0000"]]) {
    state.rgb.forEach(row => close(row, expected));
    expect(state.fills.filter(fill => fill === color)).toHaveLength(3);
  }
});

// TODO 132.7: theme.animation {duration: 1500, easing: "linear"} and animation/fade's enter and
// exit reach a Rect that sets only `animation`. With the clocks held, the change starts at
// t = 1000: the entering row from 0 and the departing one from 1; halfway, both at a half. A Rect
// without `animation` (the theme turns nothing on) and one under a nested Theme whose enter and
// exit are false show the new rows at once; a Plot's own animationDuration (3000) beats the theme's.
test("a theme's animation section times keyed changes and fades rows in and out", async ({ page }) => {
  await page.goto("/test/theme-animation");
  await page.waitForFunction(() => window.themeAnimation);
  const result = await page.evaluate(async () => {
    const f = window.themeAnimation, names = ["Themed", "Unanimated", "Cancelled", "PlotDuration"];
    while (!names.every((name) => f.kindMarks[name]?.getMark?.())) await new Promise((resolve) => setTimeout(resolve, 50));
    const at = (time) => Promise.all(names.map((name) => f.kindPlots[name].setAnimationTime(time)));
    const read = async () => Object.fromEntries(await Promise.all(names.map(async (name) => [name, await f.readOpacity(name)])));
    await Promise.all(names.map((name) => f.kindPlots[name].whenSettled()));
    await at(1000);
    f.setKindKeys(["b", "c", "d"]);
    await Promise.all(names.map((name) => f.kindPlots[name].whenSettled()));
    const start = await read();
    await at(1750);
    const half = await read();
    await at(4200);
    return { start, half, end: await read() };
  });
  const near = (values, expected) => values.forEach((value, i) => expect(Math.abs(value - expected[i]), JSON.stringify(result)).toBeLessThan(0.08));
  expect(result.start.Themed.rows).toBe(4);
  near(result.start.Themed.opacity, [1, 1, 0, 1]);
  near(result.half.Themed.opacity, [1, 1, 0.5, 0.5]);
  near(result.half.PlotDuration.opacity, [1, 1, 0.25, 0.75]);
  for (const name of ["Unanimated", "Cancelled"]) {
    expect(result.start[name].rows, name).toBe(3);
    if (result.start[name].opacity) near(result.start[name].opacity, [1, 1, 1]);
  }
  for (const name of ["Themed", "PlotDuration"]) expect(result.end[name].rows, name).toBe(3);
});
