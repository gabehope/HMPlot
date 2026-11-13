import { test, expect } from "./fixtures.js";
import { installGpuCounters, countMarkBuilds, gpuCounters, countersDelta } from "./gpu-counters.js";

test.beforeEach(async ({ page }) => page.addInitScript(installGpuCounters));

async function open(page, scene) {
  await page.goto(`/test/stage14-embedded-domains?scene=${scene}`);
  await page.waitForFunction(() => window.stage14EmbeddedDomains?.plot?.whenSettled &&
    window.stage14EmbeddedDomains?.child?.getFrameOptions);
  await expect.poll(() => page.evaluate(() =>
    [...document.querySelectorAll(".canvas")].every((canvas) => canvas.getAttribute("aria-busy") === "false")))
    .toBe(true);
}

/** The child's resolved domain and range, its points and line vertices in the
 *  vector export, and the tick labels its guides draw. */
const read = (page) => page.evaluate(async () => {
  const { plot, child } = window.stage14EmbeddedDomains;
  await plot.whenSettled();
  const output = await plot.exportSVG({ mode: "vector" });
  const svg = new DOMParser().parseFromString(await output.blob.text(), "image/svg+xml");
  const options = child.getFrameOptions();
  return {
    error: plot.getRenderError(),
    domain: { x: options.get("xbounds"), y: options.get("ybounds") },
    range: { x: options.get("_frameXRange"), y: options.get("_frameYRange") },
    points: [...svg.querySelectorAll("circle")].map((circle) =>
      [Number(circle.getAttribute("cx")), Number(circle.getAttribute("cy"))]),
    starts: [...svg.querySelectorAll('path[stroke="#2050d0"]')].map((path) =>
      path.getAttribute("d").match(/^M\s*([-\d.e]+)[ ,]([-\d.e]+)/).slice(1).map(Number)),
    labels: [...document.querySelectorAll("svg.axes text")].map((text) => text.textContent),
  };
});

// An auto domain pads the data extent by 4% on each side.
const fitted = (values) => {
  const low = Math.min(...values), high = Math.max(...values), pad = (high - low) * 0.04;
  return [low - pad, high + pad];
};
// A child coordinate in its parent's source units: through its domain onto its range.
const embed = (value, domain, range) =>
  range[0] + (value - domain[0]) / (domain[1] - domain[0]) * (range[1] - range[0]);

// The Cartesian root spans [0, 10] on a 400 px square, with no axes.
const cartesian = ([x, y]) => [x * 40, 400 - y * 40];
// The polar root: 24 angle units a turn from +x counter-clockwise, radius 10
// over 200 px from the center.
const polar = ([angle, radius]) => {
  const theta = angle / 24 * 2 * Math.PI;
  return [200 + radius * 20 * Math.cos(theta), 200 - radius * 20 * Math.sin(theta)];
};

function expectPlaced(state, points, toPixels) {
  const { domain, range } = state;
  const expected = points.map(([x, y]) =>
    toPixels([embed(x, domain.x, range.x), embed(y, domain.y, range.y)]));
  expect(state.points.length).toBe(points.length);
  for (const [k, [x, y]] of expected.entries()) {
    expect(Math.abs(state.points[k][0] - x), `point ${k}`).toBeLessThan(0.5);
    expect(Math.abs(state.points[k][1] - y), `point ${k}`).toBeLessThan(0.5);
  }
  // Each Line segment starts at its first point.
  for (const [k, start] of state.starts.entries()) {
    expect(Math.abs(start[0] - expected[k][0]), `line ${k}`).toBeLessThan(0.5);
    expect(Math.abs(start[1] - expected[k][1]), `line ${k}`).toBeLessThan(0.5);
  }
}

for (const [scene, toPixels] of [["cartesian", cartesian], ["polar", polar]]) {
  test(`a ranged child in a ${scene} root fits its own data, follows data, range and domain edits without rebuilding`, async ({ page }) => {
    await open(page, scene);
    const initial = await read(page);
    expect(initial.error).toBe("");
    const points = [[1, 10], [3, 30]];
    expect(initial.domain.x[0]).toBeCloseTo(fitted([1, 3])[0], 6);
    expect(initial.domain.x[1]).toBeCloseTo(fitted([1, 3])[1], 6);
    expect(initial.domain.y[0]).toBeCloseTo(fitted([10, 30])[0], 6);
    expect(initial.domain.y[1]).toBeCloseTo(fitted([10, 30])[1], 6);
    expect(initial.range).toEqual({ x: [2, 6], y: [2, 6] });
    expectPlaced(initial, points, toPixels);
    // The child's guides label its own fitted domain.
    expect(initial.labels).toEqual(expect.arrayContaining(["10", "30"]));

    // New data refits the auto domain: a third point widens X, and the
    // first point keeps its place only because Y's extent is unchanged.
    const more = [[1, 10], [3, 30], [9, 20]];
    await page.evaluate((value) => window.stage14EmbeddedDomains.setPoints(value), more);
    await expect.poll(async () => (await read(page)).domain.x[1]).toBeCloseTo(fitted([1, 9])[1], 6);
    const refit = await read(page);
    expect(refit.error).toBe("");
    expect(refit.domain.y[0]).toBeCloseTo(fitted([10, 30])[0], 6);
    expectPlaced(refit, more, toPixels);
    expect(refit.labels).toContain("5");

    // Numeric range and domain edits move the child's marks and guides with
    // no new mark build, pipeline or compute work. Switching between a fitted
    // and an explicit domain is set up outside the count: the marks start or
    // stop collecting their data extents, which re-prepares them once.
    await page.evaluate(() => window.stage14EmbeddedDomains.setDomain([0, 10], [0, 100]));
    await expect.poll(async () => (await read(page)).domain).toEqual({ x: [0, 10], y: [0, 100] });
    const explicit = await read(page);
    expect(explicit.error).toBe("");
    expectPlaced(explicit, more, toPixels);
    expect(explicit.labels).toContain("100");
    await page.waitForTimeout(150);
    await countMarkBuilds(page);
    const before = await gpuCounters(page);
    await page.evaluate(() => window.stage14EmbeddedDomains.setRange([4, 8], [1, 9]));
    await expect.poll(async () => (await read(page)).range).toEqual({ x: [4, 8], y: [1, 9] });
    expectPlaced(await read(page), more, toPixels);
    await page.evaluate(() => window.stage14EmbeddedDomains.setDomain([0, 12], [0, 90]));
    await expect.poll(async () => (await read(page)).domain).toEqual({ x: [0, 12], y: [0, 90] });
    expectPlaced(await read(page), more, toPixels);
    await page.waitForTimeout(150);
    const work = await countersDelta(page, before, await gpuCounters(page));
    expect(work.builds, JSON.stringify(work)).toBe(0);
    expect(work.compute, JSON.stringify(work)).toBe(0);
    // Clearing the explicit domain returns to the fitted one, in the new range.
    await page.evaluate(() => window.stage14EmbeddedDomains.setDomain(null, null));
    await expect.poll(async () => (await read(page)).domain.x[1]).toBeCloseTo(fitted([1, 9])[1], 6);
    const cleared = await read(page);
    expect(cleared.error).toBe("");
    expectPlaced(cleared, more, toPixels);
  });
}
